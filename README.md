# Crisis Room

**Multi-agent AI incident response for enterprises.**
Team Gol_Gappe — Riddhika Sachdeva, Hemank — MAIT, Delhi
Build with Bharat 2.0, National Level Hackathon (NIT Delhi, organized by CodeVerse)

Crisis Room runs incident response the way a coordinated on-call team would,
except four specialized AI agents do it in parallel instead of one overloaded
human at 2:47 AM: **Triage → Investigator → Commander → Communicator**, every
decision streamed live to a dashboard instead of hidden in a Slack thread.

This repo is a real, running implementation — not a mockup. Every agent
produces typed, validated JSON (Pydantic), the orchestrator chains them and
streams results over a WebSocket the moment they're produced, and the
dashboard renders that stream live.

---

## Architecture

```
Real monitoring tool (Datadog/PagerDuty/Prometheus/your own)
        │  webhook fires automatically, zero human involved
        ▼
POST /api/webhooks/{source}  →  adapter normalizes to IncidentSignal
        │
        ▼
Triage Agent → Investigator Agent → Commander Agent → Communicator Agent
        │                                   │
        │                                   ▼
        │                     Execution seam (integrations/executor.py)
        │                     "recommends" today; a company plugs in
        │                     their own infra integration to "execute"
        │
        ▼
Broadcast to every dashboard on /ws/live — incidents just appear, live
```

(Communicator also fires an early "we're on it" notice right after Triage.)

| Agent | Job | Input | Output |
|---|---|---|---|
| **Triage** | Classifies severity fast | raw alert/telemetry | SEV1–SEV4, affected services, leads for Investigator |
| **Investigator** | Root-cause analysis across DB/network/security | Triage output | hypothesis, evidence, ruled-out causes |
| **Commander** | Picks a remediation action, explains why | Triage + Investigator output | action (rollback/restart/scale/failover/escalate/monitor), rationale |
| **Communicator** | Drafts stakeholder-specific updates | current incident state | customer / internal-eng / leadership messages |

Every agent output is validated against a Pydantic schema (`agents/models.py`)
before it's allowed to reach the next agent or the dashboard — this is what
keeps a 4-agent pipeline reliable instead of turning into a chatbot with
extra steps.

### Real AI, with a safety net
Every agent calls Claude (`claude-sonnet-4-6` by default) when
`ANTHROPIC_API_KEY` is set in the environment. If it isn't set, each agent
falls back to deterministic rule-based logic that still produces the same
typed output — so a bad-wifi venue can't take down your demo. Check which
mode you're in via `GET /api/health` (`llm_mode: "live"` or
`"offline_fallback"`), and it's also shown live in the dashboard header.

---

## From demo to product: how this actually gets adopted

The 3 scripted scenarios are there so a hackathon demo is deterministic and
repeatable. But the real product doesn't wait for someone to click a
button — it reacts automatically the moment a company's existing monitoring
stack detects a problem. Three pieces make that true today, not just in
theory:

### 1. Automatic ingestion from real monitoring tools
`integrations/adapters.py` translates a real webhook payload from Datadog,
PagerDuty, or Prometheus Alertmanager into our one shared `IncidentSignal`
contract. Point that tool's webhook config at:

```
POST /api/webhooks/{datadog|pagerduty|prometheus|generic}
```

...and the full 4-agent pipeline runs with **zero human involvement** —
verified end to end in this build (fire a fake Prometheus alert, watch it
get diagnosed and resolved with no one clicking anything). A company with
its own in-house alerting doesn't even need a new adapter: `generic`
accepts our `IncidentSignal` shape directly.

Adding support for a monitoring tool we don't cover yet means writing one
new function in `adapters.py` — nothing else in the pipeline changes. That's
the entire point of validating everything against one typed contract.

