"use client";
import { AlertTriangle, Search, Zap, MessageSquare, Webhook, FileSearch, Wrench, MonitorCheck, ArrowRight } from "lucide-react";
import CinematicHero from "../components/CinematicHero";
import HeroCarousel from "../components/HeroCarousel";

const PIPELINE = [
  { icon: AlertTriangle, name: "Triage", color: "var(--sev3)", desc: "Classifies severity and flags leads for investigation — in under a second, from a raw webhook alert." },
  { icon: Search, name: "Investigator", color: "var(--blue)", desc: "Reasons across database, network, and security causes, explicitly ruling out what doesn't fit the evidence." },
  { icon: Zap, name: "Commander", color: "var(--amber)", desc: "Picks one remediation action and explains why in plain language — never a bare decision with no rationale." },
  { icon: MessageSquare, name: "Communicator", color: "var(--teal)", desc: "Drafts customer, engineering, and leadership updates automatically — no one is left in silence mid-incident." },
];

const CAPABILITIES = [
  { icon: Webhook, tag: "INGESTION", word: "DETECT", color: "#b8721a", title: "Automatic detection", desc: "Point Datadog, PagerDuty, or Prometheus Alertmanager at one webhook. Every agent runs with zero human involvement, the moment something breaks." },
  { icon: FileSearch, tag: "REASONING", word: "EXPLAIN", color: "#2a5fcb", title: "Explainable, not a black box", desc: "Every classification, hypothesis, and decision is typed, validated, and logged — inspect the reasoning trace behind any outcome, anytime." },
  { icon: Wrench, tag: "EXECUTION", word: "FIX", color: "#c96a1e", title: "Real remediation", desc: "The recommended fix is actually applied and its recovery is actually measured — not a canned animation. Point it at real infrastructure with one class swap." },
  { icon: MonitorCheck, tag: "VISIBILITY", word: "WATCH", color: "#0e8c7f", title: "Always-on dashboard", desc: "One connection your ops team leaves open. Incidents from any source appear automatically — no incident ID needed in advance." },
];

const TAGS = [
  "Automatic webhook ingestion", "Explainable reasoning traces", "Real sandboxed execution",
  "Always-on live feed", "Typed agent contracts", "Recovery visualization",
];

const WHY = [
  { title: "Nationally-validated core", desc: "The Commander's decision-making carries forward a policy that ranked in the top 3% of 70,000+ teams at a national-level AI hackathon — not an unproven prompt wrapper." },
  { title: "True multi-agent coordination", desc: "Four specialized agents execute real handoffs, each validated against a shared typed contract before the next one ever sees it." },
  { title: "Complete reasoning transparency", desc: "Every decision streams live with its full rationale — inspect it as it happens, not after the fact in a postmortem doc." },
  { title: "A copilot, not an autopilot", desc: "Enterprises resist full autonomous remediation. Crisis Room recommends and can execute against a target you control — production access is a deliberate, gated step, not a default." },
];

const STACK = ["FastAPI", "WebSockets", "Claude", "Pydantic", "Next.js", "Docker"];

