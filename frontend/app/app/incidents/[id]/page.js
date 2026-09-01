"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import PipelineRail from "../../../../components/PipelineRail";
import AgentPanel from "../../../../components/AgentPanel";
import ReasoningTerminal from "../../../../components/ReasoningTerminal";
import { incidentsApi, ApiError } from "../../../../lib/appApi";
import { reduceIncidentEvents, PIPELINE_AGENTS } from "../../../../lib/incidentEvents";

const SEV_COLOR = { SEV1: "var(--sev1)", SEV2: "var(--sev2)", SEV3: "var(--sev3)", SEV4: "var(--sev4)" };

const STATUS_LABEL = {
  active: "in progress",
  diagnosed: "diagnosed",
  resolved: "resolved",
  mitigation_failed: "mitigation failed",
  awaiting_execution: "awaiting execution",
};
const RUNNING = (s) => s === "active" || s === "diagnosed";

export default function IncidentDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [incident, setIncident] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await incidentsApi.get(id);
      setIncident(data);
      setError(null);
      return data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError("notfound");
      else setError(err instanceof ApiError ? err.message : "Failed to load incident.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // while the pipeline is still running, poll for new persisted events
  useEffect(() => {
    if (!incident || !RUNNING(incident.status)) return;
    pollRef.current = setInterval(async () => {
      const data = await load();
      if (data && !RUNNING(data.status) && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [incident, load]);

  const detail = useMemo(() => reduceIncidentEvents(incident?.events || []), [incident]);
  const signal = incident?.signal;

  return (
    <main className="page">
      <button className="back" onClick={() => router.push("/app")}>
        <ArrowLeft size={14} /> Back to dashboard
      </button>

      {loading && <p className="msg">Loading incident…</p>}

      {error === "notfound" && <p className="msg">This incident doesn&apos;t exist, or isn&apos;t yours.</p>}
      {error && error !== "notfound" && <div className="banner">{error}</div>}

      {incident && (
        <>
          <header className="head">
            <div className="head-main">
              <h1>{incident.title}</h1>
              <div className="head-meta">
                {incident.severity && (
                  <span
                    className="sev"
                    style={{ color: SEV_COLOR[incident.severity], borderColor: SEV_COLOR[incident.severity] }}
                  >
                    {incident.severity}
                  </span>
                )}
                <span className={`status status--${incident.status}`}>
                  {STATUS_LABEL[incident.status] || incident.status}
                </span>
                <span>·</span>
                <span>{incident.service}</span>
                <span>·</span>
                <span>via {incident.source.replace("_", " ")}</span>
                <span>·</span>
                <span>{new Date(incident.created_at).toLocaleString()}</span>
              </div>
            </div>
            <span className="incident-id">{incident.incident_id}</span>
          </header>

          {incident.status === "mitigation_failed" && (
            <div className="notice notice--fail">
              The remediation
              {detail.executionResult?.action ? ` (${detail.executionResult.action})` : ""} was executed
              against the target but did not clear the fault — the service is still degraded. The monitor is
              still watching and will re-run the pipeline if degradation persists.
            </div>
          )}
          {incident.status === "awaiting_execution" && (
            <div className="notice notice--wait">
              Diagnosis and remediation are complete, but no infra control plane is connected for this
              service, so nothing was executed automatically. The recovery curve below is a projection, not a
              measurement — a human or a connected integration carries out the fix.
            </div>
          )}

          {incident.resolution?.notifications?.results?.length > 0 && (
            <div className="notifs">
              <span className="notifs-label">Notified:</span>
              {incident.resolution.notifications.results.map((r, i) => (
                <span key={i} className={`notif ${r.sent ? "notif--ok" : "notif--fail"}`}>
                  {r.channel} {r.sent ? "✓" : `✗ ${r.reason || "failed"}`}
                </span>
              ))}
            </div>
          )}

          {signal && (
            <section className="signal-card">
              <p className="card-label">Detection signal</p>
              <div className="signal-grid">
                <div>
                  <span className="k">error rate</span>
                  <span className="v">{signal.error_rate_pct?.toFixed?.(1) ?? signal.error_rate_pct}%</span>
                </div>
                <div>
                  <span className="k">p99 latency</span>
                  <span className="v">{Math.round(signal.latency_p99_ms)}ms</span>
                </div>
                <div>
                  <span className="k">source</span>
                  <span className="v">{signal.source}</span>
                </div>
              </div>
              {signal.raw_context && <p className="raw">{signal.raw_context}</p>}
            </section>
          )}

          <PipelineRail agentStatus={detail.agentStatus} resolved={detail.resolved} />

          <section className="panels-grid">
            {PIPELINE_AGENTS.map((a) => (
              <AgentPanel
                key={a}
                agentKey={a}
                output={detail.agentOutputs[a]}
                active={detail.agentStatus[a] === "active"}
                latencyMs={detail.agentLatency[a]}
                executionResult={a === "commander" ? detail.executionResult : undefined}
                recoveryTicks={a === "commander" ? detail.recoveryTicks : undefined}
                initialErrorRate={detail.initialErrorRate}
              />
            ))}
          </section>

          <section className="terminal-section">
            <ReasoningTerminal lines={detail.lines} />
          </section>
        </>
      )}

      <style jsx>{`
        .page {
          position: relative;
          z-index: 1;
          max-width: 1180px;
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
        .msg {
          color: var(--text-faint);
          font-family: var(--font-mono);
          font-size: 13px;
        }
        .banner {
          background: rgba(255, 107, 107, 0.1);
          border: 1px solid var(--sev1);
          color: var(--sev1);
          padding: 11px 15px;
          border-radius: 10px;
          font-size: 13px;
        }
        .head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        h1 {
          font-family: var(--font-display);
          font-size: 22px;
          margin: 0 0 8px;
        }
        .head-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 7px;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-faint);
        }
        .sev {
          border: 1px solid;
          border-radius: 5px;
          padding: 1px 6px;
        }
        .status {
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .status--active,
        .status--diagnosed {
          color: var(--amber);
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
        .notice {
          border-radius: 10px;
          padding: 11px 15px;
          font-size: 12.5px;
          line-height: 1.6;
          margin-bottom: 14px;
        }
        .notice--fail {
          background: rgba(255, 107, 107, 0.1);
          border: 1px solid var(--sev1);
          color: var(--sev1);
        }
        .notice--wait {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--panel-border);
          color: var(--text-dim);
        }
        .notifs {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 14px;
          font-family: var(--font-mono);
          font-size: 11px;
        }
        .notifs-label {
          color: var(--text-faint);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .notif {
          border: 1px solid var(--panel-border);
          border-radius: 5px;
          padding: 2px 7px;
        }
        .notif--ok {
          color: var(--teal);
          border-color: var(--teal);
        }
        .notif--fail {
          color: var(--text-dim);
        }
        .incident-id {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-faint);
        }
        .signal-card {
          background: rgba(16, 17, 20, 0.72);
          border: 1px solid var(--panel-border);
          border-radius: 12px;
          padding: 16px 18px;
          margin-bottom: 8px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .card-label {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-faint);
          margin: 0 0 12px;
        }
        .signal-grid {
          display: flex;
          gap: 28px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .signal-grid > div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .k {
          font-family: var(--font-mono);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-faint);
        }
        .v {
          font-size: 16px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .raw {
          margin: 0;
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.6;
          color: var(--text-dim);
          word-break: break-word;
        }
        .panels-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
          margin: 14px 0 20px;
        }
        .terminal-section {
          margin-top: 4px;
        }
      `}</style>
    </main>
  );
}
