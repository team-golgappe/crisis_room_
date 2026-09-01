"""
Orchestrator - sequences the 4 agents and yields AgentEvent objects as soon
as each one is produced (not batched at the end). The FastAPI WebSocket
layer just forwards whatever this generator yields straight to the frontend.

Flow (per the brief):
Incident Signal -> Triage -> Investigator -> Commander -> Communicator -> resolved
Communicator fires twice: once right after Triage (so stakeholders aren't
left in silence while root-cause work happens) and again after Commander
decides. Silence during a live incident is itself a failure mode.

After the Commander decides, two more things happen - both are clearly
labeled to the dashboard as distinct from the diagnosis itself:

  1. The decision is handed to a RemediationExecutor
     (integrations/executor.py). Ships as a no-op that logs what *would*
     run - see that file for why, and for the seam a real company plugs
     their own infra automation into.
  2. A SIMULATED recovery curve streams from agents/executor.py, showing
     what the error rate would look like recovering if that action is
     carried out. Explicitly labeled as a simulation, not a measurement.
"""
from __future__ import annotations

import time
from collections.abc import AsyncIterator

from agents import commander, communicator, investigator, triage
from agents.executor import simulate_recovery
from agents.models import AgentEvent, IncidentSignal
from integrations.executor import RemediationExecutor, get_executor


async def run_incident(
    signal: IncidentSignal,
    *,
    executor: RemediationExecutor | None = None,
) -> AsyncIterator[AgentEvent]:
    """`executor` lets a caller pick the execution backend for this one run
    (the authenticated monitor path passes a RealTargetExecutor). When it's
    None — every /console demo call — the process-wide `get_executor()` is
    used exactly as before."""
    incident_id = signal.incident_id

    yield AgentEvent(
        agent="system",
        incident_id=incident_id,
        event_type="started",
        reasoning_trace=f"Incident signal received from {signal.source}: {signal.title} on {signal.service}.",
        output=signal.model_dump(),
    )

    # --- Triage ---
    t0 = time.perf_counter()
    triage_out, triage_trace = triage.run(signal)
    yield AgentEvent(
        agent="triage",
        incident_id=incident_id,
        event_type="output",
        output=triage_out.model_dump(mode="json"),
        reasoning_trace=triage_trace,
        latency_ms=int((time.perf_counter() - t0) * 1000),
    )

    # --- Communicator: first pass, "we're on it" (fires immediately, not silent) ---
    t0 = time.perf_counter()
    comms_early, comms_early_trace = communicator.run(signal, triage_out, investigator_placeholder_hint(), None)
    yield AgentEvent(
        agent="communicator",
        incident_id=incident_id,
        event_type="output",
        output=comms_early.model_dump(mode="json"),
        reasoning_trace=f"[initial notice] {comms_early_trace}",
        latency_ms=int((time.perf_counter() - t0) * 1000),
    )

    # --- Investigator ---
    t0 = time.perf_counter()
    investigator_out, investigator_trace = investigator.run(signal, triage_out)
    yield AgentEvent(
        agent="investigator",
        incident_id=incident_id,
        event_type="output",
        output=investigator_out.model_dump(mode="json"),
        reasoning_trace=investigator_trace,
        latency_ms=int((time.perf_counter() - t0) * 1000),
    )

    # --- Commander ---
    t0 = time.perf_counter()
    commander_out, commander_trace = commander.run(signal, triage_out, investigator_out)
    yield AgentEvent(
        agent="commander",
        incident_id=incident_id,
        event_type="output",
        output=commander_out.model_dump(mode="json"),
        reasoning_trace=commander_trace,
        latency_ms=int((time.perf_counter() - t0) * 1000),
    )

    # --- Execution seam: hand the decision to whatever executor is configured ---
    # MockInfraExecutor by default (see integrations/executor.py) - actually
    # applies the action to a sandboxed target service this build owns, and
    # streams that service's REAL recovery. Set CRISIS_ROOM_EXECUTOR=noop
    # for recommend-only mode with no automation at all.
    executor = executor or get_executor()
    execution_result = await executor.execute(signal, commander_out)
    yield AgentEvent(
        agent="commander",
        incident_id=incident_id,
        event_type="execution",
        output=execution_result,
        reasoning_trace=(
            f"Execution: {execution_result.get('reason')}"
            if not execution_result.get("executed")
            else f"Executed {execution_result.get('action')}: {execution_result.get('detail')}"
        ),
    )

    # --- Recovery: real if the executor has a live target, simulated otherwise ---
    got_real_ticks = False
    async for tick in executor.stream_recovery(signal, commander_out):
        got_real_ticks = True
        yield AgentEvent(
            agent="executor",
            incident_id=incident_id,
            event_type="recovery_tick",
            output={**tick, "is_simulation": False},
            reasoning_trace=(
                f"[live] t+{tick['t_seconds']}s: error rate on the sandboxed target -> {tick['error_rate_pct']}% "
                f"after {commander_out.action.value} was actually applied."
            ),
        )

    if not got_real_ticks:
        # NOT a real infra action - see agents/executor.py. Only reached if
        # the configured executor has no live target to report on.
        for tick in simulate_recovery(signal, commander_out):
            yield AgentEvent(
                agent="executor",
                incident_id=incident_id,
                event_type="recovery_tick",
                output={**tick.model_dump(mode="json"), "is_simulation": True},
                reasoning_trace=(
                    f"[simulated] tick {tick.tick}: projected error rate -> {tick.error_rate_pct}% "
                    f"following {commander_out.action.value}. No real system was modified."
                ),
            )

    # --- Communicator: second pass, resolution update ---
    t0 = time.perf_counter()
    comms_final, comms_final_trace = communicator.run(signal, triage_out, investigator_out, commander_out)
    yield AgentEvent(
        agent="communicator",
        incident_id=incident_id,
        event_type="output",
        output=comms_final.model_dump(mode="json"),
        reasoning_trace=f"[resolution notice] {comms_final_trace}",
        latency_ms=int((time.perf_counter() - t0) * 1000),
    )

    yield AgentEvent(
        agent="system",
        incident_id=incident_id,
        event_type="incident_resolved",
        reasoning_trace=(
            f"Incident {incident_id} diagnosed; remediation recommended: {commander_out.action.value}. "
            f"{'Executed automatically against the target service - see execution and recovery detail above.' if execution_result.get('executed') else 'Awaiting execution by a human or a connected infra integration.'} "
            f"Next stakeholder update in {comms_final.next_update_in_min}min."
        ),
    )


def investigator_placeholder_hint():
    """The early communicator pass runs before the Investigator has a
    hypothesis - it only needs something with a `.hypothesis`/`.evidence`
    attribute for the prompt/fallback to reference, so we hand it a minimal
    stand-in rather than restructuring communicator's signature for one
    early call."""
    from agents.models import InvestigatorOutput

    return InvestigatorOutput(
        hypothesis="investigation in progress", evidence=["root-cause analysis has not completed yet"], confidence=0.0
    )
