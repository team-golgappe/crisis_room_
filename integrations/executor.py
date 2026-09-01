"""
Remediation EXECUTION layer — the seam between "the AI decided" and
"the fix actually happened."

Crisis Room DOES execute its recommended remediation automatically, by
default, in this build. What it executes against is a sandboxed target
service this build actually owns (integrations/mock_infra.py) rather than
a customer's real production infrastructure — this build has no real
cloud credentials to point at, and faking that connection would be
dishonest regardless of how convincing it looked in a demo.

What's genuinely real here: the full loop — decide, execute, confirm
recovery — proven end to end against a target Crisis Room actually
controls. The recovery you see in the dashboard is a real state change
from a real function call, not a precomputed curve (compare
agents/executor.py, which is the honest fallback for when no real target
is available at all).

Adopting this for real production infrastructure is a one-file change:
implement `RemediationExecutor` against a real Kubernetes/cloud/deploy
API (see the `KubernetesExecutor` sketch below) and swap it in via
`get_executor()`. Nothing upstream — the 4 agents, the orchestrator, the
dashboard — has to change, because they only ever talk to this interface.
Most real deployments would gate that class behind a human approval step
before it's allowed to call anything, since that's what enterprises
require for production changes regardless of who initiates them - this
build's own competitive-advantage slide argues exactly that.
"""
from __future__ import annotations

import asyncio
import os
import time
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from agents.models import CommanderOutput, IncidentSignal
from integrations import mock_infra


class RemediationExecutor(ABC):
    @abstractmethod
    async def execute(self, signal: IncidentSignal, decision: CommanderOutput) -> dict:
        """Carry out (or refuse to carry out) the Commander's recommended
        action. Must return quickly with a dict containing at least
        `executed: bool`, so the orchestrator and dashboard can render the
        outcome honestly."""
        raise NotImplementedError

    async def stream_recovery(self, signal: IncidentSignal, decision: CommanderOutput) -> AsyncIterator[dict]:
        """Optional: yield REAL recovery ticks (`t_seconds`, `error_rate_pct`)
        as they actually happen, if this executor has a live target to
        report on. Default: none available - the orchestrator falls back
        to the clearly-labeled simulation in agents/executor.py instead."""
        return
        yield  # pragma: no cover - keeps this an async generator with no items


class NoopExecutor(RemediationExecutor):
    """Recommend-only mode: logs what would run and touches nothing. Set
    CRISIS_ROOM_EXECUTOR=noop to use this instead of the default sandboxed
    execution below - useful for a company that wants Crisis Room purely
    as a decision-support copilot with no automation at all."""

    async def execute(self, signal: IncidentSignal, decision: CommanderOutput) -> dict:
        return {
            "executed": False,
            "would_have_run": decision.action.value,
            "reason": "Execution disabled (CRISIS_ROOM_EXECUTOR=noop) - Commander recommends, a human or a connected infra integration executes.",
        }


class MockInfraExecutor(RemediationExecutor):
    """Ships as the default. Actually applies the Commander's action to a
    sandboxed target service this build owns (integrations/mock_infra.py)
    and streams that service's real recovery back to the dashboard."""

    async def execute(self, signal: IncidentSignal, decision: CommanderOutput) -> dict:
        mock_infra.create_service(signal.incident_id, signal.error_rate_pct)
        return {
            "executed": True,
            "action": decision.action.value,
            "detail": (
                f"Applied '{decision.action.value}' to a sandboxed target service standing in for {signal.service}. "
                f"Recovery is being tracked live below - this is a real state change from a real action call, "
                f"scoped to a target this build controls rather than real production infrastructure."
            ),
        }

    async def stream_recovery(self, signal: IncidentSignal, decision: CommanderOutput) -> AsyncIterator[dict]:
        async for tick in mock_infra.apply_action(signal.incident_id, decision.action):
            yield tick


