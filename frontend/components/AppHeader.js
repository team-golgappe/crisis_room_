"use client";
import { useRouter } from "next/navigation";
import { authApi } from "../lib/appApi";
import Logo from "./Logo";

export default function AppHeader({ user }) {
  const router = useRouter();

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      /* clearing the cookie is best-effort */
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="app-header">
      <div className="inner">
        <a href="/app" className="brand" aria-label="Crisis Room dashboard">
          <span className="brand-mark">
            <Logo size={22} />
          </span>
          CRISIS ROOM
        </a>
        <div className="right">
          {user?.email && <span className="email">{user.email}</span>}
          <a href="/app/settings" className="settings-link">
            Settings
          </a>
          <button onClick={logout}>Sign out</button>
        </div>
      </div>

      <style jsx>{`
        .app-header {
          position: sticky;
          top: 0;
          z-index: 50;
          padding: 14px 20px 0;
        }
        .inner {
          max-width: 1180px;
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
          font-size: 14px;
          letter-spacing: 0.02em;
          color: #fff;
          padding-left: 4px;
        }
        .brand-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .email {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-faint);
          max-width: 40vw;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .settings-link {
          font-family: var(--font-body);
          font-size: 12.5px;
          color: var(--text-faint);
          text-decoration: none;
          padding: 8px 4px;
        }
        .settings-link:hover {
          color: #fff;
        }
        button {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: #fff;
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 12.5px;
          padding: 8px 14px;
          border-radius: 999px;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        button:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        @media (max-width: 520px) {
          .email {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}
