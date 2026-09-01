"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ExternalLink, RefreshCw } from "lucide-react";
import { sitesApi, incidentsApi, ApiError } from "../../lib/appApi";
import { useAppUser } from "../../components/AppShell";

const SEV_COLOR = { SEV1: "var(--sev1)", SEV2: "var(--sev2)", SEV3: "var(--sev3)", SEV4: "var(--sev4)" };

const STATUS_LABEL = {
  active: "in progress",
  diagnosed: "diagnosed",
  resolved: "resolved",
  mitigation_failed: "mitigation failed",
  awaiting_execution: "awaiting execution",
};
const statusLabel = (s) => STATUS_LABEL[s] || s;

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return d.toLocaleDateString();
}

export default function DashboardPage() {
  const { user } = useAppUser();
  const router = useRouter();

  const [sites, setSites] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loadError, setLoadError] = useState(null);

  const [url, setUrl] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [pollInterval, setPollInterval] = useState(30);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadSites = useCallback(async () => {
    try {
      setSites(await sitesApi.list());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load sites.");
    }
  }, []);

  const loadIncidents = useCallback(async () => {
    try {
      setIncidents(await incidentsApi.list());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load incidents.");
    }
  }, []);

  useEffect(() => {
    loadSites();
    loadIncidents();
  }, [loadSites, loadIncidents]);

  // Keep the incident list current — a monitor can fire one at any time, and
  // in offline mode the whole pipeline runs in a few seconds, so poll fast
  // (and faster still while something is mid-flight) or the "in progress"
  // state blinks past between refreshes.
  const hasRunning = useMemo(
    () => incidents.some((i) => i.status === "active" || i.status === "diagnosed"),
    [incidents]
  );
  useEffect(() => {
    const id = setInterval(loadIncidents, hasRunning ? 1500 : 5000);
    return () => clearInterval(id);
  }, [loadIncidents, hasRunning]);

  async function refreshAll() {
    setRefreshing(true);
    await Promise.all([loadSites(), loadIncidents()]);
    setRefreshing(false);
  }

  async function onAddSite(e) {
    e.preventDefault();
    setFormError(null);
    setAdding(true);
    try {
      const payload = { url: url.trim() };
      if (serviceName.trim()) payload.service_name = serviceName.trim();
      const n = Number(pollInterval);
      if (n && n >= 5) payload.thresholds = { poll_interval_seconds: n };
      await sitesApi.create(payload);
      setUrl("");
      setServiceName("");
      await loadSites();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't add that site.");
    } finally {
      setAdding(false);
    }
  }

  async function onDeleteSite(id) {
    if (!confirm("Stop monitoring this site? Incident history is kept.")) return;
    try {
      await sitesApi.remove(id);
      await loadSites();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Couldn't remove that site.");
    }
  }

  const activeCount = useMemo(
    () => incidents.filter((i) => i.status === "active" || i.status === "diagnosed").length,
    [incidents]
  );
  const failedCount = useMemo(
    () => incidents.filter((i) => i.status === "mitigation_failed").length,
    [incidents]
  );

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <h1>YOUR MONITORS</h1>
          <p className="tagline">
            {user?.email} · {sites.length} site{sites.length === 1 ? "" : "s"} watched ·{" "}
            {incidents.length} incident{incidents.length === 1 ? "" : "s"}
            {activeCount > 0 ? ` · ${activeCount} active now` : ""}
            {failedCount > 0 ? ` · ${failedCount} needs attention` : ""}
          </p>
        </div>
        <button className="refresh" onClick={refreshAll} disabled={refreshing}>
          <RefreshCw size={13} className={refreshing ? "spin" : ""} /> Refresh
        </button>
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      <section className="layout">
        <div className="col">
          <div className="panel">
            <p className="panel-label">Add a website</p>
            <form onSubmit={onAddSite} className="add-form">
              <label>
                <span>URL to monitor</span>
                <input
                  type="url"
                  required
                  placeholder="https://api.yourservice.com/health"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <div className="row">
                <label>
                  <span>Service name (optional)</span>
                  <input
                    type="text"
                    placeholder="from URL host"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                  />
                </label>
                <label className="narrow">
                  <span>Poll every (s)</span>
                  <input
                    type="number"
                    min={5}
                    max={3600}
                    value={pollInterval}
                    onChange={(e) => setPollInterval(e.target.value)}
                  />
                </label>
              </div>
              {formError && <p className="form-error">{formError}</p>}
              <button type="submit" disabled={adding}>
                <Plus size={14} /> {adding ? "Starting monitor…" : "Start monitoring"}
              </button>
            </form>
            <p className="hint">
              Crisis Room polls this URL itself and runs the full agent pipeline the moment it detects sustained
              degradation — no external monitoring tool needed.
            </p>
          </div>

          <div className="panel">
            <p className="panel-label">Monitored sites</p>
            {sites.length === 0 ? (
              <p className="empty">No sites yet. Add one above.</p>
            ) : (
              <ul className="site-list">
                {sites.map((s) => (
                  <li key={s.id}>
                    <div className="site-main">
                      <span className="site-name">{s.service_name}</span>
                      <span className="site-url">{s.url}</span>
                      <span className="site-meta">
                        <span className={`dot ${s.monitor_running ? "dot--on" : "dot--off"}`} />
                        {s.monitor_running ? "monitoring" : "stopped"} · every{" "}
                        {s.thresholds?.poll_interval_seconds ?? 30}s · {s.incident_count} incident
                        {s.incident_count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <button className="icon-btn" onClick={() => onDeleteSite(s.id)} aria-label="Stop monitoring">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="col">
          <div className="panel">
            <p className="panel-label">Incident history</p>
            {incidents.length === 0 ? (
              <p className="empty">
                No incidents yet. When a monitored site degrades, the agents will handle it and it&apos;ll show up
                here.
              </p>
            ) : (
              <ul className="incident-list">
                {incidents.map((inc) => (
                  <li key={inc.incident_id}>
                    <button className="incident-row" onClick={() => router.push(`/app/incidents/${inc.incident_id}`)}>
                      <div className="incident-top">
                        <span className="incident-title">{inc.title}</span>
                        {inc.severity && (
                          <span className="sev" style={{ color: SEV_COLOR[inc.severity], borderColor: SEV_COLOR[inc.severity] }}>
                            {inc.severity}
                          </span>
                        )}
                      </div>
                      <div className="incident-meta">
                        <span className={`status status--${inc.status}`}>{statusLabel(inc.status)}</span>
                        <span>·</span>
                        <span>{inc.service}</span>
                        <span>·</span>
                        <span>{inc.source.replace("_", " ")}</span>
                        <span>·</span>
                        <span>{timeAgo(inc.created_at)}</span>
                        <ExternalLink size={12} className="go" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <style jsx>{`
        .page {
          position: relative;
          z-index: 1;
          max-width: 1180px;
          margin: 0 auto;
          padding: 28px 24px 60px;
        }
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
          margin: 8px 0 24px;
        }
        h1 {
          font-family: var(--font-pixel);
          font-size: 26px;
          letter-spacing: -0.03em;
          margin: 0;
        }
        .tagline {
          color: var(--text-dim);
          margin: 6px 0 0;
          font-size: 13px;
          font-family: var(--font-mono);
        }
        .refresh {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: #fff;
          font-size: 12.5px;
          padding: 8px 14px;
          border-radius: 999px;
          cursor: pointer;
        }
        .refresh:disabled {
          opacity: 0.6;
        }
        .refresh :global(.spin) {
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .banner {
          background: rgba(255, 107, 107, 0.1);
          border: 1px solid var(--sev1);
          color: var(--sev1);
          padding: 11px 15px;
          border-radius: 10px;
          font-size: 13px;
          margin-bottom: 18px;
        }
        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .layout {
            grid-template-columns: 1fr;
          }
        }
        .col {
          display: flex;
          flex-direction: column;
          gap: 20px;
          min-width: 0;
        }
        .panel {
          background: rgba(16, 17, 20, 0.72);
          border: 1px solid var(--panel-border);
          border-radius: 14px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          padding: 18px 20px 20px;
        }
        .panel-label {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-faint);
          margin: 0 0 14px;
        }
        .add-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .add-form .row {
          display: flex;
          gap: 12px;
        }
        .add-form label {
          display: flex;
          flex-direction: column;
          gap: 5px;
          flex: 1;
        }
        .add-form label.narrow {
          flex: 0 0 110px;
        }
        .add-form label span {
          font-size: 11px;
          color: var(--text-faint);
          font-family: var(--font-mono);
        }
        .add-form input {
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid var(--panel-border);
          border-radius: 9px;
          padding: 10px 12px;
          color: var(--text-primary);
          font-family: var(--font-body);
          font-size: 13.5px;
        }
        .add-form input:focus {
          outline: none;
          border-color: var(--panel-border-active);
        }
        .form-error {
          color: var(--sev1);
          font-size: 12.5px;
          margin: 0;
        }
        .add-form button {
          align-self: flex-start;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(255, 255, 255, 0.94);
          color: #14181d;
          border: none;
          border-radius: 999px;
          padding: 10px 18px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
        }
        .add-form button:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .hint {
          margin: 14px 0 0;
          font-size: 12px;
          line-height: 1.55;
          color: var(--text-faint);
        }
        .empty {
          color: var(--text-faint);
          font-size: 13px;
          line-height: 1.6;
          margin: 0;
        }
        .site-list,
        .incident-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .site-list li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--panel-border);
          border-radius: 10px;
          padding: 11px 12px;
        }
        .site-main {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .site-name {
          font-weight: 600;
          font-size: 13.5px;
        }
        .site-url {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-faint);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .site-meta {
          font-family: var(--font-mono);
          font-size: 10.5px;
          color: var(--text-faint);
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 2px;
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .dot--on {
          background: var(--teal);
          box-shadow: 0 0 8px var(--teal);
        }
        .dot--off {
          background: var(--text-faint);
        }
        .icon-btn {
          flex-shrink: 0;
          background: transparent;
          border: 1px solid var(--panel-border);
          color: var(--text-faint);
          border-radius: 8px;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: color 0.15s ease, border-color 0.15s ease;
        }
        .icon-btn:hover {
          color: var(--sev1);
          border-color: var(--sev1);
        }
        .incident-row {
          width: 100%;
          text-align: left;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--panel-border);
          border-radius: 10px;
          padding: 12px 13px;
          cursor: pointer;
          color: var(--text-primary);
          transition: border-color 0.15s ease;
        }
        .incident-row:hover {
          border-color: var(--panel-border-active);
        }
        .incident-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .incident-title {
          font-size: 13.5px;
          font-weight: 500;
        }
        .sev {
          font-family: var(--font-mono);
          font-size: 10px;
          border: 1px solid;
          border-radius: 5px;
          padding: 1px 6px;
          flex-shrink: 0;
        }
        .incident-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 6px;
          font-family: var(--font-mono);
          font-size: 10.5px;
          color: var(--text-faint);
        }
        .status {
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .status--active,
        .status--diagnosed {
          color: var(--amber);
          animation: pulse 1.2s ease-in-out infinite;
        }
        @keyframes pulse {
          50% {
            opacity: 0.45;
          }
        }
        .status--resolved {
          color: var(--teal);
        }
        .status--mitigation_failed {
          color: var(--sev1);
        }
        .status--awaiting_execution {
          color: var(--text-dim);
        }
        .incident-meta :global(.go) {
          margin-left: auto;
          opacity: 0.5;
        }
      `}</style>
    </main>
  );
}
