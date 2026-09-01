"""
Persistence models for the authenticated product area.

These are storage rows, not agent contracts. The *shape* of incident data
still comes from the Pydantic models in agents/models.py — an IncidentSignal
dict is stored verbatim in Incident.signal, and each streamed AgentEvent
dict is stored verbatim in IncidentEvent.payload. Nothing is redefined here.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_iso_utc(dt: datetime | None) -> str | None:
    """SQLite drops tzinfo on storage, so datetimes come back naive. They
    were written as UTC — re-attach that before serializing to the client."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    # Phase 4 — optional Slack incoming-webhook URL the user pastes in settings.
    slack_webhook_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    sites: Mapped[list["MonitoredSite"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    incidents: Mapped[list["Incident"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class MonitoredSite(Base):
    __tablename__ = "monitored_sites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    service_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # {"error_rate_pct": float, "latency_p99_ms": float,
    #  "consecutive_failures": int, "poll_interval_seconds": int}
    thresholds: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="sites")
    incidents: Mapped[list["Incident"]] = relationship(back_populates="site")


class Incident(Base):
    """One row per incident a user's monitor generates. The full AgentEvent
    stream for it lives in `events` (IncidentEvent rows)."""

    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("monitored_sites.id"), index=True, nullable=True)

    source: Mapped[str] = mapped_column(String(50), default="synthetic_monitor", nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    service: Mapped[str] = mapped_column(String(200), nullable=False)
    severity: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active | resolved

    # verbatim IncidentSignal.model_dump(mode="json")
    signal: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # denormalized Commander decision + notifier results, filled on resolve
    resolution: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="incidents")
    site: Mapped["MonitoredSite | None"] = relationship(back_populates="incidents")
    events: Mapped[list["IncidentEvent"]] = relationship(
        back_populates="incident",
        cascade="all, delete-orphan",
        order_by="IncidentEvent.seq",
    )


class IncidentEvent(Base):
    """One streamed AgentEvent, persisted as it happens."""

    __tablename__ = "incident_events"
    __table_args__ = (UniqueConstraint("incident_id", "seq", name="uq_incident_event_seq"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[str] = mapped_column(
        ForeignKey("incidents.incident_id"), index=True, nullable=False
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    agent: Mapped[str] = mapped_column(String(20), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # verbatim AgentEvent.model_dump(mode="json")
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    incident: Mapped["Incident"] = relationship(back_populates="events")
