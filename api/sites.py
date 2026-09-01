"""
Authenticated site monitoring.

  POST   /api/sites        -> register a URL, start a synthetic monitor for it
  GET    /api/sites        -> this user's monitored sites (+ live/incident status)
  DELETE /api/sites/{id}   -> stop the monitor and remove the site

Each site's monitor runs as a background task (monitoring/supervisor.py) and
any incident it detects is persisted against this user (monitoring/runner.py).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, HttpUrl, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from db.database import get_db
from db.models import Incident, MonitoredSite, User, to_iso_utc
from integrations.synthetic_monitor import (
    DEFAULT_THRESHOLDS,
    merge_thresholds,
    service_name_from_url,
)
from monitoring import supervisor

router = APIRouter(prefix="/api/sites", tags=["sites"])

_ALLOWED_THRESHOLD_KEYS = set(DEFAULT_THRESHOLDS)


class ThresholdOverrides(BaseModel):
    error_rate_pct: float | None = Field(default=None, ge=0, le=100)
    latency_p99_ms: float | None = Field(default=None, ge=0)
    consecutive_failures: int | None = Field(default=None, ge=1, le=100)
    poll_interval_seconds: float | None = Field(default=None, ge=5, le=3600)
    window_size: int | None = Field(default=None, ge=3, le=100)
    request_timeout_seconds: float | None = Field(default=None, ge=1, le=60)
    recovery_error_rate_pct: float | None = Field(default=None, ge=0, le=100)
    min_samples: int | None = Field(default=None, ge=1, le=100)
    reopen_after_seconds: float | None = Field(default=None, ge=30, le=86400)


class SiteCreate(BaseModel):
    url: HttpUrl
    service_name: str | None = Field(default=None, max_length=200)
    thresholds: ThresholdOverrides = Field(default_factory=ThresholdOverrides)

    @field_validator("url")
    @classmethod
    def _http_only(cls, v: HttpUrl) -> HttpUrl:
        if v.scheme not in ("http", "https"):
            raise ValueError("url must be http or https")
        return v


class SiteOut(BaseModel):
    id: int
    url: str
    service_name: str
    thresholds: dict
    active: bool
    monitor_running: bool
    incident_count: int
    created_at: str


def _to_out(site: MonitoredSite, incident_count: int) -> SiteOut:
    return SiteOut(
        id=site.id,
        url=site.url,
        service_name=site.service_name,
        thresholds=site.thresholds,
        active=site.active,
        monitor_running=supervisor.is_running(site.id),
        incident_count=incident_count,
        created_at=to_iso_utc(site.created_at),
    )


@router.post("", response_model=SiteOut, status_code=status.HTTP_201_CREATED)
async def create_site(
    body: SiteCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SiteOut:
    url = str(body.url)
    service_name = (body.service_name or "").strip() or service_name_from_url(url)
    thresholds = merge_thresholds(body.thresholds.model_dump(exclude_none=True))

    existing = db.scalar(
        select(MonitoredSite).where(
            MonitoredSite.user_id == user.id,
            MonitoredSite.url == url,
            MonitoredSite.active.is_(True),
        )
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You're already monitoring that URL.")

    site = MonitoredSite(
        user_id=user.id,
        url=url,
        service_name=service_name,
        thresholds=thresholds,
        active=True,
    )
    db.add(site)
    db.commit()
    db.refresh(site)

    supervisor.start_monitor(site)
    return _to_out(site, incident_count=0)


@router.get("", response_model=list[SiteOut])
def list_sites(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SiteOut]:
    rows = db.execute(
        select(MonitoredSite, func.count(Incident.id))
        .outerjoin(Incident, Incident.site_id == MonitoredSite.id)
        .where(MonitoredSite.user_id == user.id, MonitoredSite.active.is_(True))
        .group_by(MonitoredSite.id)
        .order_by(MonitoredSite.created_at.desc())
    ).all()
    return [_to_out(site, count) for site, count in rows]


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_site(
    site_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    site = db.get(MonitoredSite, site_id)
    if site is None or site.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")

    await supervisor.stop_monitor(site_id)

    # keep the incident history, just unlink it from the deleted site
    db.query(Incident).filter(Incident.site_id == site_id).update(
        {Incident.site_id: None}, synchronize_session=False
    )
    db.delete(site)
    db.commit()
    return None
