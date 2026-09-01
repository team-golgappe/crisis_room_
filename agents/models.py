"""
Shared typed contract for Crisis Room.

Every agent speaks this schema in and out. Nothing crosses the orchestrator
boundary as free-text — this is what the brief calls out as the #1 reason a
multi-agent pipeline stays reliable instead of turning into a chatbot with
extra steps. Pydantic validates it before it ever reaches another agent or
the dashboard.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Severity(str, Enum):
    SEV1 = "SEV1"  # full outage, revenue-critical
    SEV2 = "SEV2"  # major degradation
    SEV3 = "SEV3"  # partial / limited-blast-radius
    SEV4 = "SEV4"  # cosmetic / non-urgent


class RemediationAction(str, Enum):
    ROLLBACK = "rollback"
    RESTART = "restart"
    SCALE = "scale"
    FAILOVER = "failover"
    ESCALATE = "escalate"
    MONITOR = "monitor"


class IncidentSignal(BaseModel):
    """The raw trigger that kicks off a run. This is what a real alerting
    system (Datadog, PagerDuty, a synthetic monitor) would emit."""

    incident_id: str = Field(default_factory=lambda: f"INC-{uuid4().hex[:8].upper()}")
    title: str
    service: str
    error_rate_pct: float
    latency_p99_ms: float
    affected_users: int
    revenue_per_min_usd: float
    timestamp: str = Field(default_factory=now_iso)
    raw_context: str = Field(
        default="", description="Free-text log/alert snippet an engineer would have pasted in."
    )
    source: str = Field(
        default="manual", description="Where this signal came from: datadog, pagerduty, prometheus, generic webhook, or manual (demo/API)."
    )


class TriageOutput(BaseModel):
    severity: Severity
    affected_services: list[str]
    initial_hypothesis_flags: list[str]
    confidence: float = Field(ge=0.0, le=1.0)


class InvestigatorOutput(BaseModel):
    hypothesis: str
    evidence: list[str]
    ruled_out: list[str] = Field(
        default_factory=list, description="Other causes considered and dismissed, with why."
    )
    confidence: float = Field(ge=0.0, le=1.0)


class CommanderOutput(BaseModel):
    action: RemediationAction
    rationale: str
    expected_impact: str
    confidence: float = Field(ge=0.0, le=1.0)
    rollback_plan: Optional[str] = None


class StakeholderMessage(BaseModel):
    audience: Literal["customers", "internal_eng", "leadership"]
    channel: Literal["status_page", "slack", "email"]
    message: str


class CommunicatorOutput(BaseModel):
    messages: list[StakeholderMessage]
    next_update_in_min: int


class SimulatedRecoveryTick(BaseModel):
    """Output of the Resolution Simulator. NOT a real infrastructure action —
    see README for why real execution is explicitly out of scope for this
    build. This exists so the product story ("the issue gets identified and
    a fix path is chosen") is honest about where automation currently stops:
    Crisis Room diagnoses and decides; a human or the company's existing
    runbook automation executes. This tick stream just visualizes what
    *should* happen if that action is carried out, using the error-rate
    decay you'd expect from a correct remediation."""

    tick: int
    error_rate_pct: float
    note: str = "simulated — no real infrastructure was modified"


AgentName = Literal["triage", "investigator", "commander", "communicator", "executor", "system"]


class AgentEvent(BaseModel):
    """The envelope every agent output (and every orchestrator lifecycle
    event) is wrapped in before it goes out over the WebSocket. This is the
    one shape the frontend needs to understand."""

    agent: AgentName
    incident_id: str
    timestamp: str = Field(default_factory=now_iso)
    event_type: Literal["started", "output", "error", "execution", "recovery_tick", "incident_resolved"]
    output: Optional[dict] = None
    reasoning_trace: str = ""
    latency_ms: Optional[int] = None
