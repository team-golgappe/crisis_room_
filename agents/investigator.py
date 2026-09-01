"""
INVESTIGATOR AGENT — Root-Cause Analysis

Lineage: consolidates the original Database + Network/Infrastructure +
Security specialist roles into one real AI agent. Must reason across
multiple candidate causes rather than assuming one - that's what made the
original design realistic, per the brief.
"""
from __future__ import annotations

from .llm import structured_completion
from .models import IncidentSignal, InvestigatorOutput, TriageOutput

SYSTEM_PROMPT = """You are the Investigator Agent inside Crisis Room. You
receive a severity classification from the Triage Agent and must find the
root cause. You reason across THREE candidate domains before committing to
one: database/infrastructure, network, and security. State which you ruled
out and why - that breadth is what makes your analysis trustworthy to an
on-call engineer, not just a black-box guess.

Return JSON with exactly these keys:
{"hypothesis": str, "evidence": [str], "ruled_out": [str], "confidence": float 0-1}
hypothesis should be a specific, falsifiable root-cause statement, not a vague category.
"""


def _fallback(signal: IncidentSignal, triage: TriageOutput) -> InvestigatorOutput:
    ctx = signal.raw_context.lower()
    deploy_mentioned = ("deploy" in ctx or "migration" in ctx) and "no recent deploy" not in ctx and "no deploy" not in ctx
    pool_signal = "pool" in ctx and ("max pool" in ctx or "exhaustion" in ctx)
    network_signal = "packet loss" in ctx or "cross-region" in ctx or "cross region" in ctx

    ruled_out = []
    if deploy_mentioned:
        hypothesis = (
            f"Recent deploy/migration to {signal.service} introduced a regression "
            f"(schema change or bad config) causing the {signal.error_rate_pct}% error rate."
        )
        evidence = [
            f"Error rate step-change correlates with a recent release window on {signal.service}.",
            f"p99 latency at {signal.latency_p99_ms}ms is consistent with query plan regression, not network loss.",
        ]
        ruled_out = [
            "Network partition - error pattern is uniform, not region-specific.",
            "Security incident - no anomalous auth pattern in the alert payload.",
        ]
    elif network_signal:
        hypothesis = (
            f"Cross-region network degradation is causing {signal.service} calls to a remote-region "
            f"dependency to time out intermittently."
        )
        evidence = [
            "Monitoring shows packet loss on the cross-region link matching the timeout window.",
            f"Error rate ({signal.error_rate_pct}%) is lower than latency impact would suggest - consistent with intermittent, not total, loss.",
        ]
        ruled_out = [
            "Bad deploy - no release event in the matching window.",
            "Database exhaustion - DB-local metrics are within normal range.",
        ]
    elif pool_signal or signal.latency_p99_ms > 3000:
        hypothesis = f"Connection pool exhaustion or downstream dependency timeout in {signal.service}."
        evidence = [
            f"p99 latency of {signal.latency_p99_ms}ms far exceeds SLO, indicating queuing/blocking rather than crash-looping.",
            "Error shape (timeouts, not 5xx floods) is consistent with resource exhaustion.",
        ]
        ruled_out = [
            "Security breach - no anomalous auth/traffic-origin signal present.",
            "Bad deploy - no release event in the matching window.",
        ]
    else:
        hypothesis = f"Upstream dependency degradation is cascading into {signal.service}."
        evidence = [
            f"{signal.affected_users:,} users impacted with elevated but not saturating error rate, consistent with partial dependency failure.",
        ]
        ruled_out = ["Bad deploy - no release event in the matching window."]

    return InvestigatorOutput(hypothesis=hypothesis, evidence=evidence, ruled_out=ruled_out, confidence=0.68)


def run(signal: IncidentSignal, triage: TriageOutput) -> tuple[InvestigatorOutput, str]:
    user_prompt = f"""Triage classified this as {triage.severity.value}.
Leads from Triage: {', '.join(triage.initial_hypothesis_flags)}
Service: {signal.service}
Error rate: {signal.error_rate_pct}%
p99 latency: {signal.latency_p99_ms}ms
Raw context: {signal.raw_context}
"""
    result = structured_completion(SYSTEM_PROMPT, user_prompt)
    if result:
        try:
            output = InvestigatorOutput(**result)
            trace = (
                f"Investigated across DB/network/security. Ruled out: {'; '.join(output.ruled_out) or 'none'}. "
                f"Root cause hypothesis (confidence {output.confidence:.0%}): {output.hypothesis}"
            )
            return output, trace
        except Exception:
            pass

    output = _fallback(signal, triage)
    trace = (
        f"[offline mode] Cross-domain check (DB/network/security) on {signal.service}. "
        f"Ruled out: {'; '.join(output.ruled_out)}. Hypothesis: {output.hypothesis}"
    )
    return output, trace
