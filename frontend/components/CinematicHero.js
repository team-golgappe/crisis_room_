"use client";
import { useEffect, useRef, useState } from "react";
import { Activity, BellRing, Webhook, Menu, X } from "lucide-react";
import Logo from "./Logo";

const NAV_LINKS = [
  { label: "Home", href: "/", active: true },
  { label: "Pipeline", href: "/#pipeline" },
  { label: "Capabilities", href: "/#capabilities" },
  { label: "GitHub", href: "https://github.com", external: true },
];

const STATS = [
  { glyph: "#", value: 4, decimals: 0, suffix: "", label: "Coordinated AI agents" },
  { glyph: "<", value: 15, decimals: 0, suffix: "s", label: "Typical time to resolution" },
  { glyph: "*", value: 3, decimals: 0, suffix: "", label: "Monitoring tools supported" },
  { glyph: "%", value: 100, decimals: 0, suffix: "%", label: "Decisions logged & explainable" },
];

function useCountUp(target, decimals, active, delay) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf;
    const duration = 1400;
    const start = performance.now() + delay;

    const tick = (now) => {
      const elapsed = now - start;
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, delay]);

  return value.toFixed(decimals);
}

function StatItem({ stat, active, delay }) {
  const display = useCountUp(stat.value, stat.decimals, active, delay);
  return (
    <div className="stat-item" style={{ "--d": `${0.5 + delay / 1000}s` }}>
      <span className="stat-glyph">{stat.glyph}</span>
      <span className="stat-value">
        {display}
        {stat.suffix}
      </span>
      <span className="stat-label">{stat.label}</span>

      <style jsx>{`
        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          text-align: center;
          animation: statReveal 0.85s cubic-bezier(0.22, 1, 0.36, 1) both;
          animation-delay: var(--d);
        }
        @keyframes statReveal {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .stat-glyph {
          font-family: var(--font-pixel);
          font-size: clamp(20px, 2.6vw, 30px);
          line-height: 1;
          color: var(--amber);
        }
        .stat-value {
          font-family: var(--font-body);
          font-weight: 600;
          color: #fff;
          font-size: clamp(17px, 2vw, 23px);
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }
        .stat-label {
          font-size: clamp(10.5px, 1.1vw, 12px);
          color: var(--text-faint);
          line-height: 1.35;
          max-width: 15ch;
        }
        @media (prefers-reduced-motion: reduce) {
          .stat-item {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

export default function CinematicHero() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [statsActive, setStatsActive] = useState(false);
  const statsRef = useRef(null);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsActive(true);
          obs.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="cinematic">
      <div className="bg-fx" aria-hidden="true" />
      <div className="hero-scrim" aria-hidden="true" />

      {/* HEADER */}
      <header className="c-header anim" style={{ "--d": "0s" }}>
        <a href="/" className="c-logo" aria-label="Crisis Room">
          <Logo size={30} />
        </a>

        <nav className="c-nav">
          {NAV_LINKS.map((l) =>
            l.external ? (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="c-nav-link">
                {l.label}
              </a>
            ) : (
              <a key={l.label} href={l.href} className={`c-nav-link ${l.active ? "c-nav-link--active" : ""}`}>
                {l.label}
              </a>
            )
          )}
        </nav>

        <a href="/login" className="c-login">
          Sign in
        </a>

        <a href="/console" className="c-signin">
          Enter console
        </a>

        <button className="c-burger" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}>
          <Menu size={18} />
        </button>
      </header>

      {/* MOBILE MENU */}
      {menuOpen && (
        <div className="c-overlay" onClick={() => setMenuOpen(false)}>
          <div className="c-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="c-sheet-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
            {NAV_LINKS.map((l) => (
              <a key={l.label} href={l.href} className="c-sheet-link" onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ))}
            <a href="/login" className="c-sheet-link" onClick={() => setMenuOpen(false)}>
              Sign in
            </a>
            <a href="/console" className="c-sheet-cta" onClick={() => setMenuOpen(false)}>
              Enter console
            </a>
          </div>
        </div>
      )}

      {/* HERO */}
      <div className="c-hero">
        <div className="trust-row anim" style={{ "--d": "0.05s" }}>
          <span className="trust-avatar" style={{ zIndex: 1 }}>
            <Activity size={14} />
          </span>
          <span className="trust-avatar" style={{ zIndex: 2, marginLeft: "calc(-1 * var(--trust-size) * 0.42)" }}>
            <BellRing size={14} />
          </span>
          <span className="trust-avatar" style={{ zIndex: 3, marginLeft: "calc(-1 * var(--trust-size) * 0.42)" }}>
            <Webhook size={14} />
          </span>
          <span className="trust-pill">Datadog · PagerDuty · Prometheus</span>
        </div>

        <h1 className="c-headline">
          <span className="line" style={{ "--fd": "0.12s" }}>
            Your 2:47 AM incident,
          </span>
          <span className="line" style={{ "--fd": "0.3s" }}>
            handled before you wake up.
          </span>
        </h1>

        <p className="c-subhead anim" style={{ "--d": "0.28s" }}>
          Four coordinated AI agents triage, investigate, decide, and fix production incidents automatically — every
          decision explainable, live.
        </p>

        <a href="/console" className="c-cta anim" style={{ "--d": "0.4s" }}>
          Enter console <span className="c-cta-arrow">→</span>
        </a>
      </div>

      {/* STATS FOOTER */}
      <div className="c-stats" ref={statsRef}>
        {STATS.map((s, i) => (
          <StatItem key={s.label} stat={s} active={statsActive} delay={i * 90} />
        ))}
      </div>

      <style jsx>{`
        .cinematic {
          position: relative;
          height: 100vh;
          height: 100dvh;
          min-height: 560px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          background: transparent;
          color: #fff;
          padding: clamp(16px, 2.4vh, 28px) clamp(14px, 3vw, 32px);
          margin-bottom: 64px;
        }
        .bg-fx {
          position: absolute;
          inset: 0;
          z-index: 0;
          background: radial-gradient(circle at 30% 20%, rgba(242, 169, 59, 0.1), transparent 45%),
            radial-gradient(circle at 75% 75%, rgba(14, 140, 127, 0.09), transparent 50%),
            repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.02) 0px, rgba(255, 255, 255, 0.02) 1px, transparent 1px, transparent 48px),
            repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.02) 0px, rgba(255, 255, 255, 0.02) 1px, transparent 1px, transparent 48px);
          animation: drift 18s ease-in-out infinite alternate;
        }
        .hero-scrim {
          position: absolute;
          inset: 0;
          z-index: 0;
          background: radial-gradient(ellipse at 50% 45%, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.6));
          pointer-events: none;
        }
        @keyframes drift {
          from {
            transform: scale(1) translate(0, 0);
          }
          to {
            transform: scale(1.06) translate(-1.5%, -1%);
          }
        }

        .anim {
          animation: reveal 0.85s cubic-bezier(0.22, 1, 0.36, 1) both;
          animation-delay: var(--d, 0s);
        }
        @keyframes reveal {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .anim,
          .line,
          .bg-fx {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }

        /* HEADER */
        .c-header {
          position: relative;
          z-index: 3;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(10px, 1.6vw, 16px);
          max-width: 760px;
          margin: 0 auto;
          width: 100%;
        }
        .c-logo {
          flex-shrink: 0;
          width: clamp(42px, 4.4vw, 48px);
          height: clamp(42px, 4.4vw, 48px);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--amber);
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.3);
          cursor: pointer;
          transition: transform 0.2s ease, background 0.2s ease;
        }
        .c-logo:hover {
          transform: scale(1.05);
          background: rgba(255, 255, 255, 0.12);
        }
        .c-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(6px, 1vw, 10px);
          background: rgba(20, 20, 22, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(16px) saturate(140%);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          height: clamp(46px, 5.2vw, 50px);
          padding: 4px 8px;
          border-radius: 999px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
        }
        .c-nav-link {
          font-family: var(--font-body);
          font-weight: 500;
          font-size: clamp(12.5px, 1.3vw, 14px);
          letter-spacing: -0.01em;
          color: #fff;
          text-decoration: none;
          opacity: 0.62;
          position: relative;
          padding: 8px 14px;
          border-radius: 999px;
          white-space: nowrap;
          transition: opacity 0.15s ease, background 0.15s ease;
        }
        .c-nav-link:hover {
          opacity: 0.9;
          background: rgba(255, 255, 255, 0.06);
        }
        .c-nav-link--active {
          opacity: 1;
          background: rgba(255, 255, 255, 0.1);
        }
        .c-nav-link--active::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: 3px;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: var(--amber);
          transform: translateX(-50%);
        }
        .c-login {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          height: clamp(46px, 5.2vw, 50px);
          padding: 0 14px;
          font-family: var(--font-body);
          font-weight: 500;
          font-size: clamp(12.5px, 1.3vw, 14px);
          letter-spacing: -0.01em;
          color: #fff;
          opacity: 0.75;
          white-space: nowrap;
          transition: opacity 0.15s ease;
        }
        .c-login:hover {
          opacity: 1;
        }
        .c-signin {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.94);
          color: #14181d;
          font-family: var(--font-body);
          font-weight: 600;
          font-size: clamp(12.5px, 1.3vw, 14px);
          letter-spacing: -0.01em;
          height: clamp(46px, 5.2vw, 50px);
          padding: 0 20px;
          border-radius: 999px;
          text-decoration: none;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          white-space: nowrap;
        }
        .c-signin:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 34px rgba(0, 0, 0, 0.45);
        }
        .c-burger {
          display: none;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(20, 20, 22, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #fff;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        /* MOBILE MENU */
        .c-overlay {
          position: fixed;
          inset: 0;
          z-index: 10;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 90px;
        }
        .c-sheet {
          background: #fff;
          border-radius: 24px;
          padding: 20px;
          width: min(320px, 86vw);
          display: flex;
          flex-direction: column;
          gap: 4px;
          position: relative;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
        }
        .c-sheet-close {
          position: absolute;
          top: 14px;
          right: 14px;
          background: none;
          border: none;
          cursor: pointer;
          color: #2e2e2e;
        }
        .c-sheet-link {
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 15px;
          color: #2e2e2e;
          text-decoration: none;
          padding: 12px 8px;
          border-bottom: 1px solid #eee;
        }
        .c-sheet-cta {
          margin-top: 10px;
          text-align: center;
          background: #28282a;
          color: #fff;
          padding: 12px;
          border-radius: 999px;
          text-decoration: none;
          font-family: var(--font-mono);
          font-size: 13px;
        }

        /* HERO */
        .c-hero {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          max-width: 900px;
          margin: 0 auto;
        }
        .trust-row {
          --trust-size: clamp(32px, 4vw, 38px);
          display: inline-flex;
          align-items: center;
          margin-bottom: clamp(18px, 3vh, 30px);
        }
        .trust-avatar {
          width: var(--trust-size);
          height: var(--trust-size);
          border-radius: 50%;
          background: rgba(20, 20, 22, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.35);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
        }
        .trust-pill {
          background: rgba(20, 20, 22, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.35);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #d8d6d7;
          font-family: var(--font-body);
          font-weight: 500;
          font-size: clamp(11px, 1.3vw, 12.5px);
          height: var(--trust-size);
          display: flex;
          align-items: center;
          border-radius: 999px;
          margin-left: calc(-1 * var(--trust-size) * 0.42);
          padding: 0 16px 0 calc(var(--trust-size) * 0.58);
          white-space: nowrap;
        }
        .c-headline {
          font-family: var(--font-pixel);
          font-weight: 400;
          font-size: clamp(24px, 4.9vw, 58px);
          line-height: 1.18;
          letter-spacing: -0.02em;
          margin: 0 0 clamp(16px, 2.4vh, 22px);
          max-width: 100%;
          overflow: hidden;
        }
        .line {
          display: block;
          white-space: nowrap;
          opacity: 0;
          transform: translateY(14px);
          animation: lineFade 0.85s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          animation-delay: var(--fd);
        }
        @keyframes lineFade {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .c-subhead {
          max-width: min(520px, 92%);
          font-size: clamp(14px, 1.6vw, 16.5px);
          color: #d6d6d6;
          opacity: 0.9;
          line-height: 1.6;
          margin: 0 0 clamp(22px, 3.4vh, 32px);
        }
        .c-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          font-family: var(--font-body);
          font-weight: 600;
          font-size: clamp(13.5px, 1.4vw, 15px);
          letter-spacing: -0.01em;
          padding: clamp(12px, 1.7vh, 15px) clamp(24px, 3vw, 32px);
          border-radius: 999px;
          text-decoration: none;
          border: 1px solid rgba(255, 255, 255, 0.22);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 8px 30px rgba(0, 0, 0, 0.35),
            0 0 40px rgba(255, 255, 255, 0.1);
          transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }
        .c-cta:hover {
          transform: translateY(-2px) scale(1.02);
          background: rgba(255, 255, 255, 0.16);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12), 0 12px 38px rgba(0, 0, 0, 0.45),
            0 0 56px rgba(255, 255, 255, 0.18);
        }
        .c-cta-arrow {
          font-family: var(--font-body);
          transition: transform 0.2s ease;
        }
        .c-cta:hover .c-cta-arrow {
          transform: translateX(3px);
        }

        /* STATS */
        .c-stats {
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          max-width: 780px;
          margin: 0 auto;
          width: 100%;
        }

        @media (max-width: 720px) {
          .c-nav,
          .c-login,
          .c-signin {
            display: none;
          }
          .c-burger {
            display: flex;
          }
          .c-header {
            justify-content: space-between;
            gap: 12px;
          }
          .c-stats {
            grid-template-columns: repeat(2, 1fr);
            row-gap: 22px;
          }
          .c-headline {
            font-size: clamp(17px, 5.4vw, 32px);
            letter-spacing: -0.03em;
            line-height: 1.16;
          }
        }
        @media (max-height: 700px) {
          .trust-row {
            margin-bottom: 12px;
          }
          .c-headline {
            margin-bottom: 10px;
          }
          .c-subhead {
            margin-bottom: 16px;
          }
        }
      `}</style>
    </section>
  );
}
