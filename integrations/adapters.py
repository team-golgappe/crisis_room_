"""
Alert adapters — the productization seam.

A real company doesn't click a demo button to start an incident; their
monitoring stack (Datadog, PagerDuty, Prometheus Alertmanager, or an
in-house tool) fires a webhook the moment something breaks. This module's
only job is translating *their* payload shape into our one typed contract
(`IncidentSignal`), so every agent downstream never has to know or care
which tool the alert came from.

Adding support for a new monitoring tool means adding one function here —
nothing else in the pipeline changes. That's the whole point of the shared
Pydantic contract.

Each adapter is deliberately defensive: real alert payloads are messy and
vary by customer configuration, so every field has a sane fallback rather
than raising on a missing key. An incident pipeline should never crash
because an upstream alert was missing an optional field.
"""
from __future__ import annotations

from typing import Any

from agents.models import IncidentSignal


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def from_datadog(payload: dict) -> IncidentSignal:
    """Datadog monitor webhook. See:
    https://docs.datadoghq.com/integrations/webhooks/
    Datadog sends templated text fields (title, body) plus tags; it does not
    give structured error-rate/latency numbers by default, so we parse what
    we can out of tags and fall back conservatively otherwise."""
    tags = payload.get("tags", "") or ""
    tag_map = dict(t.split(":", 1) for t in tags.split(",") if ":" in t)

    return IncidentSignal(
        title=payload.get("title") or payload.get("event_title") or "Datadog alert",
        service=tag_map.get("service") or payload.get("host", "unknown-service"),
        error_rate_pct=_safe_float(payload.get("error_rate_pct"), default=10.0),
        latency_p99_ms=_safe_float(payload.get("p99_latency_ms"), default=500.0),
        affected_users=_safe_int(payload.get("affected_users"), default=0),
        revenue_per_min_usd=_safe_float(payload.get("revenue_per_min_usd"), default=0.0),
        raw_context=payload.get("body") or payload.get("event_msg") or "",
        source="datadog",
    )


def from_pagerduty(payload: dict) -> IncidentSignal:
    """PagerDuty Events API v2 / webhook v3 payload.
    https://developer.pagerduty.com/docs/webhooks/webhook-overview"""
    event = payload.get("event", payload)
    data = event.get("data", event) if isinstance(event, dict) else {}
    custom = data.get("custom_details", {}) if isinstance(data, dict) else {}

    return IncidentSignal(
        title=data.get("title") or data.get("summary") or "PagerDuty incident",
        service=(data.get("service") or {}).get("summary", "unknown-service") if isinstance(data.get("service"), dict) else str(data.get("service", "unknown-service")),
        error_rate_pct=_safe_float(custom.get("error_rate_pct"), default=10.0),
        latency_p99_ms=_safe_float(custom.get("p99_latency_ms"), default=500.0),
        affected_users=_safe_int(custom.get("affected_users"), default=0),
        revenue_per_min_usd=_safe_float(custom.get("revenue_per_min_usd"), default=0.0),
        raw_context=str(custom) or data.get("summary", ""),
        source="pagerduty",
    )


def from_prometheus_alertmanager(payload: dict) -> IncidentSignal:
    """Prometheus Alertmanager webhook_config payload.
    https://prometheus.io/docs/alerting/latest/configuration/#webhook_config
    Alertmanager batches alerts; we take the first firing alert as the
    representative signal for a new incident (a production adapter would
    likely fan these out or dedupe by fingerprint instead)."""
    alerts = payload.get("alerts", [])
    alert = alerts[0] if alerts else {}
    labels = alert.get("labels", {})
    annotations = alert.get("annotations", {})

    return IncidentSignal(
        title=annotations.get("summary") or labels.get("alertname", "Prometheus alert"),
        service=labels.get("service") or labels.get("job", "unknown-service"),
        error_rate_pct=_safe_float(labels.get("error_rate_pct"), default=10.0),
        latency_p99_ms=_safe_float(labels.get("p99_latency_ms"), default=500.0),
        affected_users=_safe_int(labels.get("affected_users"), default=0),
        revenue_per_min_usd=_safe_float(labels.get("revenue_per_min_usd"), default=0.0),
        raw_context=annotations.get("description", ""),
        source="prometheus",
    )


def from_generic(payload: dict) -> IncidentSignal:
    """Fallback for any tool not explicitly supported yet: accepts our own
    IncidentSignal shape directly. This is also what a company's in-house
    alerting can target with zero adapter work if it can just emit this
    shape itself."""
    return IncidentSignal(**payload, source=payload.get("source", "generic"))


ADAPTERS = {
    "datadog": from_datadog,
    "pagerduty": from_pagerduty,
    "prometheus": from_prometheus_alertmanager,
    "generic": from_generic,
}
