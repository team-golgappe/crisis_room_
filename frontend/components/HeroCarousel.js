"use client";
import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Webhook, Radio, Search, FileSearch, ShieldCheck, Zap, Wrench, RotateCcw, MessageSquare, Monitor, Hash, ChevronLeft, ChevronRight } from "lucide-react";

const SLIDES = [
  {
    word: "TRIAGE",
    bg: "linear-gradient(135deg, #f3ba6a 0%, #dd8a3c 100%)",
    center: { icon: AlertTriangle, badge: "ACTIVE", title: "Severity triage", subtitle: "SEV1 – SEV4", desc: "Every alert classified by revenue and user impact in under a second.", graphic: "spike" },
    side: [
      { icon: Webhook, badge: "CONNECTED", title: "Ingestion", desc: "Datadog, PagerDuty, Prometheus — one webhook." },
      { icon: Radio, badge: "STREAMING", title: "Live feed", desc: "Incidents appear automatically, no polling." },
    ],
  },
  {
    word: "TRACE",
    bg: "linear-gradient(135deg, #74a0f2 0%, #3f66c9 100%)",
    center: { icon: Search, badge: "ANALYZING", title: "Root-cause analysis", subtitle: "DB · network · security", desc: "Reasons across three domains, and rules out what doesn't fit the evidence.", graphic: "rings" },
    side: [
      { icon: FileSearch, badge: "LOGGED", title: "Evidence", desc: "Every clue behind a hypothesis, kept." },
      { icon: ShieldCheck, badge: "RULED OUT", title: "Eliminations", desc: "What it isn't, stated plainly." },
    ],
  },
  {
    word: "DECIDE",
    bg: "linear-gradient(135deg, #e79a4d 0%, #b85a1e 100%)",
    center: { icon: Zap, badge: "EXECUTING", title: "Decide & execute", subtitle: "Rollback · scale · failover", desc: "Picks one action, explains why, and applies it to a real target service.", graphic: "curve" },
    side: [
      { icon: Wrench, badge: "APPLIED", title: "Real fix", desc: "State genuinely changes, tracked live." },
      { icon: RotateCcw, badge: "READY", title: "Rollback plan", desc: "A way back if the fix doesn't hold." },
    ],
  },
  {
    word: "NOTIFY",
    bg: "linear-gradient(135deg, #3fcdb4 0%, #17967f 100%)",
    center: { icon: MessageSquare, badge: "SENT", title: "Stakeholder sync", subtitle: "Customers · eng · leadership", desc: "Three audiences, three registers, drafted automatically — no one left in silence.", graphic: "pulse" },
    side: [
      { icon: Monitor, badge: "LIVE", title: "Status page", desc: "Plain-language updates, no jargon." },
      { icon: Hash, badge: "POSTED", title: "Team channel", desc: "Technical detail for the engineers on call." },
    ],
  },
];