class RealTargetExecutor(RemediationExecutor):
    """Executes against integrations/target_service.py over its real HTTP
    control API — a real service with real faults and real fixes.

    Only acts when this incident is actually for that target (the monitored
    URL points at it). For any other URL it honestly reports that no infra
    control plane is connected and yields no recovery ticks, so the
    orchestrator falls back to the clearly-labeled projection in
    agents/executor.py. Nothing is faked as "fixed".

    Constructed per-incident by the authenticated monitor path; the /console
    demo never uses it.
    """

    def __init__(self, monitored_url: str | None = None):
        from config import settings

        self.base = settings.demo_target_base_url.rstrip("/")
        self.monitored_url = (monitored_url or "").rstrip("/")
        self.controls_target = self.monitored_url.startswith(f"{self.base}/api/target")

    async def execute(self, signal: IncidentSignal, decision: CommanderOutput) -> dict:
        if not self.controls_target:
            return {
                "executed": False,
                "would_have_run": decision.action.value,
                "reason": (
                    f"No infra control plane connected for {signal.service}. Diagnosis and the "
                    f"remediation decision ({decision.action.value}) are complete; a connected "
                    f"integration (Kubernetes / Docker / cloud API) would carry it out. "
                    f"Recovery below is a projection, not a measurement."
                ),
            }

        import httpx

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{self.base}/api/target/_control/remediate",
                    json={"action": decision.action.value},
                )
                resp.raise_for_status()
                result = resp.json()
        except httpx.HTTPError as exc:
            return {"executed": False, "reason": f"control API call failed: {exc!s}"}

        if result.get("effective"):
            detail = "; ".join(result.get("changed", []))
        else:
            detail = (
                f"'{decision.action.value}' was applied to the target service but changed nothing — "
                f"it does not address this fault. Recovery below is the real, unchanged error rate."
            )
        return {
            "executed": True,
            "action": decision.action.value,
            "effective": bool(result.get("effective")),
            "detail": f"POST {self.base}/api/target/_control/remediate → {detail}.",
        }

    async def stream_recovery(self, signal: IncidentSignal, decision: CommanderOutput) -> AsyncIterator[dict]:
        if not self.controls_target:
            return

        import httpx

        window: list[bool] = []
        start = time.monotonic()
        async with httpx.AsyncClient(timeout=12.0) as client:
            for _ in range(8):
                await asyncio.sleep(1.3)
                try:
                    r = await client.get(f"{self.base}/api/target/")
                    ok = r.status_code < 400
                except httpx.HTTPError:
                    ok = False
                window.append(ok)
                del window[:-5]
                error_rate = 100.0 * (1 - sum(window) / len(window))
                yield {
                    "t_seconds": round(time.monotonic() - start, 1),
                    "error_rate_pct": round(error_rate, 1),
                }
                if len(window) >= 3 and error_rate == 0.0:
                    break


# --- Reference sketch of a real production integration (NOT wired in) ---
#
# class KubernetesExecutor(RemediationExecutor):
#     def __init__(self, k8s_client, namespace: str):
#         self.k8s_client = k8s_client
#         self.namespace = namespace
#
#     async def execute(self, signal: IncidentSignal, decision: CommanderOutput) -> dict:
#         if decision.action == RemediationAction.SCALE:
#             await self.k8s_client.scale_deployment(self.namespace, replicas=+2)
#             return {"executed": True, "action": "scale", "detail": "scaled +2 replicas"}
#         if decision.action == RemediationAction.ROLLBACK:
#             await self.k8s_client.rollback_deployment(self.namespace)
#             return {"executed": True, "action": "rollback", "detail": "reverted to previous revision"}
#         return {"executed": False, "reason": f"no handler wired for {decision.action.value}"}
#
#     async def stream_recovery(self, signal, decision):
#         async for metrics in self.k8s_client.watch_error_rate(self.namespace):
#             yield {"t_seconds": metrics.elapsed, "error_rate_pct": metrics.error_rate_pct}


def get_executor(mode: str | None = None) -> RemediationExecutor:
    """The process-wide executor for callers that don't pass their own
    (i.e. every /console demo run). CRISIS_ROOM_EXECUTOR=noop for
    recommend-only mode; default is the sandboxed MockInfraExecutor.

    The authenticated monitor path does NOT use this — it constructs a
    RealTargetExecutor per incident and passes it to run_incident(). Swap in
    a real production executor here once one is implemented."""
    mode = mode or os.environ.get("CRISIS_ROOM_EXECUTOR", "mock_infra")
    if mode == "noop":
        return NoopExecutor()
    if mode == "real_target":
        return RealTargetExecutor()
    return MockInfraExecutor()
