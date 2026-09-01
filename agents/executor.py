"""
RESOLUTION SIMULATOR — not one of the 4 agents in the brief, and deliberately
not real.

Build-scope decision: Crisis Room diagnoses an incident and decides on a
remediation with full reasoning — that's the product. Actually reaching out
and executing that remediation against a company's real infrastructure
(calling a real Kubernetes API, a real deploy pipeline, a real load balancer)
is a categorically bigger and riskier system: it needs real credentials into
a customer's environment, and real safety rails (approval gates, blast-radius
limits, a kill switch) before any responsible team would grant it write
access. That's out of scope for this build, on purpose — see the README and
slide 7's "AI investigation copilot, not full autonomous remediation"
positioning.

What this module does instead: once the Commander picks an action, generate
a believable error-rate decay curve for what *should* happen if a human (or
the company's existing runbook automation) carries out that action. This
gives the dashboard something to show recovering in real time without ever
claiming Crisis Room touched real systems - every tick is labeled as
simulated.
"""
from __future__ import annotations

from collections.abc import Iterator

from .models import CommanderOutput, IncidentSignal, RemediationAction, SimulatedRecoveryTick

# Rough "how fast does this class of fix typically show results" shape,
# expressed as a decay factor applied per tick. Faster actions (restart)
# show results quicker than slower ones (escalate to a human, which has
# inherent lag before anyone acts).
_DECAY_BY_ACTION = {
    RemediationAction.RESTART: 0.55,
    RemediationAction.ROLLBACK: 0.5,
    RemediationAction.SCALE: 0.6,
    RemediationAction.FAILOVER: 0.45,
    RemediationAction.ESCALATE: 0.8,
    RemediationAction.MONITOR: 0.95,
}


def simulate_recovery(signal: IncidentSignal, commander_output: CommanderOutput, ticks: int = 5) -> Iterator[SimulatedRecoveryTick]:
    decay = _DECAY_BY_ACTION.get(commander_output.action, 0.6)
    rate = signal.error_rate_pct
    for i in range(1, ticks + 1):
        rate = max(rate * decay, 0.05 if commander_output.action != RemediationAction.MONITOR else rate * 0.98)
        yield SimulatedRecoveryTick(tick=i, error_rate_pct=round(rate, 2))
