"use client";

const STAGES = [
  { key: "triage", label: "TRIAGE" },
  { key: "investigator", label: "INVESTIGATOR" },
  { key: "commander", label: "COMMANDER" },
  { key: "communicator", label: "COMMUNICATOR" },
];

export default function PipelineRail({ agentStatus, resolved }) {
  // agentStatus: { triage: 'done'|'active'|'pending', ... }
  return (
    <div className="rail">
      {STAGES.map((stage, i) => {
        const status = agentStatus[stage.key] || "pending";
        return (
          <div className="rail-segment" key={stage.key}>
            <div className={`node node--${status}`}>
              <span className="node-dot" />
              <span className="node-label">{stage.label}</span>
              {status === "active" && <span className="node-ping" />}
            </div>
            {i < STAGES.length - 1 && <div className={`connector ${status === "done" ? "connector--filled" : ""}`} />}
          </div>
        );
      })}
      <div className={`resolved-flag ${resolved ? "resolved-flag--on" : ""}`}>
        <span className="node-dot" />
        RESOLVED
      </div>

      <style jsx>{`
        .rail {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0;
          padding: 28px 8px;
        }
        .rail-segment {
          display: flex;
          align-items: center;
        }
        .node {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid var(--panel-border);
          background: var(--panel);
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.08em;
          color: var(--text-faint);
          transition: all 0.4s ease;
        }
        .node--active {
          border-color: var(--amber);
          color: var(--amber);
          box-shadow: 0 0 0 3px rgba(184, 114, 26, 0.1);
        }
        .node--done {
          border-color: var(--teal);
          color: var(--teal);
        }
        .node-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
        }
        .node-ping {
          position: absolute;
          left: 14px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--amber);
          animation: ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        @keyframes ping {
          0% {
            transform: scale(1);
            opacity: 0.7;
          }
          75%,
          100% {
            transform: scale(2.8);
            opacity: 0;
          }
        }
        .connector {
          width: 32px;
          height: 2px;
          background: var(--panel-border);
          margin: 0 2px;
          transition: background 0.4s ease;
        }
        .connector--filled {
          background: var(--teal);
        }
        .resolved-flag {
          margin-left: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px dashed var(--panel-border);
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.08em;
          color: var(--text-faint);
        }
        .resolved-flag--on {
          border-style: solid;
          border-color: var(--teal);
          color: var(--teal);
          background: rgba(14, 140, 127, 0.08);
        }
      `}</style>
    </div>
  );
}
