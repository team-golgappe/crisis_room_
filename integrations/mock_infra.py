"""
A real, live target Crisis Room actually controls — this is what turns
"recommends a fix" into "recommends AND fixes it."

Each incident gets a MockService seeded with the real error rate from the
incoming signal. When the Commander's action is executed, this object's
state genuinely changes and recovers over real wall-clock time via an
async generator that sleeps and mutates on every tick — the dashboard's
recovery chart is reading real object state as it's produced, not a
precomputed curve.

Why a sandboxed service and not a customer's real production system: this
build has no real infrastructure credentials to point at, and fabricating
that connection would be dishonest regardless of how convincing the demo
looked. What's real here is the automation loop itself — decide, execute,
confirm recovery — proven against a target this build actually owns.
Pointing that same loop at real infrastructure is a one-file change: swap
`MockInfraExecutor` in integrations/executor.py for a class that calls a
real Kubernetes/cloud/deploy-pipeline API instead of mutating this object.
Nothing upstream (agents, orchestrator, dashboard) has to change, because
they only ever talk to the `RemediationExecutor` interface.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

from agents.models import RemediationAction

# How much of the gap to a healthy baseline each action closes per tick -
# a rough reflection of how fast that class of fix actually shows results
# in a real system. Faster actions (restart, failover) close the gap
# quickly; slower ones (escalate, which waits on a human; monitor, which
# takes no corrective action at all) close it much more slowly.
_RECOVERY_FRACTION_PER_TICK = {
    RemediationAction.RESTART: 0.5,
    RemediationAction.ROLLBACK: 0.42,
    RemediationAction.SCALE: 0.35,
    RemediationAction.FAILOVER: 0.55,
    RemediationAction.ESCALATE: 0.08,
    RemediationAction.MONITOR: 0.03,
}

_HEALTHY_FLOOR_PCT = 0.2  # never claims literally zero errors


@dataclass
class MockService:
    incident_id: str
    error_rate_pct: float
    action_applied: RemediationAction | None = None
    started_at: float = field(default_factory=time.monotonic)
    history: list[dict] = field(default_factory=list)

    def _record(self) -> dict:
        point = {"t_seconds": round(time.monotonic() - self.started_at, 1), "error_rate_pct": round(self.error_rate_pct, 2)}
        self.history.append(point)
        return point


_services: dict[str, MockService] = {}


def create_service(incident_id: str, initial_error_rate_pct: float) -> MockService:
    svc = MockService(incident_id=incident_id, error_rate_pct=initial_error_rate_pct)
    svc._record()
    _services[incident_id] = svc
    return svc


def get_service(incident_id: str) -> MockService | None:
    return _services.get(incident_id)


async def apply_action(incident_id: str, action: RemediationAction, ticks: int = 5, tick_seconds: float = 1.2):
    """The real execution step. Mutates this incident's sandboxed service
    state over real wall-clock time and yields each tick as it happens -
    a caller streams these live rather than waiting for the whole recovery
    to finish, the same way you'd poll a real monitoring API after a real
    remediation."""
    import asyncio

    svc = _services.get(incident_id) or create_service(incident_id, 10.0)
    svc.action_applied = action
    fraction = _RECOVERY_FRACTION_PER_TICK.get(action, 0.1)

    for _ in range(ticks):
        await asyncio.sleep(tick_seconds)
        gap = svc.error_rate_pct - _HEALTHY_FLOOR_PCT
        svc.error_rate_pct = max(_HEALTHY_FLOOR_PCT, svc.error_rate_pct - gap * fraction)
        yield svc._record()
