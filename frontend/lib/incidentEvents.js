// Turn a persisted list of AgentEvent dicts (from GET /api/incidents/{id})
// into the same `detail` shape the /console page derives from its live
// WebSocket stream — so the existing PipelineRail / AgentPanel /
// ReasoningTerminal / RecoveryChart components render it unchanged.
//
// This mirrors the reducer inside app/console/page.js but as a pure
// function over a static array. The /console reducer itself is untouched.

export const PIPELINE_AGENTS = ["triage", "investigator", "commander", "communicator"];

export function emptyDetail() {
  return {
    agentStatus: {},
    agentOutputs: {},
    agentLatency: {},
    executionResult: null,
    recoveryTicks: [],
    initialErrorRate: 0,
    lines: [],
    resolved: false,
  };
}

export function reduceIncidentEvents(events = []) {
  const detail = emptyDetail();

  for (const ev of events) {
    if (!ev) continue;
    const { agent, event_type, output, reasoning_trace, latency_ms, timestamp } = ev;

    if (reasoning_trace) {
      detail.lines.push({
        agent,
        text: reasoning_trace,
        timestamp: timestamp ? new Date(timestamp).toLocaleTimeString() : "",
      });
    }

    if (event_type === "started" && output) {
      detail.initialErrorRate = output.error_rate_pct ?? 0;
    }

    if (event_type === "output" && agent !== "system" && output) {
      detail.agentOutputs[agent] = output;
      if (latency_ms !== undefined && latency_ms !== null) {
        detail.agentLatency[agent] = latency_ms;
      }
      const idx = PIPELINE_AGENTS.indexOf(agent);
      detail.agentStatus[agent] = "done";
      if (idx >= 0 && idx + 1 < PIPELINE_AGENTS.length && !detail.agentStatus[PIPELINE_AGENTS[idx + 1]]) {
        detail.agentStatus[PIPELINE_AGENTS[idx + 1]] = "active";
      }
    }

    if (event_type === "execution") detail.executionResult = output;
    if (event_type === "recovery_tick" && output) detail.recoveryTicks.push(output);
    if (event_type === "incident_resolved") detail.resolved = true;
  }

  if (detail.resolved) {
    for (const a of PIPELINE_AGENTS) {
      if (detail.agentStatus[a] === "active") detail.agentStatus[a] = "done";
    }
  }

  return detail;
}