function Graphic({ type }) {
  if (type === "spike") {
    return (
      <svg viewBox="0 0 200 70" className="graphic">
        <path d="M0,58 C35,58 55,10 85,10 C112,10 118,50 200,54" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="85" cy="10" r="4" fill="#fff" />
      </svg>
    );
  }
  if (type === "curve") {
    return (
      <svg viewBox="0 0 200 70" className="graphic">
        <path d="M0,8 C40,8 55,60 100,62 C140,64 160,40 200,15" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="0" cy="8" r="4" fill="#fff" />
        <circle cx="200" cy="15" r="4" fill="#fff" opacity="0.6" />
      </svg>
    );
  }
  if (type === "rings") {
    return (
      <svg viewBox="0 0 100 70" className="graphic graphic--rings">
        <circle cx="50" cy="35" r="30" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="5" strokeDasharray="110 190" strokeLinecap="round" transform="rotate(-90 50 35)" />
        <circle cx="50" cy="35" r="21" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="5" strokeDasharray="80 140" strokeLinecap="round" transform="rotate(40 50 35)" />
        <circle cx="50" cy="35" r="12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="5" strokeDasharray="50 90" strokeLinecap="round" transform="rotate(160 50 35)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 70" className="graphic graphic--rings">
      <circle cx="50" cy="35" r="10" fill="rgba(255,255,255,0.9)" />
      <circle cx="50" cy="35" r="20" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
      <circle cx="50" cy="35" r="30" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
    </svg>
  );
}

function MiniCard({ item }) {
  const Icon = item.icon;
  return (
    <div className="mini-card">
      <div className="mini-top">
        <span className="mini-icon">
          <Icon size={15} strokeWidth={2} />
        </span>
        <span className="mini-badge">
          <span className="mini-dot" /> {item.badge}
        </span>
      </div>
      <h4>{item.title}</h4>
      <p>{item.desc}</p>
      <style jsx>{`
        .mini-card {
          background: rgba(10, 10, 14, 0.82);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 18px 18px 20px;
          width: 220px;
          color: #fff;
          opacity: 0.82;
          transform: scale(0.95);
          transition: transform 0.4s ease, opacity 0.4s ease;
        }
        .mini-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 22px;
        }
        .mini-icon {
          width: 26px;
          height: 26px;
          border-radius: 7px;
          background: rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mini-badge {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.06em;
          color: rgba(255, 255, 255, 0.6);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .mini-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: currentColor;
        }
        h4 {
          font-family: var(--font-display);
          font-size: 17px;
          margin: 0 0 6px;
        }
        p {
          font-size: 12px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.65);
          margin: 0;
        }
      `}</style>
    </div>
  );
}

export default function HeroCarousel() {
  const [index, setIndex] = useState(0);

  const advance = useCallback((dir) => {
    setIndex((i) => (i + dir + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    const id = setInterval(() => advance(1), 4200);
    return () => clearInterval(id);
  }, [advance]);

  const slide = SLIDES[index];
  const CenterIcon = slide.center.icon;

  return (
    <div className="carousel" style={{ background: slide.bg }}>
      <span key={slide.word} className="giant-word">
        {slide.word}
      </span>

      <div className="cards-row">
        <MiniCard item={slide.side[0]} />

        <div className="center-card" key={`center-${index}`}>
          <div className="center-top">
            <span className="center-icon">
              <CenterIcon size={18} strokeWidth={2} />
            </span>
            <span className="center-badge">
              <span className="mini-dot" /> {slide.center.badge}
            </span>
          </div>
          <Graphic type={slide.center.graphic} />
          <h3>{slide.center.title}</h3>
          <span className="center-subtitle">{slide.center.subtitle}</span>
          <p>{slide.center.desc}</p>
        </div>

        <MiniCard item={slide.side[1]} />
      </div>

      <div className="carousel-controls">
        <button aria-label="Previous" onClick={() => advance(-1)} className="arrow-btn">
          <ChevronLeft size={18} />
        </button>
        <button aria-label="Next" onClick={() => advance(1)} className="arrow-btn">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="progress-row">
        {SLIDES.map((s, i) => (
          <span key={s.word} className={`progress-dash ${i === index ? "progress-dash--active" : ""}`} />
        ))}
      </div>

      <a href="/console" className="enter-console">
        ENTER CONSOLE →
      </a>

      <style jsx>{`
        .carousel {
          position: relative;
          overflow: hidden;
          border-radius: 24px;
          padding: 56px 40px 90px;
          margin: 8px 0 64px;
          transition: background 0.7s ease;
          min-height: 420px;
        }
        .giant-word {
          position: absolute;
          top: 18px;
          left: 50%;
          transform: translateX(-50%);
          font-family: var(--font-pixel);
          font-weight: 400;
          font-size: clamp(52px, 10vw, 132px);
          color: rgba(255, 255, 255, 0.32);
          letter-spacing: -0.06em;
          white-space: nowrap;
          user-select: none;
          z-index: 0;
          line-height: 1;
          animation: wordIn 0.6s ease;
        }
        @keyframes wordIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        .cards-row {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 18px;
          margin-top: 96px;
          flex-wrap: wrap;
        }
        .center-card {
          background: rgba(8, 8, 12, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 18px;
          padding: 22px 24px 26px;
          width: 280px;
          color: #fff;
          transform: translateY(-16px);
          box-shadow: 0 30px 70px -24px rgba(0, 0, 0, 0.55);
          z-index: 2;
          animation: cardIn 0.45s ease;
        }
        @keyframes cardIn {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(-16px) scale(1);
          }
        }
        .center-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .center-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .center-badge {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: rgba(255, 255, 255, 0.75);
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .mini-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: currentColor;
        }
        .graphic {
          width: 100%;
          height: 56px;
          margin: 4px 0 14px;
        }
        h3 {
          font-family: var(--font-display);
          font-size: 21px;
          margin: 0 0 4px;
        }
        .center-subtitle {
          display: block;
          font-family: var(--font-mono);
          font-size: 11px;
          color: rgba(255, 255, 255, 0.55);
          margin-bottom: 10px;
        }
        .center-card p {
          font-size: 13px;
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.78);
          margin: 0;
        }

        .carousel-controls {
          position: absolute;
          left: 40px;
          bottom: 30px;
          display: flex;
          gap: 10px;
          z-index: 2;
        }
        .arrow-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.5);
          background: transparent;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .arrow-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .progress-row {
          position: absolute;
          bottom: 34px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 6px;
          z-index: 2;
        }
        .progress-dash {
          width: 16px;
          height: 3px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.35);
          transition: all 0.3s ease;
        }
        .progress-dash--active {
          width: 26px;
          background: #fff;
        }

        .enter-console {
          position: absolute;
          right: 40px;
          bottom: 24px;
          z-index: 2;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(20px, 3vw, 30px);
          color: #fff;
          text-decoration: none;
          letter-spacing: -0.01em;
        }
        .enter-console:hover {
          opacity: 0.85;
        }

        @media (max-width: 860px) {
          .cards-row {
            margin-top: 120px;
          }
        }
        @media (max-width: 640px) {
          .carousel {
            padding: 40px 20px 130px;
          }
          .center-card,
          .mini-card {
            width: 100%;
            max-width: 300px;
          }
          .carousel-controls {
            left: 20px;
            bottom: 20px;
          }
          .enter-console {
            right: 20px;
            bottom: 76px;
          }
        }
      `}</style>
    </div>
  );
}