### 2. An always-on dashboard, not a per-incident link
A real on-call engineer doesn't know an `incident_id` in advance. `GET
/ws/live` is a single connection a dashboard keeps open permanently;
**any** incident, from **any** source, appears on it automatically the
moment it starts, and updates live until it resolves. The demo UI's
"Live incident feed" panel is this exact connection — the scenario buttons
below it are just a convenient way to generate a webhook-shaped event for
rehearsal, not a separate code path.

### 3. Real execution against a safely sandboxed target
Crisis Room **does execute its recommended remediation automatically**, by
default, in this build. `integrations/executor.py`'s `MockInfraExecutor`
applies the Commander's action to a live target service this build
actually owns (`integrations/mock_infra.py`) and streams that service's
**real** recovery back to the dashboard — the error-rate curve you see is
a genuine state change from a genuine function call over real wall-clock
time, not a precomputed formula.

What it does *not* do: touch a customer's real production infrastructure.
This build has no real cloud credentials to point at, and faking that
connection would be dishonest regardless of how convincing it looked in a
demo. What's real is the automation loop itself — diagnose, decide,
execute, confirm recovery — proven end to end against a target Crisis Room
actually controls.

Adopting this for real production infrastructure is a one-file change:
implement `RemediationExecutor` against a real Kubernetes/cloud/deploy API
(see the commented `KubernetesExecutor` sketch in `executor.py` for the
shape it takes) and return it from `get_executor()`. Nothing upstream — the
4 agents, the orchestrator, the dashboard — has to change, because they
only ever talk to that one interface. Most real deployments would also gate
that class behind a human approval step before it's allowed to call
anything, since that's what enterprises require for production changes
regardless of who initiates them — this build's own competitive-advantage
slide argues exactly that.

Prefer recommend-only mode with zero automation? Set
`CRISIS_ROOM_EXECUTOR=noop` and the Commander's decision is logged but
nothing is touched — the dashboard falls back to a clearly labeled
*simulated* recovery projection (`agents/executor.py`) instead of a live one.

---

## Repo layout

```
crisis-room/
├── agents/            # the 4 agents + shared Pydantic contract + LLM wrapper
│   ├── models.py
│   ├── llm.py
│   ├── triage.py
│   ├── investigator.py
│   ├── commander.py
│   ├── communicator.py
│   └── executor.py         # SIMULATED recovery-curve visualization (not real infra)
├── integrations/
│   ├── adapters.py           # normalizes Datadog/PagerDuty/Prometheus/generic webhooks
│   ├── mock_infra.py          # a REAL sandboxed target service Crisis Room actually controls
│   └── executor.py             # execution seam - applies the fix to mock_infra by default
├── orchestrator/
│   └── orchestrator.py        # chains agents, yields AgentEvents as they happen
├── server/
│   └── main.py                 # FastAPI REST + WebSocket layer, webhook ingestion, live feed
├── fixtures/
│   └── scenarios.py             # 3 scripted demo incidents
├── frontend/                     # Next.js dashboard
│   ├── app/                      # page, layout, design tokens (globals.css)
│   ├── components/                # PipelineRail, AgentPanel, ReasoningTerminal,
│   │                               # LiveIncidentFeed, RecoveryChart
│   └── lib/api.js                 # REST + WebSocket client (incl. always-on live feed)
├── Dockerfile                       # backend container
├── requirements.txt
└── README.md
```

---

## Running it locally

### 1. Backend

```bash
cd crisis-room
pip install -r requirements.txt

# optional — enables live Claude reasoning instead of the offline fallback
export ANTHROPIC_API_KEY=sk-ant-...

uvicorn server.main:app --reload --port 8000
```

Check it's up: `curl http://localhost:8000/api/health`

### 2. Frontend

```bash
cd crisis-room/frontend
npm install
npm run dev
```

Open **http://localhost:3000** for the landing page, or go straight to
**http://localhost:3000/console** for the live dashboard. The console is
where the actual product lives — pick a scenario button and watch the
pipeline rail, agent panels, and reasoning terminal update live over
WebSocket as each agent finishes.

If your backend isn't on `localhost:8000`, set `NEXT_PUBLIC_API_BASE` before
`npm run dev` / `npm run build`.

### 3. Docker (backend only)

```bash
docker build -t crisis-room-api .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... crisis-room-api
```

---

## The 3 demo scenarios

Per the build brief, these are scripted fixtures so the dashboard tells a
coherent, verifiable story every run — no LLM randomness required for a
correct demo:

| Scenario key | Story | Correct diagnosis | Correct action |
|---|---|---|---|
| `payment-outage` | 42% error rate, DB pool near max, no recent deploy | connection pool exhaustion | **SCALE** |
| `bad-deploy` | Errors start right after a schema-migration deploy | deploy/migration regression | **ROLLBACK** |
| `network-partition` | Cross-region timeouts, packet loss on the link | cross-region network degradation | **FAILOVER** |

Run any of them directly against the API without the UI:

```bash
curl -X POST http://localhost:8000/api/incidents/scenario/payment-outage
# -> {"incident_id": "INC-XXXXXXXX"}
# then connect a WebSocket client to ws://localhost:8000/ws/INC-XXXXXXXX
```

---

## Demo script (rehearse this)

