"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Mail, Slack } from "lucide-react";
import { useRouter } from "next/navigation";
import { accountApi, ApiError } from "../../../lib/appApi";

export default function SettingsPage() {
  const router = useRouter();

  const [account, setAccount] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [webhook, setWebhook] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await accountApi.get();
      setAccount(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load account settings.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onSave(e) {
    e.preventDefault();
    setFormError(null);
    setNotice(null);
    setSaving(true);
    try {
      const res = await accountApi.setSlackWebhook(webhook.trim() || null);
      setAccount((a) => ({ ...a, slack_webhook_configured: res.slack_webhook_configured }));
      setWebhook("");
      setNotice(res.slack_webhook_configured ? "Slack webhook saved." : "Slack webhook removed.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setFormError(null);
    setNotice(null);
    setTesting(true);
    try {
      await accountApi.testSlackWebhook();
      setNotice("Test message sent — check your Slack channel.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <main className="page">
      <button className="back" onClick={() => router.push("/app")}>
        <ArrowLeft size={14} /> Back to dashboard
      </button>

      <h1>SETTINGS</h1>
      <p className="tagline">Where Crisis Room sends the resolution report when one of your monitors resolves an incident.</p>

      {loadError && <div className="banner">{loadError}</div>}

      <section className="panel">
        <div className="panel-head">
          <Mail size={15} />
          <span>Email</span>
        </div>
        {account ? (
          account.email_notifications_enabled ? (
            <p className="ok">
              <Check size={13} /> Resolution reports are emailed to <strong>{account.email}</strong>.
            </p>
          ) : (
            <p className="muted">
              Email notifications are off. Set <code>RESEND_API_KEY</code> in the server&apos;s <code>.env</code> and
              restart to enable them — reports will then go to <strong>{account.email}</strong>.
            </p>
          )
        ) : (
          <p className="muted">Loading…</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <Slack size={15} />
          <span>Slack</span>
          {account?.slack_webhook_configured && (
            <span className="pill">
              <Check size={11} /> connected
            </span>
          )}
        </div>
        <p className="muted">
          Paste an{" "}
          <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer">
            incoming-webhook URL
          </a>{" "}
          for the channel that should receive incident updates.
        </p>
        <form onSubmit={onSave} className="form">
          <input
            type="url"
            placeholder={
              account?.slack_webhook_configured
                ? "Enter a new URL to replace the saved one"
                : "https://hooks.slack.com/services/T000/B000/xxxx"
            }
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
          />
          {formError && <p className="form-error">{formError}</p>}
          {notice && <p className="form-ok">{notice}</p>}
          <div className="actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : account?.slack_webhook_configured && !webhook.trim() ? "Remove webhook" : "Save webhook"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={onTest}
              disabled={testing || !account?.slack_webhook_configured}
            >
              {testing ? "Sending…" : "Send test message"}
            </button>
          </div>
        </form>
      </section>

      <style jsx>{`
        .page {
          position: relative;
          z-index: 1;
          max-width: 680px;
          margin: 0 auto;
          padding: 24px 24px 60px;
        }
        .back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: none;
          color: var(--text-dim);
          font-size: 13px;
          cursor: pointer;
          padding: 6px 0;
          margin-bottom: 14px;
        }
        .back:hover {
          color: var(--text-primary);
        }
        h1 {
          font-family: var(--font-pixel);
          font-size: 24px;
          letter-spacing: -0.03em;
          margin: 0;
        }
        .tagline {
          color: var(--text-dim);
          margin: 6px 0 22px;
          font-size: 13px;
          font-family: var(--font-mono);
        }
        .banner {
          background: rgba(255, 107, 107, 0.1);
          border: 1px solid var(--sev1);
          color: var(--sev1);
          padding: 11px 15px;
          border-radius: 10px;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .panel {
          background: rgba(16, 17, 20, 0.72);
          border: 1px solid var(--panel-border);
          border-radius: 14px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          padding: 18px 20px 20px;
          margin-bottom: 16px;
        }
        .panel-head {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 12px;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-family: var(--font-mono);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--teal);
          border: 1px solid var(--teal);
          border-radius: 999px;
          padding: 2px 8px;
        }
        .ok {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          color: var(--teal);
          margin: 0;
        }
        .muted {
          font-size: 12.5px;
          line-height: 1.6;
          color: var(--text-faint);
          margin: 0 0 12px;
        }
        .muted code {
          font-family: var(--font-mono);
          font-size: 11.5px;
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 5px;
          border-radius: 4px;
        }
        .muted a,
        a {
          color: var(--text-dim);
          text-decoration: underline;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .form input {
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid var(--panel-border);
          border-radius: 9px;
          padding: 10px 12px;
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 12.5px;
        }
        .form input:focus {
          outline: none;
          border-color: var(--panel-border-active);
        }
        .form-error {
          color: var(--sev1);
          font-size: 12.5px;
          margin: 0;
        }
        .form-ok {
          color: var(--teal);
          font-size: 12.5px;
          margin: 0;
        }
        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .actions button {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(255, 255, 255, 0.94);
          color: #14181d;
          border: none;
          border-radius: 999px;
          padding: 9px 16px;
          font-weight: 600;
          font-size: 12.5px;
          cursor: pointer;
        }
        .actions button.ghost {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: #fff;
        }
        .actions button:disabled {
          opacity: 0.5;
          cursor: default;
        }
      `}</style>
    </main>
  );
}
