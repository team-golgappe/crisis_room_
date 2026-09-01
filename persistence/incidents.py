"""
Read/write helpers for persisted incidents.

Writes are used by the authenticated pipeline runner (Phase 2) as a real
incident streams; reads back the authenticated frontend (Phase 3). The
`/console` demo surface never calls any of this.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from agents.models import AgentEvent, IncidentSignal
from db.models import Incident, IncidentEvent


# --------------------------------------------------------------------------
# writes
# --------------------------------------------------------------------------
def create_incident(
    db: Session,
    *,
    signal: IncidentSignal,
    user_id: int,
    site_id: int | None,
) -> Incident:
    incident = Incident(
        incident_id=signal.incident_id,
        user_id=user_id,
        site_id=site_id,
        source=signal.source,
        title=signal.title,
        service=signal.service,
        status="active",
        signal=signal.model_dump(mode="json"),
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return incident


def append_event(db: Session, event: AgentEvent, seq: int) -> None:
    """Persist one streamed AgentEvent. Also keeps a few denormalized fields
    on the parent Incident row current (severity, status)."""
    payload = event.model_dump(mode="json")
    db.add(
        IncidentEvent(
            incident_id=event.incident_id,
            seq=seq,
            agent=event.agent,
            event_type=event.event_type,
            payload=payload,
        )
    )

    incident = db.scalar(select(Incident).where(Incident.incident_id == event.incident_id))
    if incident is not None:
        if event.agent == "triage" and event.event_type == "output" and event.output:
            incident.severity = event.output.get("severity")
        if event.event_type == "incident_resolved":
            # The pipeline finished. Whether the incident is genuinely
            # *resolved* depends on whether the executed remediation actually
            # recovered the target — the runner decides that in
            # set_resolution(). Until then it's "diagnosed", not "resolved".
            incident.status = "diagnosed"
            incident.resolved_at = datetime.now(timezone.utc)
    db.commit()


def set_resolution(
    db: Session,
    incident_id: str,
    resolution: dict,
    *,
    status: str = "resolved",
) -> None:
    """Write the compact resolution summary and the real terminal status.

    `status` is what the runner computed from the executor's own report and
    the measured recovery:
      - "resolved"           — a real remediation ran and the target recovered
      - "mitigation_failed"  — a real remediation ran but the target is still degraded
      - "awaiting_execution" — diagnosed only; no control plane carried it out
    """
    incident = db.scalar(select(Incident).where(Incident.incident_id == incident_id))
    if incident is None:
        return
    incident.resolution = resolution
    incident.status = status
    if incident.resolved_at is None:
        incident.resolved_at = datetime.now(timezone.utc)
    db.commit()


# --------------------------------------------------------------------------
# reads (always user-scoped)
# --------------------------------------------------------------------------
def list_for_user(db: Session, user_id: int) -> list[Incident]:
    return list(
        db.scalars(
            select(Incident)
            .where(Incident.user_id == user_id)
            .order_by(Incident.created_at.desc())
        )
    )


def get_for_user(db: Session, user_id: int, incident_id: str) -> Incident | None:
    return db.scalar(
        select(Incident)
        .where(Incident.user_id == user_id, Incident.incident_id == incident_id)
        .options(selectinload(Incident.events))
    )
