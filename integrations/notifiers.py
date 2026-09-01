"""
Delivery layer for the Communicator's drafted messages.

On every incident the Communicator agent drafts stakeholder updates
(customers / internal-eng / leadership) — but in the base build they only
ever render to the dashboard and go nowhere. This module actually sends
them, for REAL incidents raised by a user's synthetic monitor only.

The /console demo never reaches this code: server/main.py's demo path calls
`run_incident()` directly and broadcasts to /ws/live, while the authenticated
monitor path (monitoring/runner.py) is the only caller of
`notify_on_resolution()`. Demo scenarios must never send real email or Slack.

Two independent, best-effort channels:
  - EmailNotifier — Resend API, to the user's account email. Needs
    RESEND_API_KEY (+ optional RESEND_FROM_EMAIL) in the environment.
  - SlackNotifier — an incoming-webhook URL the user pastes into account
    settings (users.slack_webhook_url). No server-wide credential.

`notify_on_resolution()` is invoked once by the pipeline runner after an
incident reaches a terminal state (resolved / mitigation_failed /
awaiting_execution). It never raises — a failed send is logged, recorded on
the incident, and swallowed so it can't disrupt incident handling.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from html import escape

import httpx
from sqlalchemy import select

from config import settings
from db.database import session_scope
from db.models import Incident, User

log = logging.getLogger("crisis_room.notifier")

_OUTCOME = {
    "resolved": (
        "Resolved",
        "The incident was remediated automatically and the service has recovered.",
    ),
    "mitigation_failed": (
        "Action needed",
        "Automated remediation ran but the service is still degraded — a human needs to take over.",
    ),
    "awaiting_execution": (
        "Diagnosed — awaiting execution",
        "The incident was diagnosed and a remediation was chosen, but no infrastructure control "
        "plane is connected to carry it out.",
    ),
}


# ---------------------------------------------------------------------------
# channels
# ---------------------------------------------------------------------------
class EmailNotifier:
    """Resend transactional email. The `resend` SDK is synchronous, so the
    actual call runs in a worker thread."""

    def __init__(self) -> None:
        self.api_key = settings.resend_api_key
        self.from_email = settings.resend_from_email

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    async def send(self, *, to: str, subject: str, html: str, text: str) -> dict:
        if not self.configured:
            return {"channel": "email", "sent": False, "reason": "RESEND_API_KEY not set"}

        def _send() -> dict:
            import resend

            resend.api_key = self.api_key
            return resend.Emails.send(
                {
                    "from": self.from_email,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                    "text": text,
                }
            )

        try:
            result = await asyncio.to_thread(_send)
        except Exception as exc:  # noqa: BLE001 - report, never raise
            log.warning("email send failed: %s", exc)
            return {"channel": "email", "sent": False, "reason": f"{type(exc).__name__}: {exc}"}
        return {"channel": "email", "sent": True, "to": to, "id": (result or {}).get("id")}


class SlackNotifier:
    """Slack incoming webhook. `webhook_url` is per-user, from settings."""

    async def send(self, webhook_url: str, *, text: str, blocks: list | None = None) -> dict:
        if not webhook_url:
            return {"channel": "slack", "sent": False, "reason": "no webhook configured"}
        payload: dict = {"text": text}
        if blocks:
            payload["blocks"] = blocks
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(webhook_url, json=payload)
                resp.raise_for_status()
        except httpx.HTTPError as exc:
            log.warning("slack send failed: %s", exc)
            return {"channel": "slack", "sent": False, "reason": f"{type(exc).__name__}: {exc}"}
        return {"channel": "slack", "sent": True}


# ---------------------------------------------------------------------------
# report
# ---------------------------------------------------------------------------
def _duration(start: datetime | None, end: datetime | None) -> str:
    if not start or not end:
        return "—"
    secs = max(0, int((end - start).total_seconds()))
    if secs < 60:
        return f"{secs}s"
    if secs < 3600:
        return f"{secs // 60}m {secs % 60}s"
    return f"{secs // 3600}h {(secs % 3600) // 60}m"


def _message_for(final_update: dict, audience: str) -> str:
    for m in (final_update or {}).get("messages", []):
        if m.get("audience") == audience:
            return m.get("message", "")
    msgs = (final_update or {}).get("messages", [])
    return msgs[0].get("message", "") if msgs else ""


def _remediation_line(decision: dict, execution: dict) -> str:
    action = decision.get("action") or "—"
    if execution.get("executed") and execution.get("effective") is True:
        return f"{action} — applied to the target, service recovered"
    if execution.get("executed") and execution.get("effective") is False:
        return f"{action} — applied to the target but it did not clear the fault"
    if execution.get("executed"):
        return f"{action} — applied to the target"
    reason = execution.get("reason") or "no infrastructure control plane connected"
    return f"{action} — recommended, not executed ({reason})"


def _build_report(incident: Incident, user: User) -> dict:
    resolution = incident.resolution or {}
    decision = resolution.get("decision") or {}
    execution = resolution.get("execution") or {}
    final_update = resolution.get("final_update") or {}
    root_cause = resolution.get("root_cause") or "not determined"
    severity = incident.severity or resolution.get("severity") or "—"

    headline, blurb = _OUTCOME.get(incident.status, ("Incident update", "Incident status update."))
    remediation = _remediation_line(decision, execution)
    duration = _duration(incident.created_at, incident.resolved_at)
    link = f"{settings.public_app_url.rstrip('/')}/app/incidents/{incident.incident_id}"

    internal_msg = _message_for(final_update, "internal_eng")
    customer_msg = _message_for(final_update, "customers")

    subject = f"[Crisis Room] {headline} — {incident.title}"

    text = f"""{headline}: {incident.title}

