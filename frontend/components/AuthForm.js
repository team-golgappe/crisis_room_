"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authApi, ApiError } from "../lib/appApi";
import Logo from "./Logo";

export default function AuthForm({ mode }) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isSignup) {
        await authApi.signup(email.trim(), password);
      } else {
        await authApi.login(email.trim(), password);
      }
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <div className="card">
        <a href="/" className="brand" aria-label="Crisis Room home">
          <span className="brand-mark">
            <Logo size={24} />
          </span>
          CRISIS ROOM
        </a>

        <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="sub">
          {isSignup
            ? "Monitor your own sites and let the agents handle incidents."
            : "Sign in to your monitoring dashboard."}
        </p>

        <form onSubmit={onSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? "at least 8 characters" : "••••••••"}
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={busy}>
            {busy ? "…" : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="switch">
          {isSignup ? (
            <>
              Already have an account? <a href="/login">Sign in</a>
            </>
          ) : (
            <>
              New here? <a href="/signup">Create an account</a>
            </>
          )}
        </p>
        <p className="switch">
          <a href="/console" className="muted-link">
            Or open the live demo console →
          </a>
        </p>
      </div>

      <style jsx>{`
        .wrap {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
        }
        .card {
          width: 100%;
          max-width: 380px;
          background: rgba(16, 17, 20, 0.72);
          border: 1px solid var(--panel-border);
          border-radius: 18px;
          backdrop-filter: blur(16px) saturate(140%);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
          padding: 30px 28px 26px;
        }
        .brand {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          font-family: var(--font-pixel);
          font-size: 13px;
          letter-spacing: 0.04em;
          color: #fff;
          margin-bottom: 22px;
        }
        .brand-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        h1 {
          font-family: var(--font-display);
          font-size: 21px;
          margin: 0 0 6px;
        }
        .sub {
          color: var(--text-dim);
          font-size: 13.5px;
          line-height: 1.5;
          margin: 0 0 22px;
        }
        form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        label span {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-faint);
        }
        input {
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid var(--panel-border);
          border-radius: 10px;
          padding: 11px 13px;
          color: var(--text-primary);
          font-family: var(--font-body);
          font-size: 14px;
          transition: border-color 0.15s ease;
        }
        input:focus {
          outline: none;
          border-color: var(--panel-border-active);
        }
        .error {
          color: var(--sev1);
          font-size: 13px;
          margin: 0;
          line-height: 1.45;
        }
        button {
          margin-top: 4px;
          background: rgba(255, 255, 255, 0.94);
          color: #14181d;
          border: none;
          border-radius: 999px;
          padding: 12px 18px;
          font-family: var(--font-body);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: transform 0.15s ease, opacity 0.15s ease;
        }
        button:hover:not(:disabled) {
          transform: translateY(-1px);
        }
        button:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .switch {
          margin: 16px 0 0;
          font-size: 13px;
          color: var(--text-dim);
        }
        .switch a {
          color: var(--blue);
        }
        .switch a:hover {
          text-decoration: underline;
        }
        .muted-link {
          color: var(--text-faint) !important;
          font-size: 12.5px;
        }
      `}</style>
    </main>
  );
}
