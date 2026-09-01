"use client";
import { useEffect, useState } from "react";
import Logo from "./Logo";

// Module-scoped: survives React StrictMode's double-mount in dev, but resets
// on a real full page load — so the splash plays at most once per browser tab.
let handled = false;

export default function Splash() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (handled) return;
    handled = true;

    try {
      if (sessionStorage.getItem("cr_splash_seen") === "1") return;
      sessionStorage.setItem("cr_splash_seen", "1");
    } catch {}

    setVisible(true);
    // No cleanup on purpose: these fire once and StrictMode would otherwise
    // clear them on its simulated unmount and leave the splash stuck.
    setTimeout(() => setFading(true), 500);
    setTimeout(() => setVisible(false), 850);
  }, []);

  if (!visible) return null;

  return (
    <div className={`splash ${fading ? "splash--fading" : ""}`} aria-hidden="true">
      <div className="mark">
        <Logo size={44} />
      </div>
      <span className="wordmark">CRISIS ROOM</span>

      <style jsx>{`
        .splash {
          position: fixed;
          inset: 0;
          z-index: 999;
          background: #000000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 20px;
          transition: opacity 0.35s ease;
        }
        .splash::after {
          content: "";
          position: absolute;
          width: 320px;
          height: 320px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(242, 169, 59, 0.16), transparent 70%);
          filter: blur(20px);
        }
        .splash--fading {
          opacity: 0;
          pointer-events: none;
        }
        .mark {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          border-radius: 18px;
          color: var(--amber);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 0 40px rgba(242, 169, 59, 0.26);
          animation: markPulse 1.15s ease-in-out infinite;
        }
        @keyframes markPulse {
          0%,
          100% {
            transform: scale(1);
            box-shadow: 0 0 32px rgba(242, 169, 59, 0.2);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 50px rgba(242, 169, 59, 0.4);
          }
        }
        .wordmark {
          position: relative;
          font-family: var(--font-pixel);
          font-weight: 400;
          font-size: 15px;
          letter-spacing: 0.14em;
          color: #fff;
        }
        @media (prefers-reduced-motion: reduce) {
          .mark {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
