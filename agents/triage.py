"""
TRIAGE AGENT — Classifies Signals

Lineage: consolidates the original triage() action into a standalone
autonomous agent. Runs first, within seconds of an incident signal arriving.
"""
from __future__ import annotations

from .llm import structured_completion
from .models import IncidentSignal, Severity, TriageOutput

SYSTEM_PROMPT = """You are the Triage Agent inside Crisis Room, a multi-agent
incident response platform. You are the first responder to a raw incident
signal. Your job: classify severity fast and flag what to investigate.

Severity rubric:
- SEV1: full outage or checkout-blocking failure, large affected-user count, high revenue burn.
- SEV2: major degradation, meaningful revenue/user impact, service still partially usable.
- SEV3: partial or limited-blast-radius issue, workaround exists.
- SEV4: cosmetic or non-urgent.

Return JSON with exactly these keys:
{"severity": "SEV1"|"SEV2"|"SEV3"|"SEV4", "affected_services": [str], "initial_hypothesis_flags": [str], "confidence": float 0-1}
initial_hypothesis_flags should be short leads for the Investigator (e.g. "recent deploy", "elevated 5xx on payment-svc", "DB connection pool exhaustion suspected") - not a full diagnosis, that's the Investigator's job.
"""


def _fallback(signal: IncidentSignal) -> TriageOutput:
    """Deterministic rule-based severity classification, used when no LLM
    key is configured. Mirrors the rubric above."""
    if signal.error_rate_pct >= 20 or signal.revenue_per_min_usd >= 100_000:
        severity = Severity.SEV1
    elif signal.error_rate_pct >= 8 or signal.revenue_per_min_usd >= 10_000:
        severity = Severity.SEV2
    elif signal.error_rate_pct >= 2:
        severity = Severity.SEV3
    else:
        severity = Severity.SEV4

    ctx = signal.raw_context.lower()
    deploy_mentioned = "deploy" in ctx and "no recent deploy" not in ctx and "no deploy" not in ctx

    flags = []
    if signal.latency_p99_ms > 2000:
        flags.append("severe p99 latency spike")
    if deploy_mentioned:
        flags.append("recent deploy suspected")
    if "pool" in ctx and "max pool" in ctx:
        flags.append("connection pool near exhaustion")
    if "packet loss" in ctx or "cross-region" in ctx:
        flags.append("cross-region network signal present")
    if signal.error_rate_pct >= 15:
        flags.append("hard error, not degradation - check dependency health")
    if not flags:
        flags.append("no obvious lead yet - broad investigation needed")

    return TriageOutput(
        severity=severity,
        affected_services=[signal.service],
        initial_hypothesis_flags=flags,
        confidence=0.72,
    )


def run(signal: IncidentSignal) -> tuple[TriageOutput, str]:
    """Returns (typed output, reasoning_trace_text)."""
    user_prompt = f"""Incident signal:
service: {signal.service}
title: {signal.title}
error_rate_pct: {signal.error_rate_pct}
latency_p99_ms: {signal.latency_p99_ms}
affected_users: {signal.affected_users}
revenue_per_min_usd: {signal.revenue_per_min_usd}
raw_context: {signal.raw_context}
"""
    result = structured_completion(SYSTEM_PROMPT, user_prompt)
    if result:
        try:
            output = TriageOutput(**result)
            trace = (
                f"Classified {signal.service} as {output.severity.value} "
                f"({signal.error_rate_pct}% errors, {signal.affected_users:,} users affected). "
                f"Flags for investigator: {', '.join(output.initial_hypothesis_flags)}."
            )
            return output, trace
        except Exception:
            pass  # fall through to deterministic fallback on malformed LLM output

    output = _fallback(signal)
    trace = (
        f"[offline mode] Rule-based classification: {signal.error_rate_pct}% error rate and "
        f"${signal.revenue_per_min_usd:,.0f}/min revenue exposure -> {output.severity.value}. "
        f"Handing off to Investigator with leads: {', '.join(output.initial_hypothesis_flags)}."
    )
    return output, trace
