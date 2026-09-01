"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { fetchScenarios, fetchHealth, triggerScenario, streamLiveFeed } from "../../lib/api";
import PipelineRail from "../../components/PipelineRail";
import AgentPanel from "../../components/AgentPanel";
import ReasoningTerminal from "../../components/ReasoningTerminal";
import LiveIncidentFeed from "../../components/LiveIncidentFeed";
import Nav from "../../components/Nav";

const AGENTS = ["triage", "investigator", "commander", "communicator"];

function emptyDetail() {
  return {
    agentStatus: {},
    agentOutputs: {},
    agentLatency: {},
    executionResult: null,
    recoveryTicks: [],
    initialErrorRate: 0,
    lines: [],
    resolved: false,
  };
}

export default function Page() {
  const [scenarios, setScenarios] = useState({});
  const [health, setHealth] = useState(null);
  const [feedStatus, setFeedStatus] = useState("connecting");
  const [error, setError] = useState(null);

  const [incidents, setIncidents] = useState({}); // incident_id -> summary for the feed list
  const [details, setDetails] = useState({}); // incident_id -> full agent detail
  const [selectedId, setSelectedId] = useState(null);
  const selectedIdRef = useRef(null);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    fetchScenarios()
      .then(setScenarios)
      .catch(() => setError("Can't reach the Crisis Room API. Is `uvicorn server.main:app` running on :8000?"));
    fetchHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  // The one always-on connection. Every incident from every source (a real
  // webhook or a demo button) arrives here automatically - this is the
  // actual product surface, not a per-click demo convenience.
  useEffect(() => {
    const cleanup = streamLiveFeed(
      (event) => {
        const { incident_id, agent, event_type, output, reasoning_trace, latency_ms, timestamp } = event;

        setIncidents((prev) => {
          const existing = prev[incident_id] || { incident_id, startedAt: Date.now() };
          const next = { ...existing };
          if (event_type === "started" && output) {
            next.title = output.title;
            next.service = output.service;
            next.source = output.source;
            next.errorRate = output.error_rate_pct;
          }
          if (agent === "triage" && output) next.severity = output.severity;
          if (event_type === "incident_resolved") next.resolved = true;
          return { ...prev, [incident_id]: next };
        });

        setDetails((prev) => {
          const d = prev[incident_id] ? { ...prev[incident_id] } : emptyDetail();
          const ts = new Date(timestamp).toLocaleTimeString();
          d.lines = [...d.lines, { agent, text: reasoning_trace, timestamp: ts }];

          if (event_type === "started" && output) {
            d.initialErrorRate = output.error_rate_pct;
          }
          if (event_type === "output" && agent !== "system" && output) {
            d.agentOutputs = { ...d.agentOutputs, [agent]: output };
            if (latency_ms !== undefined) d.agentLatency = { ...d.agentLatency, [agent]: latency_ms };
            const idx = AGENTS.indexOf(agent);
            const nextStatus = { ...d.agentStatus, [agent]: "done" };
            if (idx >= 0 && idx + 1 < AGENTS.length && !nextStatus[AGENTS[idx + 1]]) {
              nextStatus[AGENTS[idx + 1]] = "active";
            }
            d.agentStatus = nextStatus;
          }
          if (event_type === "execution") {
            d.executionResult = output;
          }
          if (event_type === "recovery_tick") {
            d.recoveryTicks = [...d.recoveryTicks, output];
          }
          if (event_type === "incident_resolved") {
            d.resolved = true;
          }
          return { ...prev, [incident_id]: d };
        });

        // auto-select the very first incident this dashboard ever sees, and
        // auto-follow new ones only if nothing is currently selected -
        // once a user picks an incident to watch, don't yank it from them.
        if (!selectedIdRef.current && event_type === "started") {
          setSelectedId(incident_id);
        }
      },
      (status) => setFeedStatus(status)
    );
    return cleanup;
  }, []);

  const runScenario = useCallback(async (key) => {
    setError(null);
    try {
      const { incident_id } = await triggerScenario(key);
      setSelectedId(incident_id); // watch the one we just triggered
    } catch (e) {
      setError("Failed to start incident. Check the API server.");
    }
  }, []);

  const selected = selectedId ? incidents[selectedId] : null;
  const detail = selectedId ? details[selectedId] || emptyDetail() : emptyDetail();
  const anyRunning = Object.values(incidents).some((i) => !i.resolved);

  return (
    <>
      <Nav />
      <main className="page">
      <header className="topbar">
        <div>
          <h1>CRISIS ROOM</h1>
          <p className="tagline">Multi-agent incident command — every decision, live and explainable.</p>
        </div>
        <div className="badges">
          <div className={`health ${health?.llm_mode === "live" ? "health--live" : "health--offline"}`}>
            <span className="dot" />
            {health ? (health.llm_mode === "live" ? "LIVE AI MODE" : "OFFLINE FALLBACK MODE") : "connecting…"}
          </div>
          <div className={`health ${feedStatus === "connected" ? "health--live" : "health--offline"}`}>
            <span className="dot" />
            {feedStatus === "connected" ? "LISTENING FOR INCIDENTS" : "FEED " + feedStatus.toUpperCase()}
          </div>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="layout">
        <div className="left-col">
          <LiveIncidentFeed incidents={incidents} selectedId={selectedId} onSelect={setSelectedId} />

          <div className="controls">
            <p className="controls-label">Or trigger a demo scenario</p>
            <div className="scenario-row">
              {Object.entries(scenarios).map(([key, sig]) => (
                <button key={key} className="scenario-btn" onClick={() => runScenario(key)}>
                  <span className="scenario-title">{sig.title}</span>
                  <span className="scenario-meta">
                    {sig.service} · {sig.error_rate_pct}% errors
                  </span>
                </button>
              ))}
            </div>
            <p className="webhook-hint">
              A real deployment skips this box entirely: point Datadog / PagerDuty / Prometheus Alertmanager at{" "}
              <code>POST /api/webhooks/&#123;source&#125;</code> and incidents appear above automatically.
            </p>
          </div>
        </div>

        <div className="right-col">
          {selected ? (
            <>
              <div className="selected-head">
                <h2>{selected.title}</h2>
                <span className="selected-meta">
                  {selected.service} · via {selected.source}
                </span>
              </div>
              <PipelineRail agentStatus={detail.agentStatus} resolved={detail.resolved} />
              <section className="panels-grid">
                {AGENTS.map((a) => (
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
          ) : (
            <div className="placeholder-panel">
              <p>No incident selected yet.</p>
              <p className="dim">Trigger a scenario, or send a webhook to see it appear here automatically.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="footer">Team Gol_Gappe · Build with Bharat 2.0 · Crisis Room</footer>

      <style jsx>{`
        .page {
          max-width: 1280px;
          margin: 0 auto;
          padding: 40px 24px 60px;
        }
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 28px;
        }
        h1 {
          font-family: var(--font-pixel);
          font-size: 30px;
          letter-spacing: -0.03em;
          margin: 0;
        }
        .tagline {
          color: var(--text-dim);
          margin: 6px 0 0;
          font-size: 14px;
        }
        .badges {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
        }
        .health {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid var(--panel-border);
          color: var(--text-faint);
        }
        .health .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
        }
        .health--live {
          color: var(--teal);
          border-color: var(--teal);
        }
        .health--offline {
          color: var(--amber);
          border-color: var(--amber-dim);
        }
        .error-banner {
          background: rgba(229, 72, 77, 0.1);
          border: 1px solid var(--sev1);
          color: var(--sev1);
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 20px;
        }
        .layout {
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 20px;
          align-items: start;
        }
        .left-col,
        .right-col {
          min-width: 0;
        }
        @media (max-width: 900px) {
          .layout {
            grid-template-columns: 1fr;
          }
        }
        .controls {
          background: var(--panel);
          border: 1px solid var(--panel-border);
          border-radius: 12px;
          padding: 16px 18px;
          margin-top: 16px;
        }
        .controls-label {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-faint);
          margin: 0 0 10px;
        }
        .scenario-row {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .scenario-btn {
          text-align: left;
          background: var(--bg);
          border: 1px solid var(--panel-border);
          border-radius: 8px;
          padding: 10px 12px;
          color: var(--text-primary);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 2px;
          transition: border-color 0.2s ease;
        }
        .scenario-btn:hover {
          border-color: var(--panel-border-active);
        }
        .scenario-title {
          font-weight: 500;
          font-size: 13px;
        }
        .scenario-meta {
          font-family: var(--font-mono);
          font-size: 10.5px;
          color: var(--text-faint);
        }
        .webhook-hint {
          font-size: 11.5px;
          color: var(--text-faint);
          line-height: 1.6;
          margin: 12px 0 0;
        }
        .webhook-hint code {
          font-family: var(--font-mono);
          background: rgba(255, 255, 255, 0.07);
          padding: 1px 5px;
          border-radius: 4px;
          word-break: break-all;
          overflow-wrap: anywhere;
        }
        .selected-head {
          margin-bottom: 4px;
        }
        .selected-head h2 {
          font-family: var(--font-display);
          font-size: 20px;
          margin: 0;
        }
        .selected-meta {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-faint);
        }
        .panels-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
          margin: 20px 0;
        }
        .placeholder-panel {
          background: var(--panel);
          border: 1px dashed var(--panel-border);
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          color: var(--text-dim);
        }
        .placeholder-panel .dim {
          color: var(--text-faint);
          font-size: 13px;
          margin-top: 6px;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          color: var(--text-faint);
          font-family: var(--font-mono);
          font-size: 11px;
        }
      `}</style>
    </main>
    </>
  );
}
