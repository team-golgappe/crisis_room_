// Client for the authenticated product area (accounts, site monitors,
// persisted incident history). Every call sends the session cookie via
// `credentials: "include"`. This is separate from lib/api.js, which the
// unauthenticated /console demo uses and which must not change.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function messageFromDetail(detail, fallback) {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d?.msg || JSON.stringify(d)).join("; ");
  }
  return fallback;
}

async function request(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(`Can't reach the Crisis Room API at ${API_BASE}. Is it running?`, 0);
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(messageFromDetail(data?.detail, `Request failed (${res.status})`), res.status);
  }
  return data;
}

export const authApi = {
  signup: (email, password) => request("/api/auth/signup", { method: "POST", body: { email, password } }),
  login: (email, password) => request("/api/auth/login", { method: "POST", body: { email, password } }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  me: () => request("/api/auth/me"),
};

export const sitesApi = {
  list: () => request("/api/sites"),
  create: (payload) => request("/api/sites", { method: "POST", body: payload }),
  remove: (id) => request(`/api/sites/${id}`, { method: "DELETE" }),
};

export const incidentsApi = {
  list: () => request("/api/incidents"),
  get: (id) => request(`/api/incidents/${encodeURIComponent(id)}`),
};

export const accountApi = {
  get: () => request("/api/account"),
  setSlackWebhook: (webhook_url) =>
    request("/api/account/slack-webhook", { method: "PUT", body: { webhook_url } }),
  testSlackWebhook: () => request("/api/account/slack-webhook/test", { method: "POST" }),
};
