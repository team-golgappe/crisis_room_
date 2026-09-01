"use client";

export default function RecoveryChart({ ticks, initialErrorRate }) {
  if (!ticks || ticks.length === 0) return null;

  const isLive = ticks[0]?.is_simulation === false;
  // Real ticks carry t_seconds; the simulated fallback carries a plain tick index.
  const xOf = (t, i) => (t.t_seconds !== undefined ? t.t_seconds : (t.tick ?? i + 1) * 10);

  const points = [{ x: 0, y: initialErrorRate }, ...ticks.map((t, i) => ({ x: xOf(t, i), y: t.error_rate_pct }))];
  const maxY = Math.max(...points.map((p) => p.y), 1);
  const w = 100;
  const h = 40;
  const pad = 4;
  const lastX = points[points.length - 1].x || 1;

  const toSvgX = (x) => pad + (x / lastX) * (w - pad * 2);
  const toSvgY = (y) => h - pad - (y / maxY) * (h - pad * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toSvgX(p.x).toFixed(2)} ${toSvgY(p.y).toFixed(2)}`).join(" ");
  const areaPath = `${path} L ${toSvgX(lastX).toFixed(2)} ${h - pad} L ${toSvgX(0).toFixed(2)} ${h - pad} Z`;

  return (
    <div className="chart-wrap">
      <div className="chart-head">
        <span className="chart-title">{isLive ? "Live recovery" : "Projected recovery"}</span>
        <span className={`sim-badge ${isLive ? "sim-badge--live" : ""}`}>
          {isLive ? "LIVE — sandboxed target service" : "SIMULATED — not a real measurement"}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" preserveAspectRatio="none">
        <path d={areaPath} className={`chart-area ${isLive ? "chart-area--live" : ""}`} />
        <path d={path} className={`chart-line ${isLive ? "chart-line--live" : ""}`} />
        {points.map((p, i) => (
          <circle key={i} cx={toSvgX(p.x)} cy={toSvgY(p.y)} r={1.4} className={`chart-dot ${isLive ? "chart-dot--live" : ""}`} />
        ))}
      </svg>
      <div className="chart-labels">
        <span>t+0s · {initialErrorRate.toFixed(1)}%</span>
        <span>
          t+{lastX.toFixed(0)}s · {points[points.length - 1].y.toFixed(1)}%
        </span>
      </div>

      <style jsx>{`
        .chart-wrap {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--panel-border);
        }
        .chart-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .chart-title {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-faint);
        }
        .sim-badge {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.04em;
          color: var(--amber);
          border: 1px solid var(--amber-dim);
          border-radius: 4px;
          padding: 1px 6px;
        }
        .sim-badge--live {
          color: var(--teal);
          border-color: var(--teal);
        }
        .chart-svg {
          width: 100%;
          height: 56px;
          display: block;
        }
        .chart-area {
          fill: rgba(184, 114, 26, 0.1);
          stroke: none;
        }
        .chart-area--live {
          fill: rgba(14, 140, 127, 0.12);
        }
        .chart-line {
          fill: none;
          stroke: var(--amber);
          stroke-width: 1;
          vector-effect: non-scaling-stroke;
        }
        .chart-line--live {
          stroke: var(--teal);
        }
        .chart-dot {
          fill: var(--amber);
        }
        .chart-dot--live {
          fill: var(--teal);
        }
        .chart-labels {
          display: flex;
          justify-content: space-between;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-faint);
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}

