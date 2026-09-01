"use client";
import { Activity } from "lucide-react";

export default function Nav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="/" className="brand">
          <span className="brand-mark">
            <Activity size={15} strokeWidth={2.5} />
          </span>
          CRISIS ROOM
        </a>
        <div className="links">
          <a href="/#pipeline">Pipeline</a>
          <a href="/#capabilities">Capabilities</a>
          <a href="https://github.com" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="/console" className="cta">
            Enter console
          </a>
        </div>
      </div>

      <style jsx>{`
        .nav {
          position: sticky;
          top: 0;
          z-index: 50;
          padding: 14px 20px 0;
        }
        .nav-inner {
          max-width: 1280px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 10px 12px 10px 14px;
          background: rgba(16, 17, 20, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          backdrop-filter: blur(16px) saturate(140%);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--font-pixel);
          font-weight: 400;
          font-size: 14px;
          letter-spacing: 0.02em;
          color: #fff;
          text-decoration: none;
          padding-left: 4px;
        }
        .brand-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: var(--amber);
        }
        .links {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .links a {
          font-size: 13px;
          color: #fff;
          opacity: 0.62;
          text-decoration: none;
          font-family: var(--font-body);
          font-weight: 500;
          letter-spacing: -0.01em;
          padding: 8px 12px;
          border-radius: 999px;
          transition: opacity 0.15s ease, background 0.15s ease;
        }
        .links a:not(.cta):hover {
          opacity: 0.95;
          background: rgba(255, 255, 255, 0.06);
        }
        .cta {
          opacity: 1 !important;
          color: #14181d !important;
          background: rgba(255, 255, 255, 0.94);
          font-weight: 600;
          padding: 9px 18px;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 26px rgba(0, 0, 0, 0.4);
        }
        @media (max-width: 640px) {
          .links a:not(.cta) {
            display: none;
          }
        }
      `}</style>
    </nav>
  );
}
