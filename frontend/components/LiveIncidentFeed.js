"use client";

const SEV_COLOR = { SEV1: "var(--sev1)", SEV2: "var(--sev2)", SEV3: "var(--sev3)", SEV4: "var(--sev4)" };
const SOURCE_LABEL = { datadog: "Datadog", pagerduty: "PagerDuty", prometheus: "Prometheus", manual: "Manual trigger", generic: "Webhook" };

export default function LiveIncidentFeed({ incidents, selectedId, onSelect }) {
  const list = Object.values(incidents).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

  return (
    <div className="feed">
      <div className="feed-head">
        <span className="feed-title">Live incident feed</span>
        <span className="feed-hint">auto-populated — no button required</span>
      </div>
      {list.length === 0 && (
        <p className="empty">
          Listening for incidents… point a monitoring tool's webhook at{" "}
          <code>/api/webhooks/&#123;datadog|pagerduty|prometheus|generic&#125;</code>, or run a scenario below.
        </p>
      )}
      <div className="feed-list">
        {list.map((inc) => (
          <button key={inc.incident_id} className={`feed-item ${selectedId === inc.incident_id ? "feed-item--active" : ""}`} onClick={() => onSelect(inc.incident_id)}>
            <div className="feed-item-top">
              <span className="feed-item-title">{inc.title}</span>
              {inc.severity && (
                <span className="feed-sev" style={{ color: SEV_COLOR[inc.severity], borderColor: SEV_COLOR[inc.severity] }}>
                  {inc.severity}
                </span>
              )}
            </div>
            <div className="feed-item-meta">
              <span className="feed-source">{SOURCE_LABEL[inc.source] || inc.source}</span>
              <span className="feed-dot">·</span>
              <span>{inc.service}</span>
              <span className="feed-dot">·</span>
              <span className={inc.resolved ? "feed-status feed-status--resolved" : "feed-status feed-status--active"}>{inc.resolved ? "resolved" : "in progress"}</span>
            </div>
          </button>
        ))}
      </div>

      <style jsx>{`
        .feed {
          background: var(--panel);
          border: 1px solid var(--panel-border);
          border-radius: 12px;
          padding: 16px 18px;
        }
        .feed-head {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          margin-bottom: 10px;
        }
        .feed-title {
          font-family: var(--font-display);
          font-size: 15px;
          font-weight: 600;
        }
        .feed-hint {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-faint);
        }
        .empty {
          font-size: 12.5px;
          color: var(--text-faint);
          line-height: 1.6;
          margin: 0;
        }
        .empty code {
          display: inline;
          font-family: var(--font-mono);
          font-size: 11px;
          background: rgba(255, 255, 255, 0.07);
          padding: 1px 5px;
          border-radius: 4px;
          word-break: break-all;
          overflow-wrap: anywhere;
        }
        .feed-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 220px;
          overflow-y: auto;
        }
        .feed-item {
          text-align: left;
          background: var(--bg);
          border: 1px solid var(--panel-border);
          border-radius: 8px;
          padding: 10px 12px;
          cursor: pointer;
          color: var(--text-primary);
        }
        .feed-item--active {
          border-color: var(--amber);
        }
        .feed-item-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }
        .feed-item-title {
          font-size: 13px;
          font-weight: 500;
        }
        .feed-sev {
          font-family: var(--font-mono);
          font-size: 10px;
          border: 1px solid;
          border-radius: 5px;
          padding: 1px 6px;
          flex-shrink: 0;
        }
        .feed-item-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-faint);
        }
        .feed-dot {
          opacity: 0.5;
        }
        .feed-status--active {
          color: var(--amber);
        }
        .feed-status--resolved {
          color: var(--teal);
        }
      `}</style>
    </div>
  );
}
