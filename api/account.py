"""
Authenticated account settings.

  GET  /api/account                      -> email + which notification channels are set up
  PUT  /api/account/slack-webhook        -> save (or clear) the user's Slack incoming-webhook URL
  POST /api/account/slack-webhook/test   -> post a test message to that webhook

Email notifications need a server-wide RESEND_API_KEY (see config.py); the
Slack webhook is per-user and lives in users.slack_webhook_url. Both are
used by integrations/notifiers.py when a real monitor incident resolves.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from db.database import get_db
from db.models import User

router = APIRouter(prefix="/api/account", tags=["account"])

_SLACK_PREFIX = "https://hooks.slack.com/"


class AccountOut(BaseModel):
    email: str
    slack_webhook_configured: bool
    email_notifications_enabled: bool


class SlackWebhookIn(BaseModel):
    webhook_url: str | None = None


class SlackWebhookOut(BaseModel):
    slack_webhook_configured: bool


@router.get("", response_model=AccountOut)
def get_account(user: User = Depends(get_current_user)) -> AccountOut:
    from integrations.notifiers import EmailNotifier

    return AccountOut(
        email=user.email,
        slack_webhook_configured=bool(user.slack_webhook_url),
        email_notifications_enabled=EmailNotifier().configured,
    )


@router.put("/slack-webhook", response_model=SlackWebhookOut)
def set_slack_webhook(
    body: SlackWebhookIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SlackWebhookOut:
    url = (body.webhook_url or "").strip()
    if url and not url.startswith(_SLACK_PREFIX):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "That doesn't look like a Slack incoming-webhook URL (it should start with "
            "https://hooks.slack.com/).",
        )
    user.slack_webhook_url = url or None
    db.commit()
    return SlackWebhookOut(slack_webhook_configured=bool(user.slack_webhook_url))


@router.post("/slack-webhook/test")
async def test_slack_webhook(user: User = Depends(get_current_user)) -> dict:
    if not user.slack_webhook_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Save a Slack webhook URL first.")

    from integrations.notifiers import SlackNotifier

    result = await SlackNotifier().send(
        user.slack_webhook_url,
        text=":white_check_mark: Crisis Room is connected. Incident notifications will arrive in this channel.",
    )
    if not result.get("sent"):
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Slack rejected the test message: {result.get('reason')}",
        )
    return {"ok": True}
