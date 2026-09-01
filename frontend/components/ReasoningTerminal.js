"use client";
import { useEffect, useRef } from "react";

export default function ReasoningTerminal({ lines }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="terminal">
      <div className="terminal-head">
        <span className="dot dot--red" />
        <span className="dot dot--amber" />
        <span className="dot dot--teal" />
        <span className="terminal-title">reasoning_trace.log</span>
      </div>
      <div className="terminal-body">
        {lines.length === 0 && <p className="placeholder">$ waiting for incident signal…</p>}
        {lines.map((l, i) => (
          <p key={i} className="line">
            <span className="ts">{l.timestamp}</span>
            <span className={`agent agent--${l.agent}`}>[{l.agent}]</span> {l.text}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>

      <style jsx>{`
        .terminal {
          background: #0c0f13;
          border: 1px solid #1c2128;
          border-radius: 12px;
          overflow: hidden;
        }
        .terminal-head {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          border-bottom: 1px solid #1c2128;
          background: #10141a;
        }
        .dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
        }
        .dot--red {
          background: #ff8080;
        }
        .dot--amber {
          background: #f2a93b;
        }
        .dot--teal {
          background: #4fd8c4;
        }
        .terminal-title {
          margin-left: 8px;
          font-family: var(--font-mono);
          font-size: 11px;
          color: #6b7280;
        }
        .terminal-body {
          padding: 14px 16px;
          max-height: 260px;
          overflow-y: auto;
          font-family: var(--font-mono);
          font-size: 12.5px;
          line-height: 1.7;
        }
        .placeholder {
          color: #6b7280;
          margin: 0;
        }
        .line {
          margin: 0 0 6px;
          color: #a9b2bd;
        }
        .ts {
          color: #6b7280;
          margin-right: 8px;
        }
        .agent {
          font-weight: 500;
        }
        .agent--triage {
          color: #e0b64f;
        }
        .agent--investigator {
          color: #7aa2ff;
        }
        .agent--commander {
          color: #f2a93b;
        }
        .agent--communicator {
          color: #4fd8c4;
        }
        .agent--system {
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}
