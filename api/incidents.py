"""
Authenticated, user-scoped incident history.

  GET /api/incidents            -> incidents this user's monitors generated
  GET /api/incidents/{id}       -> one incident + its full AgentEvent stream

Distinct from the demo endpoints in server/main.py (POST /api/incidents,
POST /api/incidents/scenario/{key}, WS /ws/live) which are unauthenticated
and in-memory only.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from db.database import get_db
from db.models import User, to_iso_utc
from persistence import incidents as store

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


class IncidentSummary(BaseModel):
    incident_id: str
    title: str
    service: str
    severity: str | None
    status: str
    source: str
    site_id: int | None
    created_at: str
    resolved_at: str | None


class IncidentDetail(IncidentSummary):
    signal: dict | None
    resolution: dict | None
    events: list[dict]


@router.get("", response_model=list[IncidentSummary])
def list_incidents(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[IncidentSummary]:
    return [
        IncidentSummary(
            incident_id=i.incident_id,
            title=i.title,
            service=i.service,
            severity=i.severity,
            status=i.status,
            source=i.source,
            site_id=i.site_id,
            created_at=to_iso_utc(i.created_at),
            resolved_at=to_iso_utc(i.resolved_at),
        )
        for i in store.list_for_user(db, user.id)
    ]


@router.get("/{incident_id}", response_model=IncidentDetail)
def get_incident(
    incident_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncidentDetail:
    incident = store.get_for_user(db, user.id, incident_id)
    if incident is None:
        raise HTTPException(404, "Incident not found")

    return IncidentDetail(
        incident_id=incident.incident_id,
        title=incident.title,
        service=incident.service,
        severity=incident.severity,
        status=incident.status,
        source=incident.source,
        site_id=incident.site_id,
        created_at=to_iso_utc(incident.created_at),
        resolved_at=to_iso_utc(incident.resolved_at),
        signal=incident.signal,
        resolution=incident.resolution,
        events=[e.payload for e in incident.events],
    )