export default function Landing() {
  return (
    <>
      <main className="landing">
        <CinematicHero />

        {/* PRODUCT TOUR */}
        <section className="tour">
          <div className="section-head">
            <span className="eyebrow">SEE IT WORK</span>
            <h2>Every agent, one at a time.</h2>
          </div>
          <HeroCarousel />
        </section>

        {/* PIPELINE */}
        <section className="pipeline" id="pipeline">
          <div className="section-head">
            <span className="eyebrow">HOW IT WORKS</span>
            <h2>From signal to fix, four agents at a time.</h2>
            <p className="section-sub">
              An on-call engineer today has to triage, investigate, decide, and communicate all at once. Crisis Room
              splits that into four specialists that hand off cleanly, in parallel with each other's follow-up work.
            </p>
          </div>
          <div className="pipeline-row">
            {PIPELINE.map((step, i) => {
              const Icon = step.icon;
              return (
                <div className="pipeline-step" key={step.name}>
                  <div className="step-top">
                    <span className="step-icon" style={{ color: step.color, borderColor: step.color }}>
                      <Icon size={17} strokeWidth={2} />
                    </span>
                    {i < PIPELINE.length - 1 && <span className="step-connector" />}
                  </div>
                  <h3>{step.name}</h3>
                  <p>{step.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* WHY */}
        <section className="why">
          <div className="section-head">
            <span className="eyebrow">WHY CRISIS ROOM</span>
            <h2>Built to be trusted, not just impressive in a demo.</h2>
          </div>
          <div className="why-grid">
            {WHY.map((w) => (
              <div className="why-card" key={w.title}>
                <h3>{w.title}</h3>
                <p>{w.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CAPABILITIES */}
        <section className="capabilities" id="capabilities">
          <div className="section-head section-head--dark">
            <span className="eyebrow">PLATFORM CAPABILITIES</span>
            <h2>Built to run in production, not just a demo.</h2>
          </div>

          <div className="tag-cloud">
            {TAGS.map((t) => (
              <span className="tag-pill" key={t}>
                {t}
              </span>
            ))}
          </div>

          <div className="cap-grid">
            {CAPABILITIES.map((c) => {
              const Icon = c.icon;
              return (
                <div className="cap-block" key={c.tag} style={{ background: c.color }}>
                  <div className="cap-block-top">
                    <span className="cap-block-tag">{c.tag}</span>
                    <Icon size={18} strokeWidth={2} className="cap-block-arrow" />
                  </div>
                  <span className="cap-word">{c.word}</span>
                  <h3>{c.title}</h3>
                  <p>{c.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* TECH STACK */}
        <section className="stack">
          <span className="stack-label">BUILT WITH</span>
          <div className="stack-row">
            {STACK.map((s) => (
              <span className="stack-chip" key={s}>
                {s}
              </span>
            ))}
          </div>
        </section>

        {/* CTA BANNER */}
        <section className="cta-banner">
          <h2>Watch it triage, diagnose, decide, and fix — live.</h2>
          <p>No setup required. Trigger a scenario or send a webhook, and follow every agent's reasoning in real time.</p>
          <a href="/console" className="btn btn--primary btn--lg">
            Enter console <ArrowRight size={16} />
          </a>
        </section>

        <footer className="footer">
          <span>Crisis Room · Team Gol_Gappe</span>
          <span>Build with Bharat 2.0 · National Level Hackathon</span>
        </footer>
      </main>

      <style jsx>{`
        .landing {
          max-width: 1180px;
          margin: 0 auto;
          padding: 0 32px;
        }
        .eyebrow {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          color: var(--amber);
          display: block;
          margin-bottom: 14px;
        }

        /* CTA BUTTONS (used by the CTA banner section below) */
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono);
          font-size: 13px;
          letter-spacing: 0.02em;
          padding: 12px 22px;
          border-radius: 8px;
          text-decoration: none;
          transition: opacity 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
        }
        .btn--primary {
          background: var(--amber);
          color: var(--ink);
        }
        .btn--primary:hover {
          opacity: 0.88;
          transform: translateY(-1px);
        }
        .btn--ghost {
          border: 1px solid var(--panel-border-active);
          color: var(--text-primary);
          background: var(--bg-raised);
        }
        .btn--ghost:hover {
          border-color: var(--amber);
        }
        .btn--lg {
          padding: 14px 28px;
          font-size: 14px;
        }

        /* PRODUCT TOUR */
        .tour {
          padding: 8px 0 32px;
        }

        /* SECTION HEAD (shared) */
        .section-head {
          max-width: 640px;
          margin-bottom: 40px;
        }
        .section-head h2 {
          font-family: var(--font-display);
          font-size: 28px;
          margin: 0 0 10px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .section-sub {
          font-size: 14.5px;
          color: var(--text-dim);
          line-height: 1.6;
          margin: 0;
        }

        /* PIPELINE */
        .pipeline {
          padding: 56px 0;
          border-top: 1px solid var(--panel-border);
        }
        .pipeline-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        @media (max-width: 900px) {
          .pipeline-row {
            grid-template-columns: 1fr;
            gap: 28px;
          }
        }
        .pipeline-step {
          position: relative;
        }
        .step-top {
          display: flex;
          align-items: center;
          margin-bottom: 14px;
        }
        .step-icon {
          border: 1.5px solid;
          border-radius: 50%;
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: var(--bg-raised);
        }
        .step-connector {
          height: 1px;
          background: var(--panel-border);
          flex: 1;
          margin-left: 10px;
        }
        @media (max-width: 900px) {
          .step-connector {
            display: none;
          }
        }
        .pipeline-step h3 {
          font-family: var(--font-display);
          font-size: 17px;
          margin: 0 0 8px;
          color: var(--text-primary);
        }
        .pipeline-step p {
          font-size: 13.5px;
          color: var(--text-dim);
          line-height: 1.6;
          margin: 0;
          padding-right: 16px;
        }

        /* WHY */
        .why {
          padding: 56px 0;
          border-top: 1px solid var(--panel-border);
        }
        .why-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        @media (max-width: 700px) {
          .why-grid {
            grid-template-columns: 1fr;
          }
        }
        .why-card {
          background: var(--bg-raised);
          border: 1px solid var(--panel-border);
          border-radius: 12px;
          padding: 22px 24px;
        }
        .why-card h3 {
          font-family: var(--font-display);
          font-size: 16px;
          margin: 0 0 8px;
          color: var(--text-primary);
        }
        .why-card p {
          font-size: 13.5px;
          color: var(--text-dim);
          line-height: 1.6;
          margin: 0;
        }

        /* CAPABILITIES */
        .capabilities {
          background: rgba(12, 15, 19, 0.72);
          border: 1px solid var(--panel-border);
          border-radius: 24px;
          padding: 56px 40px 64px;
          margin: 8px 0 56px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .section-head--dark h2 {
          color: #fff;
        }
        .section-head--dark .eyebrow {
          color: #f2a93b;
        }
        .tag-cloud {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 40px;
        }
        .tag-pill {
          font-family: var(--font-mono);
          font-size: 11.5px;
          color: rgba(255, 255, 255, 0.75);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 999px;
          padding: 7px 16px;
        }
        .cap-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        @media (max-width: 700px) {
          .cap-grid {
            grid-template-columns: 1fr;
          }
        }
        .cap-block {
          border-radius: 16px;
          padding: 26px 26px 28px;
          color: #fff;
        }
        .cap-block-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 28px;
        }
        .cap-block-tag {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: 999px;
          padding: 4px 12px;
        }
        .cap-block-arrow {
          opacity: 0.85;
        }
        .cap-word {
          display: block;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(40px, 6vw, 60px);
          line-height: 1;
          margin-bottom: 20px;
          letter-spacing: -0.01em;
        }
        .cap-block h3 {
          font-family: var(--font-display);
          font-size: 16px;
          margin: 0 0 8px;
        }
        .cap-block p {
          font-size: 13px;
          line-height: 1.6;
          margin: 0;
          color: rgba(255, 255, 255, 0.82);
        }

        /* STACK */
        .stack {
          padding: 40px 0;
          border-top: 1px solid var(--panel-border);
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }
        .stack-label {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.1em;
          color: var(--text-faint);
        }
        .stack-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .stack-chip {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-dim);
          background: var(--bg-raised);
          border: 1px solid var(--panel-border);
          border-radius: 999px;
          padding: 5px 14px;
        }

        /* CTA BANNER */
        .cta-banner {
          text-align: center;
          padding: 76px 20px;
          border-top: 1px solid var(--panel-border);
        }
        .cta-banner h2 {
          font-family: var(--font-display);
          font-size: 28px;
          margin: 0 0 12px;
          color: var(--text-primary);
        }
        .cta-banner p {
          color: var(--text-dim);
          margin: 0 0 28px;
        }
        .cta-banner .btn {
          justify-content: center;
        }

        .footer {
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
          padding: 28px 0 40px;
          border-top: 1px solid var(--panel-border);
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-faint);
        }
      `}</style>
    </>
  );
}
