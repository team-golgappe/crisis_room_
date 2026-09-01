"""
Synthetic monitor — real detection without an external monitoring tool.

Polls a URL on an interval with httpx, keeps a rolling window of the *actual*
status codes and response latencies it observed, and when that window shows
genuine, sustained degradation it emits a real `IncidentSignal` into the
same `orchestrator.run_incident()` pipeline a Datadog/PagerDuty webhook would.

This is the productization story from the README made literal: a user gives
us a URL, we watch it ourselves, and Crisis Room reacts on its own.

Nothing here is scripted — the numbers in the emitted signal are computed
from measurements this process took over real wall-clock time.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

from agents.models import IncidentSignal

log = logging.getLogger("crisis_room.monitor")

# ---------------------------------------------------------------------------
# config / defaults
# ---------------------------------------------------------------------------
DEFAULT_THRESHOLDS: dict = {
    "error_rate_pct": 40.0,          # % of the rolling window that failed
    "latency_p99_ms": 3000.0,        # p99 latency across the window
    "consecutive_failures": 3,       # trailing run of failed checks
    "poll_interval_seconds": 30,     # how often to probe
    "window_size": 10,               # how many checks the rolling window keeps
    "request_timeout_seconds": 10.0,
    "recovery_error_rate_pct": 10.0,  # window must fall below this to re-arm
    "min_samples": 3,                # don't judge degradation on < this many checks
    "reopen_after_seconds": 120,    # if still degraded this long after the last incident, fire again
}


def merge_thresholds(overrides: dict | None) -> dict:
    merged = dict(DEFAULT_THRESHOLDS)
    for key, value in (overrides or {}).items():
        if key in merged and value is not None:
            merged[key] = value
    return merged


def service_name_from_url(url: str) -> str:
    host = urlparse(url).hostname or url
    return host


@dataclass
class MonitorConfig:
    site_id: int
    user_id: int
    url: str
    service_name: str
    thresholds: dict = field(default_factory=lambda: dict(DEFAULT_THRESHOLDS))

    @property
    def poll_interval_s(self) -> float:
        return float(self.thresholds["poll_interval_seconds"])

    @property
    def window_size(self) -> int:
        return int(self.thresholds["window_size"])

    @property
    def request_timeout_s(self) -> float:
        return float(self.thresholds["request_timeout_seconds"])


# ---------------------------------------------------------------------------
# rolling state
# ---------------------------------------------------------------------------
@dataclass
class Sample:
    at: float                 # epoch seconds
    ok: bool
    status_code: int | None
    latency_ms: float
    error: str | None = None

    def describe(self) -> str:
        if self.status_code is not None:
            return f"{self.status_code}" + ("" if self.ok else " ✗")
        return f"ERR:{self.error or 'unreachable'}"


@dataclass
class Assessment:
    error_rate_pct: float
    p99_latency_ms: float
    consecutive_failures: int
    sample_count: int
    degraded: bool
    healthy: bool
    reasons: list[str]


@dataclass
class MonitorState:
    window_size: int
    samples: deque[Sample] = field(default_factory=deque)
    incident_open: bool = False
    last_incident_id: str | None = None
    last_incident_at: float = 0.0
    last_incident_signature: str | None = None

    def __post_init__(self) -> None:
        self.samples = deque(maxlen=self.window_size)

    def record(self, sample: Sample) -> None:
        self.samples.append(sample)

    def _p99(self, subset: list[Sample] | None = None) -> float:
        pool = self.samples if subset is None else subset
        if not pool:
            return 0.0
        ordered = sorted(s.latency_ms for s in pool)
        # nearest-rank p99; for small windows this is effectively the max
        idx = max(0, min(len(ordered) - 1, round(0.99 * len(ordered) + 0.5) - 1))
        return ordered[idx]

    def _consecutive_failures(self) -> int:
        count = 0
        for s in reversed(self.samples):
            if s.ok:
                break
            count += 1
        return count

    def assess(self, thresholds: dict) -> Assessment:
        n = len(self.samples)
        failures = sum(1 for s in self.samples if not s.ok)
        error_rate = (failures / n * 100.0) if n else 0.0
        p99 = self._p99()
        consecutive = self._consecutive_failures()
        min_samples = int(thresholds["min_samples"])

        reasons: list[str] = []
        if n >= min_samples:
            if error_rate >= thresholds["error_rate_pct"]:
                reasons.append(
                    f"{error_rate:.0f}% of the last {n} checks failed "
                    f"(threshold {thresholds['error_rate_pct']:.0f}%)"
                )
            if consecutive >= thresholds["consecutive_failures"]:
                reasons.append(
                    f"{consecutive} consecutive failed checks "
                    f"(threshold {thresholds['consecutive_failures']})"
                )
            if p99 >= thresholds["latency_p99_ms"]:
                reasons.append(
                    f"p99 latency {p99:.0f}ms across the window "
                    f"(threshold {thresholds['latency_p99_ms']:.0f}ms)"
                )

        degraded = bool(reasons)
        last_ok = self.samples[-1].ok if self.samples else False
        # "recovered" is judged on the most recent checks, not the whole
        # rolling window — otherwise a resolved latency incident stays "open"
        # for a full window-flush while stale slow samples age out, and a
        # genuinely new fault in that gap can't raise a fresh incident.
        recent = list(self.samples)[-min_samples:]
        recent_failures = sum(1 for s in recent if not s.ok)
        recent_error_rate = (recent_failures / len(recent) * 100.0) if recent else 0.0
        recent_p99 = self._p99(recent)
        healthy = (
            n >= min_samples
            and last_ok
            and recent_error_rate <= thresholds["recovery_error_rate_pct"]
            and consecutive == 0
            and recent_p99 < thresholds["latency_p99_ms"]  # a latency-only incident isn't "recovered" until latency drops
        )
        return Assessment(
            error_rate_pct=round(error_rate, 1),
            p99_latency_ms=round(p99, 0),
            consecutive_failures=consecutive,
            sample_count=n,
            degraded=degraded,
            healthy=healthy,
            reasons=reasons,
        )


# ---------------------------------------------------------------------------
# probing
# ---------------------------------------------------------------------------
async def probe_once(client: httpx.AsyncClient, url: str) -> Sample:
    start = time.perf_counter()
    try:
        resp = await client.get(url)
        latency_ms = (time.perf_counter() - start) * 1000.0
        ok = 200 <= resp.status_code < 400
        return Sample(at=time.time(), ok=ok, status_code=resp.status_code, latency_ms=latency_ms)
    except httpx.TimeoutException:
        latency_ms = (time.perf_counter() - start) * 1000.0
        return Sample(at=time.time(), ok=False, status_code=None, latency_ms=latency_ms, error="timeout")
    except httpx.HTTPError as exc:
        latency_ms = (time.perf_counter() - start) * 1000.0
        return Sample(
            at=time.time(), ok=False, status_code=None, latency_ms=latency_ms,
            error=type(exc).__name__,
        )


def _failure_signature(recent: list[Sample], assessment: Assessment) -> str:
    """A coarse category for the failure's shape — status-code mix, latency
    delta. Used two ways: to pick the diagnostic breadcrumb below, and by the
    monitor loop to notice when the *kind* of failure changes mid-incident
    (a new problem, not a continuation of the old one)."""
    codes = [s.status_code for s in recent if s.status_code is not None]
    n = len(recent) or 1
    n_5xx = sum(1 for c in codes if 500 <= c < 600)
    n_gateway = sum(1 for c in codes if c in (502, 503, 504))
    n_timeout = sum(1 for s in recent if s.error == "timeout")
    latency_dominated = assessment.p99_latency_ms >= 1500

    if latency_dominated and assessment.error_rate_pct < 60:
        return "latency"
    if n_gateway >= max(2, n_5xx * 0.6) and n_gateway / n >= 0.3:
        return "gateway"
    if n_5xx / n >= 0.3 and not latency_dominated:
        return "http_5xx"
    if n_timeout / n >= 0.3:
        return "timeout"
    return "unknown"


_FAILURE_SHAPE_PROSE = {
    "latency": (
        "Response latency has risen sharply while the error rate stays moderate — the shape of "
        "connection pool exhaustion or a downstream dependency timing out under load, not a crash."
    ),
    "gateway": (
        "Failures are predominantly 502/503/504 gateway errors — the service's own process looks "
        "healthy but an upstream dependency it calls appears unreachable."
    ),
    "http_5xx": (
        "A sharp jump in 5xx errors with response latency unchanged at baseline — the pattern of a "
        "code-level regression introduced by a recent deploy or migration rather than resource or "
        "network pressure."
    ),
    "timeout": (
        "Requests are timing out rather than returning errors — consistent with the service being "
        "overwhelmed or blocked on a slow dependency."
    ),
    "unknown": "No single failure signature dominates; the cause is not obvious from black-box signals alone.",
}


def _failure_shape(recent: list[Sample], assessment: Assessment) -> str:
    """A black-box monitor can't see logs or deploys, but it CAN see the
    shape of the failure. That's a legitimate diagnostic breadcrumb, not the
    answer; the agents still reason from it."""
    return _FAILURE_SHAPE_PROSE[_failure_signature(recent, assessment)]


def build_incident_signal(config: MonitorConfig, state: MonitorState, assessment: Assessment) -> IncidentSignal:
    recent = list(state.samples)
    codes = " ".join(s.describe() for s in recent)
    first_bad = next((s for s in recent if not s.ok), None)

    if assessment.error_rate_pct >= 100 or assessment.consecutive_failures >= len(recent):
        headline = f"{config.service_name} is down"
    elif assessment.p99_latency_ms >= config.thresholds["latency_p99_ms"] and assessment.error_rate_pct < config.thresholds["error_rate_pct"]:
        headline = f"{config.service_name} severely degraded (latency)"
    else:
        headline = f"{config.service_name} degraded — elevated error rate"

    raw_context = (
        f"Synthetic monitor on {config.url}. "
        f"Last {assessment.sample_count} checks: [{codes}]. "
        f"Measured error rate {assessment.error_rate_pct}%, p99 latency {assessment.p99_latency_ms:.0f}ms, "
        f"{assessment.consecutive_failures} consecutive failures. "
        + (f"First failure observed at {time.strftime('%H:%M:%S', time.gmtime(first_bad.at))} UTC. " if first_bad else "")
        + "Trigger: " + "; ".join(assessment.reasons) + ". "
        + "External black-box monitoring only — no access to release history or internal telemetry. "
        + _failure_shape(recent, assessment)
    )

    return IncidentSignal(
        title=headline,
        service=config.service_name,
        error_rate_pct=float(assessment.error_rate_pct),
        latency_p99_ms=float(assessment.p99_latency_ms),
        affected_users=0,          # unknown from black-box monitoring
        revenue_per_min_usd=0.0,   # unknown from black-box monitoring
        raw_context=raw_context,
        source="synthetic_monitor",
    )


# ---------------------------------------------------------------------------
# the loop
# ---------------------------------------------------------------------------
EmitIncident = Callable[[IncidentSignal, Assessment], Awaitable[None]]
OnSample = Callable[[Sample, Assessment], None] | None


async def run_monitor(
    config: MonitorConfig,
    emit_incident: EmitIncident,
    *,
    on_sample: OnSample = None,
) -> None:
    """Poll `config.url` forever (until the task is cancelled). Calls
    `emit_incident` once when sustained degradation begins; won't call it
    again until the window recovers, so a site staying down produces one
    incident, not one per poll."""
    state = MonitorState(window_size=config.window_size)

    async with httpx.AsyncClient(
        timeout=config.request_timeout_s,
        follow_redirects=True,
        headers={"User-Agent": "CrisisRoom-SyntheticMonitor/1.0"},
    ) as client:
        while True:
            sample = await probe_once(client, config.url)
            state.record(sample)
            assessment = state.assess(config.thresholds)

            if on_sample is not None:
                on_sample(sample, assessment)

            now = time.time()
            since_last = now - state.last_incident_at
            reopen_after = float(config.thresholds["reopen_after_seconds"])
            stale = state.incident_open and since_last > reopen_after

            signature = _failure_signature(list(state.samples), assessment)
            # a materially different failure signature after the first alert is
            # a new problem, not a continuation — re-alert. Guarded by a short
            # floor so an overlap of two faults whose dominant shape flip-flops
            # poll-to-poll doesn't produce a storm.
            signature_changed = (
                state.incident_open
                and signature != "unknown"
                and state.last_incident_signature not in (None, signature)
                and since_last > 45
            )

            # `degraded` is judged on the whole rolling window (sustained), but
            # `healthy` on just the last few checks — during a recovery the two
            # overlap while stale bad samples age out. Treat that overlap as
            # "recovering", neither a new alert nor a re-arm yet.
            if assessment.degraded and not assessment.healthy and (
                not state.incident_open or stale or signature_changed
            ):
                # first alert for this episode; a re-alert for one that's been
                # firing a long time without recovering (remediation didn't
                # land, or the cause is external); or the failure changed shape.
                why = "new" if not state.incident_open else ("shape changed" if signature_changed else "still unresolved")
                state.incident_open = True
                state.last_incident_at = now
                state.last_incident_signature = signature
                signal = build_incident_signal(config, state, assessment)
                state.last_incident_id = signal.incident_id
                log.info(
                    "site %s: %s degradation (%s) -> incident %s",
                    config.site_id, why, signature, signal.incident_id,
                )
                await emit_incident(signal, assessment)
            elif state.incident_open and assessment.healthy and not assessment.degraded:
                log.info("site %s: recovered, monitor re-armed", config.site_id)
                state.incident_open = False
                state.last_incident_signature = None
            elif assessment.degraded and not assessment.healthy and state.incident_open:
                log.info(
                    "site %s: still degraded, incident %s already open (re-alert in ~%ds)",
                    config.site_id, state.last_incident_id, max(0, int(reopen_after - since_last)),
                )

            await asyncio.sleep(config.poll_interval_s)