{blurb}

Service:      {incident.service}
Severity:     {severity}
Status:       {incident.status}
Duration:     {duration}
Incident ID:  {incident.incident_id}

Root cause:   {root_cause}
Remediation:  {remediation}

Internal note:
{internal_msg}

Customer-facing note:
{customer_msg}

Full incident timeline: {link}

— Crisis Room · sent because a monitor you own raised this incident
"""

    rows = "".join(
        f'<tr><td style="padding:4px 14px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">{escape(k)}</td>'
        f'<td style="padding:4px 0;font-size:13px;color:#111827">{escape(v)}</td></tr>'
        for k, v in [
            ("Service", incident.service),
            ("Severity", str(severity)),
            ("Status", incident.status),
            ("Duration", duration),
            ("Incident ID", incident.incident_id),
            ("Root cause", root_cause),
            ("Remediation", remediation),
        ]
    )
    html = f"""<!doctype html><html><body style="margin:0;background:#f3f4f6;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="padding:18px 22px;border-bottom:1px solid #e5e7eb">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af">Crisis Room</div>
      <div style="font-size:17px;font-weight:600;color:#111827;margin-top:3px">{escape(headline)}: {escape(incident.title)}</div>
    </div>
    <div style="padding:18px 22px">
      <p style="margin:0 0 14px;font-size:14px;color:#374151">{escape(blurb)}</p>
      <table style="border-collapse:collapse;width:100%">{rows}</table>
      <div style="margin-top:16px;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px">
        <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">Internal note</div>
        <div style="font-size:13px;color:#111827">{escape(internal_msg)}</div>
      </div>
      <a href="{escape(link)}" style="display:inline-block;margin-top:18px;background:#111827;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 16px;border-radius:8px">View the full incident</a>
    </div>
    <div style="padding:12px 22px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af">
      Sent because a monitor you own raised this incident.
    </div>
  </div>
</body></html>"""

    slack_emoji = {"resolved": ":white_check_mark:", "mitigation_failed": ":rotating_light:"}.get(
        incident.status, ":memo:"
    )
    slack_text = f"{slack_emoji} {headline}: {incident.title} ({incident.service}, {severity})"
    slack_blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": f"{headline}: {incident.title}"[:150]}},
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Service:*\n{incident.service}"},
                {"type": "mrkdwn", "text": f"*Severity:*\n{severity}"},
                {"type": "mrkdwn", "text": f"*Status:*\n{incident.status}"},
                {"type": "mrkdwn", "text": f"*Duration:*\n{duration}"},
            ],
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Root cause:* {root_cause}\n*Remediation:* {remediation}"},
        },
    ]
    if internal_msg:
        slack_blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": internal_msg}})
    slack_blocks.append(
        {"type": "context", "elements": [{"type": "mrkdwn", "text": f"<{link}|Open incident {incident.incident_id}>"}]}
    )

    return {
        "subject": subject,
        "text": text,
        "html": html,
        "slack_text": slack_text,
        "slack_blocks": slack_blocks,
    }


# ---------------------------------------------------------------------------
# entry point (called by monitoring/runner.py)
# ---------------------------------------------------------------------------
async def notify_on_resolution(incident_id: str, *, user_id: int) -> dict | None:
    """Deliver the resolution report for one real incident to whatever the
    owning user has configured (account email via Resend, and/or a Slack
    webhook). Records the per-channel outcome on `incident.resolution`.
    Never raises."""
    db = session_scope()
    try:
        incident = db.scalar(
            select(Incident).where(
                Incident.incident_id == incident_id, Incident.user_id == user_id
            )
        )
        if incident is None:
            return None
        user = db.get(User, user_id)
        if user is None:
            return None

        report = _build_report(incident, user)
        results: list[dict] = []

        results.append(
            await EmailNotifier().send(
                to=user.email,
                subject=report["subject"],
                html=report["html"],
                text=report["text"],
            )
        )
        if user.slack_webhook_url:
            results.append(
                await SlackNotifier().send(
                    user.slack_webhook_url,
                    text=report["slack_text"],
                    blocks=report["slack_blocks"],
                )
            )

        merged = dict(incident.resolution or {})
        merged["notifications"] = {
            "at": datetime.now(timezone.utc).isoformat(),
            "results": results,
        }
        incident.resolution = merged
        db.commit()

        summary = " ".join(
            f"{r['channel']}{'✓' if r.get('sent') else '✗'}" for r in results
        )
        log.info("incident %s notifications: %s", incident_id, summary or "none")
        return {"results": results}
    except Exception:  # noqa: BLE001 - notifier must never break the pipeline
        log.exception("notify_on_resolution failed for %s", incident_id)
        return None
    finally:
        db.close()
