const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const WS_BASE = API_BASE.replace(/^http/, "ws");

export async function fetchScenarios() {
  const res = await fetch(`${API_BASE}/api/scenarios`);
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}

export async function triggerScenario(scenarioKey) {
  const res = await fetch(`${API_BASE}/api/incidents/scenario/${scenarioKey}`, { method: "POST" });
  return res.json();
}

export async function triggerCustomIncident(payload) {
  const res = await fetch(`${API_BASE}/api/incidents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/**
 * Opens a WebSocket for the given incident and calls onEvent for every
 * AgentEvent as it streams in. Returns a cleanup function.
 */
export function streamIncident(incidentId, onEvent, onClose) {
  const ws = new WebSocket(`${WS_BASE}/ws/${incidentId}`);
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    onEvent(data);
  };
  ws.onclose = () => onClose && onClose();
  return () => ws.close();
}

/**
 * Opens the ALWAYS-ON live feed - every incident from every source
 * (webhook or manual), with no incident_id known in advance. This is the
 * connection a real ops dashboard keeps open permanently; it's what makes
 * new incidents "just appear" the moment a monitoring tool's webhook fires.
 */
export function streamLiveFeed(onEvent, onStatusChange) {
  const ws = new WebSocket(`${WS_BASE}/ws/live`);
  ws.onopen = () => onStatusChange && onStatusChange("connected");
  ws.onmessage = (msg) => onEvent(JSON.parse(msg.data));
  ws.onclose = () => onStatusChange && onStatusChange("disconnected");
  ws.onerror = () => onStatusChange && onStatusChange("error");
  return () => ws.close();
}
