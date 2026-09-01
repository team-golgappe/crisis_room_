"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authApi, ApiError } from "../lib/appApi";
import AppHeader from "./AppHeader";

const AppUserContext = createContext(null);

export function useAppUser() {
  const ctx = useContext(AppUserContext);
  if (!ctx) throw new Error("useAppUser must be used inside AppShell");
  return ctx;
}

export default function AppShell({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | unauth | offline

  const refreshUser = useCallback(async () => {
    try {
      const u = await authApi.me();
      setUser(u);
      setState("ready");
      return u;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setState("unauth");
        router.replace("/login");
      } else {
        setState("offline");
      }
      return null;
    }
  }, [router]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  if (state === "loading" || state === "unauth") {
    return (
      <div className="gate">
        <span className="pulse" />
        {state === "loading" ? "Loading your dashboard…" : "Redirecting to sign in…"}
        <style jsx>{`
          .gate {
            position: relative;
            z-index: 1;
            min-height: 100vh;
            min-height: 100dvh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 14px;
            color: var(--text-faint);
            font-family: var(--font-mono);
            font-size: 12px;
            letter-spacing: 0.06em;
          }
          .pulse {
            width: 34px;
            height: 34px;
            border-radius: 10px;
            background: var(--amber);
            box-shadow: 0 0 30px rgba(242, 169, 59, 0.4);
            animation: p 1.1s ease-in-out infinite;
          }
          @keyframes p {
            0%,
            100% {
              transform: scale(1);
              opacity: 1;
            }
            50% {
              transform: scale(1.1);
              opacity: 0.75;
            }
          }
        `}</style>
      </div>
    );
  }

  if (state === "offline") {
    return (
      <div className="gate">
        <p>Can&apos;t reach the Crisis Room API.</p>
        <p className="hint">Start it with `uvicorn server.main:app --reload --port 8000`, then reload.</p>
        <button onClick={() => { setState("loading"); refreshUser(); }}>Retry</button>
        <style jsx>{`
          .gate {
            position: relative;
            z-index: 1;
            min-height: 100vh;
            min-height: 100dvh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px;
            text-align: center;
            color: var(--text-dim);
            padding: 20px;
          }
          .hint {
            color: var(--text-faint);
            font-family: var(--font-mono);
            font-size: 12px;
          }
          button {
            margin-top: 8px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.16);
            color: #fff;
            padding: 9px 18px;
            border-radius: 999px;
            cursor: pointer;
          }
        `}</style>
      </div>
    );
  }

  return (
    <AppUserContext.Provider value={{ user, setUser, refreshUser }}>
      <AppHeader user={user} />
      {children}
    </AppUserContext.Provider>
  );
}
