"""
COMMUNICATOR AGENT — Stakeholder Sync

Lineage: consolidates the original Communications Lead + On-Call Engineer
escalation logic into one agent. Per the brief: silence during a live
incident is itself a failure mode, so this agent's output always includes
a next_update_in_min, and the orchestrator fires it at every stage - not
just once at the end.
"""
from __future__ import annotations

from .llm import structured_completion
from .models import CommanderOutput, CommunicatorOutput, IncidentSignal, InvestigatorOutput, StakeholderMessage, TriageOutput

SYSTEM_PROMPT = """You are the Communicator Agent inside Crisis Room. You
draft stakeholder-specific updates from the current incident state. Three
audiences, three registers:
- customers (status_page): plain language, no internal jargon, apologetic but not alarmist.
- internal_eng (slack): technical, terse, actionable.
- leadership (email): business-impact framed - revenue, users, ETA - not technical detail.

Return JSON with exactly these keys:
{"messages": [{"audience": "customers"|"internal_eng"|"leadership", "channel": "status_page"|"slack"|"email", "message": str}], "next_update_in_min": int}
Always include all three audiences.
"""


def _fallback(
    signal: IncidentSignal, triage: TriageOutput, investigator: InvestigatorOutput, commander: CommanderOutput | None
) -> CommunicatorOutput:
    if commander is None:
        messages = [
            StakeholderMessage(
                audience="customers",
                channel="status_page",
                message=f"We're investigating an issue affecting {signal.service}. Updates to follow shortly.",
            ),
            StakeholderMessage(
                audience="internal_eng",
                channel="slack",
                message=f"[{triage.severity.value}] {signal.service}: {', '.join(triage.initial_hypothesis_flags)}. Investigator engaged.",
            ),
            StakeholderMessage(
                audience="leadership",
                channel="email",
                message=(
                    f"Active incident on {signal.service}, severity {triage.severity.value}, "
                    f"~${signal.revenue_per_min_usd:,.0f}/min exposure. Root-cause analysis underway."
                ),
            ),
        ]
        return CommunicatorOutput(messages=messages, next_update_in_min=10)

    messages = [
        StakeholderMessage(
            audience="customers",
            channel="status_page",
            message=f"We identified the cause of the issue affecting {signal.service} and are applying a fix ({commander.action.value}). We expect full recovery shortly.",
        ),
        StakeholderMessage(
            audience="internal_eng",
            channel="slack",
            message=f"Root cause: {investigator.hypothesis} -> executing {commander.action.value}. {commander.rationale}",
        ),
        StakeholderMessage(
            audience="leadership",
            channel="email",
            message=(
                f"Incident on {signal.service} ({triage.severity.value}) root-caused and remediation "
                f"({commander.action.value}) is in progress. {commander.expected_impact}"
            ),
        ),
    ]
    return CommunicatorOutput(messages=messages, next_update_in_min=15)


def run(
    signal: IncidentSignal,
    triage: TriageOutput,
    investigator: InvestigatorOutput,
    commander: CommanderOutput | None,
) -> tuple[CommunicatorOutput, str]:
    user_prompt = f"""Service: {signal.service}
Severity: {triage.severity.value}
Root cause: {investigator.hypothesis}
Commander action: {commander.action.value if commander else 'pending'}
Commander rationale: {commander.rationale if commander else 'pending'}
"""
    result = structured_completion(SYSTEM_PROMPT, user_prompt)
    if result:
        try:
            output = CommunicatorOutput(**result)
            trace = f"Drafted {len(output.messages)} stakeholder updates. Next update in {output.next_update_in_min}min."
            return output, trace
        except Exception:
            pass

    output = _fallback(signal, triage, investigator, commander)
    trace = f"[offline mode] Drafted {len(output.messages)} stakeholder updates. Next update in {output.next_update_in_min}min."
    return output, trace
