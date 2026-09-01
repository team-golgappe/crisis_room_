"use client";

import RecoveryChart from "./RecoveryChart";

const AGENT_META = {
  triage: { title: "Triage", subtitle: "Classifies signals" },
  investigator: { title: "Investigator", subtitle: "Root-cause analysis" },
  commander: { title: "Commander", subtitle: "Decision maker" },
  communicator: { title: "Communicator", subtitle: "Stakeholder sync" },
};

const SEV_COLOR = { SEV1: "var(--sev1)", SEV2: "var(--sev2)", SEV3: "var(--sev3)", SEV4: "var(--sev4)" };

function ConfidenceBar({ value }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="conf">
      <div className="conf-track">
        <div className="conf-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="conf-label">{Math.round(value * 100)}% confidence</span>
      <style jsx>{`
        .conf {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
        }
        .conf-track {
          flex: 1;
          height: 4px;
          background: var(--panel-border);
          border-radius: 2px;
          overflow: hidden;
        }
        .conf-fill {
          height: 100%;
          background: var(--amber);
        }
        .conf-label {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-faint);
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}

function AgentBody({ agentKey, output, executionResult, recoveryTicks, initialErrorRate }) {
  if (!output) return <p className="empty">Awaiting handoff…</p>;

  if (agentKey === "triage") {
    return (
      <>
        <div className="sev-row">
          <span className="sev-badge" style={{ color: SEV_COLOR[output.severity], borderColor: SEV_COLOR[output.severity] }}>
            {output.severity}
          </span>
          <span className="services">{output.affected_services?.join(", ")}</span>
        </div>
        <ul className="flags">
          {output.initial_hypothesis_flags?.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
        <ConfidenceBar value={output.confidence} />
      </>
    );
  }

  if (agentKey === "investigator") {
    return (
      <>
        <p className="hypothesis">{output.hypothesis}</p>
        <p className="section-label">Evidence</p>
        <ul className="flags">
          {output.evidence?.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
        {output.ruled_out?.length > 0 && (
          <>
            <p className="section-label dim">Ruled out</p>
            <ul className="flags dim">
              {output.ruled_out.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </>
        )}
        <ConfidenceBar value={output.confidence} />
      </>
    );
  }

  if (agentKey === "commander") {
    return (
      <>
        <div className="action-badge">{output.action?.toUpperCase()}</div>
        <p className="hypothesis">{output.rationale}</p>
        <p className="section-label">Expected impact</p>
        <p className="dim-text">{output.expected_impact}</p>
        {output.rollback_plan && (
          <>
            <p className="section-label">Rollback plan</p>
            <p className="dim-text">{output.rollback_plan}</p>
          </>
        )}
        <ConfidenceBar value={output.confidence} />
        {executionResult && (
          <div className="exec-note">
            <span className="exec-label">{executionResult.executed ? "EXECUTED" : "NOT EXECUTED"}</span>
            <p className="dim-text">{executionResult.executed ? executionResult.detail : executionResult.reason}</p>
          </div>
        )}
        {recoveryTicks && recoveryTicks.length > 0 && <RecoveryChart ticks={recoveryTicks} initialErrorRate={initialErrorRate} />}
      </>
    );
  }
  if (agentKey === "communicator") {
    return (
      <>
        {output.messages?.map((m, i) => (
          <div className="msg" key={i}>
            <span className="msg-audience">{m.audience.replace("_", " ")}</span>
            <span className="msg-channel">{m.channel}</span>
            <p className="msg-text">{m.message}</p>
          </div>
        ))}
        <p className="dim-text">Next update in {output.next_update_in_min} min</p>
      </>
    );
  }

  return null;
}

export default function AgentPanel({ agentKey, output, active, latencyMs, executionResult, recoveryTicks, initialErrorRate }) {
  const meta = AGENT_META[agentKey];
  return (
    <div className={`panel ${active ? "panel--active" : ""}`}>
      <div className="panel-head">
        <div>
          <h3>{meta.title}</h3>
          <p className="subtitle">{meta.subtitle}</p>
        </div>
        {latencyMs !== undefined && <span className="latency">{latencyMs}ms</span>}
      </div>
      <div className="panel-body">
        <AgentBody agentKey={agentKey} output={output} executionResult={executionResult} recoveryTicks={recoveryTicks} initialErrorRate={initialErrorRate} />
      </div>

      <style jsx>{`
        .panel {
          background: var(--panel);
          border: 1px solid var(--panel-border);
          border-radius: 12px;
          padding: 18px 20px;
          min-height: 220px;
          display: flex;
          flex-direction: column;
          transition: border-color 0.4s ease, box-shadow 0.4s ease;
        }
        .panel--active {
          border-color: var(--amber-dim);
          box-shadow: 0 0 0 1px rgba(184, 114, 26, 0.15);
        }
        .panel-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }
        h3 {
          font-family: var(--font-display);
          font-size: 16px;
          margin: 0;
          font-weight: 600;
        }
        .subtitle {
          font-size: 12px;
          color: var(--text-faint);
          margin: 2px 0 0;
        }
        .latency {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-faint);
        }
        .empty {
          color: var(--text-faint);
          font-size: 13px;
          font-style: italic;
        }
        .panel-body {
          font-size: 13px;
          color: var(--text-primary);
          flex: 1;
        }
        .sev-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        .sev-badge {
          font-family: var(--font-mono);
          font-size: 12px;
          border: 1px solid;
          border-radius: 6px;
          padding: 2px 8px;
          font-weight: 500;
        }
        .services {
          color: var(--text-dim);
          font-size: 13px;
        }
        .flags {
          margin: 0;
          padding-left: 16px;
          color: var(--text-dim);
        }
        .flags.dim li {
          color: var(--text-faint);
        }
        .flags li {
          margin-bottom: 4px;
          line-height: 1.4;
        }
        .hypothesis {
          margin: 0 0 10px;
          line-height: 1.5;
        }
        .section-label {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-faint);
          margin: 10px 0 4px;
        }
        .section-label.dim {
          opacity: 0.7;
        }
        .dim-text {
          color: var(--text-dim);
          line-height: 1.5;
          margin: 0;
        }
        .action-badge {
          display: inline-block;
          font-family: var(--font-mono);
          font-weight: 600;
          letter-spacing: 0.06em;
          color: var(--ink);
          background: var(--amber);
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 12px;
          margin-bottom: 10px;
        }
        .msg {
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--panel-border);
        }
        .msg:last-of-type {
          border-bottom: none;
        }
        .msg-audience {
          font-family: var(--font-mono);
          font-size: 10px;
          text-transform: uppercase;
          color: var(--amber);
          letter-spacing: 0.06em;
        }
        .msg-channel {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-faint);
          margin-left: 8px;
        }
        .msg-text {
          margin: 4px 0 0;
          color: var(--text-dim);
          line-height: 1.5;
        }
        .exec-note {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--panel-border);
        }
        .exec-label {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--text-faint);
          display: block;
          margin-bottom: 4px;
        }
      `}</style>
    </div>
  );
}
