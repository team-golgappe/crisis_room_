"""
Runs one real (non-demo) incident through the existing 4-agent pipeline and
persists every AgentEvent as it streams, tagged to the user + site whose
monitor produced it.

This is the authenticated-area equivalent of server/main.py's
`_run_and_broadcast` — same `orchestrator.run_incident()`, but it writes to
the database instead of an in-memory dict, and it never touches /ws/live.
"""
from __future__ import annotations

import logging

from agents.models import IncidentSignal
from config import settings
from db.database import session_scope
from integrations.executor import RealTargetExecutor
from orchestrator.orchestrator import run_incident
from persistence import incidents as store

log = logging.getLogger("crisis_room.monitor")

# Phase 4 fills this in: fire EmailNotifier / SlackNotifier on a real resolve.
try:  # pragma: no cover - optional until Phase 4 lands
    from integrations.notifiers import notify_on_resolution
except ImportError:
    async def notify_on_resolution(*_args, **_kwargs) -> dict | None:  # type: ignore
        return None


def _extract_resolution(events: list[dict]) -> dict:
    """Pull the Commander decision + Communicator's final messages out of the
    streamed events, for a compact `incidents.resolution` summary."""
    resolution: dict = {}
    communicator_passes: list[dict] = []
    for ev in events:
        if ev.get("agent") == "commander" and ev.get("event_type") == "output" and ev.get("output"):
            resolution["decision"] = ev["output"]
        if ev.get("agent") == "commander" and ev.get("event_type") == "execution" and ev.get("output"):
            resolution["execution"] = ev["output"]
        if ev.get("agent") == "triage" and ev.get("event_type") == "output" and ev.get("output"):
            resolution["severity"] = ev["output"].get("severity")
        if ev.get("agent") == "investigator" and ev.get("event_type") == "output" and ev.get("output"):
            resolution["root_cause"] = ev["output"].get("hypothesis")
        if ev.get("agent") == "communicator" and ev.get("event_type") == "output" and ev.get("output"):
            communicator_passes.append(ev["output"])
    if communicator_passes:
        resolution["final_update"] = communicator_passes[-1]
    return resolution


# recovery is considered real only once the measured error rate on the target
# has come down to at or below this
_RECOVERED_ERROR_RATE_PCT = 10.0


def _terminal_status(events: list[dict]) -> str:
    """Decide the honest end state of the incident from what actually
    happened, not just from the pipeline finishing.

      resolved           - a real remediation ran AND the target recovered
      mitigation_failed  - a real remediation ran but the target is still degraded
                           (wrong action, or the cause is outside our control)
      awaiting_execution - no control plane carried the fix out; the recovery
                           shown is a projection, so we can't claim resolution
    """
    execution: dict | None = None
    real_ticks: list[dict] = []
    saw_simulated_tick = False
    for ev in events:
        if ev.get("event_type") == "execution":
            execution = ev.get("output") or {}
        elif ev.get("event_type") == "recovery_tick" and ev.get("output"):
            tick = ev["output"]
            if tick.get("is_simulation"):
                saw_simulated_tick = True
            else:
                real_ticks.append(tick)

    executed = bool(execution and execution.get("executed"))
    if not executed:
        # NoopExecutor, or RealTargetExecutor with no control plane for this URL
        return "awaiting_execution"
    if saw_simulated_tick and not real_ticks:
        return "awaiting_execution"

    # Measured reality wins. If we have real recovery ticks off the target,
    # the last one is the truth — regardless of whether this particular
    # remediate call took credit for the fix (a concurrent pipeline may have
    # already applied it, leaving this one a no-op with effective=false).
    last_rate = real_ticks[-1].get("error_rate_pct") if real_ticks else None
    if last_rate is not None:
        return "resolved" if last_rate <= _RECOVERED_ERROR_RATE_PCT else "mitigation_failed"

    # No measurement to go on — fall back to the executor's own verdict.
    if execution is not None and execution.get("effective") is False:
        return "mitigation_failed"

    return "resolved"


async def run_and_persist_incident(
    signal: IncidentSignal,
    *,
    user_id: int,
    site_id: int | None,
    monitored_url: str | None = None,
) -> str:
    """Create the Incident row, stream the pipeline into incident_events, and
    on resolve write the resolution summary + fire notifiers. Returns the
    incident_id.

    Execution backend: RealTargetExecutor. If `monitored_url` is the demo
    target service it carries out a real remediation and reports real
    recovery; for any other URL it reports recommend-only and the
    orchestrator falls back to the labeled projection."""
    executor = RealTargetExecutor(monitored_url) if settings.enable_demo_target else None

    db = session_scope()
    seen: list[dict] = []
    try:
        store.create_incident(db, signal=signal, user_id=user_id, site_id=site_id)
        log.info("monitor incident %s started for user=%s site=%s", signal.incident_id, user_id, site_id)

        seq = 0
        async for event in run_incident(signal, executor=executor):
            store.append_event(db, event, seq)
            seen.append(event.model_dump(mode="json"))
            seq += 1

        resolution = _extract_resolution(seen)
        status = _terminal_status(seen)
        store.set_resolution(db, signal.incident_id, resolution, status=status)
        log.info("monitor incident %s finished: %s", signal.incident_id, status)
    except Exception:
        log.exception("monitor incident %s failed mid-pipeline", signal.incident_id)
        raise
    finally:
        db.close()

    # Phase 4: deliver the resolution report to whatever the user configured.
    try:
        await notify_on_resolution(signal.incident_id, user_id=user_id)
    except Exception:  # noqa: BLE001
        log.exception("notifier failed for incident %s", signal.incident_id)

    return signal.incident_id