1. Open the dashboard. It's already listening — the **LISTENING FOR
   INCIDENTS** badge and empty "Live incident feed" panel are the real
   product state, not a loading screen. Say so explicitly: *"this is what
   an on-call engineer leaves open all day — nothing to click yet because
   nothing's broken yet."*
2. Trigger `payment-outage` from the scenario list — narrate it as standing
   in for a Datadog alert firing, since it goes through the identical
   `POST /api/webhooks/...` code path a real integration would use. Watch
   it appear in the live feed automatically, not because you clicked into
   a specific incident.
3. Narrate as it streams:
   - Triage classifies SEV1 in under a second — $300K/min is on the line.
   - Communicator fires immediately with a holding message — no silence.
   - Investigator rules out network and security explicitly, lands on
     connection-pool exhaustion with evidence.
   - Commander explains *why* SCALE and not ROLLBACK — this is the
     explainability judges care about most.
   - Point out the **execution note**: "Executed — applied to a sandboxed
     target service." This is genuinely running, not a canned animation —
     say so, and point to `integrations/mock_infra.py` if asked how.
   - Point out the **recovery chart**, labeled LIVE — the error rate is
     dropping because the recommended action was actually applied to a
     real (if sandboxed) target, tick by tick, over real wall-clock time.
   - Communicator fires again with the resolution update.
4. Run `bad-deploy` live to show the *same 4 agents* reach a *different,
   correct* decision (ROLLBACK) from different evidence — this is what
   proves it's real reasoning, not a hardcoded script.
5. If you want to make the automatic-ingestion story concrete, fire a real
   webhook from a terminal mid-demo and watch it appear in the feed with
   nobody touching the UI:
   ```bash
   curl -X POST http://localhost:8000/api/webhooks/prometheus \
     -H "Content-Type: application/json" \
     -d '{"alerts":[{"labels":{"service":"auth-svc","error_rate_pct":"15"},"annotations":{"summary":"AuthDown","description":"auth-svc failing health checks"}}]}'
   ```
6. Close on the reasoning terminal: every decision is logged and inspectable,
   nothing is a black box.

---

## Where this comes from

This evolves an earlier RL-based incident-response prototype by the same
core team that reached the Grand Finale (top 3% of 70,000+ teams) at a
national-level AI hackathon. That prototype modeled 6 conceptual roles, but
only the Incident Commander was real RL-trained AI — the rest were
deterministic by design, to keep training reward-hackproof. This build turns
all of them into real, coordinated, autonomous agents behind a real UI.

The Commander's reward rubric from that prototype (`agents/commander.py`,
`REWARD_RUBRIC`) still defines what "good incident command" means here, and
is used to prompt the LLM-driven Commander:

| Component | Weight | What it measures |
|---|---|---|
| Resolution correctness | 35% | Right root cause **and** right remediation |
| Time efficiency | 20% | Faster, correct resolution scores higher |
| Communication quality | 20% | Stakeholders updated at the right intervals |
| Delegation/routing accuracy | 15% | Right questions routed to the right specialist reasoning |
| Postmortem quality | 10% | Root cause, impact, and ≥2 action items stated correctly |

---

## Hackathon requirements checklist

Main track — Build with Bharat 2.0:
- [x] **Working implementation, not just slides** — this repo runs end to end (verified: all 3 scenarios, REST + WebSocket, offline fallback and live-LLM code paths).
- [x] PPT template followed, 8 content slides — `Crisis_Room_NIT_Delhi_Final.pptx`.
- [ ] **GitHub repository link** on the References slide — push this repo and add the link (see below).
- [ ] **Live demo link** on the References slide — deploy backend + frontend and add the link (see below).

Optional bonus track — Agentic Solutions: Powered by x402 (skip unless the
core demo is rock-solid with time to spare — the brief is explicit that this
is additive, not required, and the review is strict: live Algorand Testnet
transaction, GoPlausible facilitator, `@x402-avm` deps, gating the
Investigator endpoint). Not attempted here — flag if you want to pursue it
next.

### Still open (need your input / your accounts, not something I can do for you)
1. **GitHub repo** — create it and push this code:
   ```bash
   git init && git add . && git commit -m "Crisis Room: 4-agent incident command platform"
   git remote add origin https://github.com/<your-org>/crisis-room.git
   git push -u origin main
   ```
2. **Live demo URL** — quickest path: backend to Render/Railway/Fly.io
   (Dockerfile is ready), frontend to Vercel (`NEXT_PUBLIC_API_BASE` pointed
   at your deployed backend URL). Say the word and I'll write the exact
   deploy configs for whichever platform you want.
3. Update slide 8 (References) with both links once you have them.
