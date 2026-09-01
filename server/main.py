"""
Crisis Room API layer.

Two ways an incident starts:
  1. AUTOMATICALLY, the way a real deployment works: a monitoring tool
     (Datadog, PagerDuty, Prometheus Alertmanager, or your own in-house
     alerting) POSTs a webhook the moment something breaks. No human
     clicks anything - see POST /api/webhooks/{source}.
  2. Manually, for demos and testing: the 3 scripted scenarios, or a
     hand-built custom payload via POST /api/incidents.

Either path runs through the exact same orchestrator and is broadcast to
every connected dashboard over /ws/live - a real company's ops dashboard
just stays open and lights up whenever an incident comes in, the same way
this hackathon demo does when you click a scenario button.

Endpoints:
  GET  /api/health                          -> liveness + LLM mode check
  GET  /api/scenarios                        -> list the fixture scenarios for the demo
  POST /api/incidents                         -> trigger a custom incident, returns incident_id
  POST /api/incidents/scenario/{key}          -> trigger a scripted demo scenario
  POST /api/webhooks/{source}                 -> AUTOMATIC ingestion from a real monitoring tool
                                                  (source: datadog | pagerduty | prometheus | generic)
  WS   /ws/{incident_id}                      -> live stream of one incident's AgentEvents
  WS   /ws/live                               -> live stream of ALL incidents as they happen
                                                  (what a real always-on ops dashboard connects to)

Run: uvicorn server.main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # allow `agents`/`orchestrator` imports

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents.models import AgentEvent, IncidentSignal
from fixtures.scenarios import SCENARIOS
from integrations.adapters import ADAPTERS
from orchestrator.orchestrator import run_incident

# --- authenticated product area (separate from the /console demo surface) ---
from api.account import router as account_router
from api.incidents import router as incidents_router
from api.sites import router as sites_router
from auth.routes import router as auth_router
from config import settings
from db.database import init_db
from monitoring.supervisor import resume_all_monitors, shutdown_all_monitors


def _configure_product_logging() -> None:
    """Give the authenticated-area loggers ('crisis_room.*') a handler that
    matches uvicorn's line format. Does not touch uvicorn's own loggers or
    anything on the /console path."""
    import logging

    logger = logging.getLogger("crisis_room")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s:     [%(name)s] %(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    _configure_product_logging()
    init_db()
    await resume_all_monitors()
    try:
        yield
    finally:
        await shutdown_all_monitors()


app = FastAPI(title="Crisis Room API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(account_router)
app.include_router(sites_router)
app.include_router(incidents_router)

if settings.enable_devtools:
    from api.devtools import router as devtools_router

    app.include_router(devtools_router)

if settings.enable_demo_target:
    from integrations.target_service import router as target_router

    app.include_router(target_router)

_active_incidents: dict[str, IncidentSignal] = {}

# Every AgentEvent ever produced, keyed by incident_id - lets a dashboard
# that connects mid-incident (or after it resolved) still see the full
# history, not just events emitted after it joined.
_incident_history: dict[str, list[dict]] = {}

# Every currently-connected "live feed" dashboard client, so a new incident
# (from a webhook or a demo button) is pushed out immediately with zero
# polling. This in-memory pub/sub is enough for a single-process demo;
# a production deployment would put this behind Redis pub/sub or similar
# once running more than one API instance.
_live_subscribers: set[WebSocket] = set()


async def _broadcast(event: AgentEvent) -> None:
    payload = event.model_dump(mode="json")
    _incident_history.setdefault(event.incident_id, []).append(payload)
    dead = []
    for ws in _live_subscribers:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _live_subscribers.discard(ws)


async def _run_and_broadcast(signal: IncidentSignal) -> None:
    """Runs the full agent pipeline for one incident and pushes every event
    to all connected /ws/live subscribers as it happens. This is the
    function both the manual trigger endpoints AND the automatic webhook
    endpoint call - there is exactly one code path from 'incident signal
    exists' to 'agents ran', regardless of how that signal arrived."""
    async for event in run_incident(signal):
        await _broadcast(event)
        await asyncio.sleep(0.35)  # pacing so a live audience can actually follow along


@app.get("/api/health")
async def health():
    from agents.llm import llm_available

    return {"status": "ok", "llm_mode": "live" if llm_available() else "offline_fallback"}


@app.get("/api/scenarios")
async def list_scenarios():
    return {key: sig.model_dump(mode="json") for key, sig in SCENARIOS.items()}


class CustomIncidentRequest(BaseModel):
    title: str
    service: str
    error_rate_pct: float
    latency_p99_ms: float
    affected_users: int
    revenue_per_min_usd: float
    raw_context: str = ""


@app.post("/api/incidents")
async def create_incident(req: CustomIncidentRequest):
    signal = IncidentSignal(**req.model_dump(), source="manual")
    _active_incidents[signal.incident_id] = signal
    asyncio.create_task(_run_and_broadcast(signal))
    return {"incident_id": signal.incident_id}


@app.post("/api/incidents/scenario/{scenario_key}")
async def create_incident_from_scenario(scenario_key: str):
    if scenario_key not in SCENARIOS:
        raise HTTPException(404, f"unknown scenario '{scenario_key}'")
    base = SCENARIOS[scenario_key]
    # fresh incident_id/timestamp each run, so replaying a scenario multiple
    # times during rehearsal doesn't collide with a previous run
    signal = IncidentSignal(**{**base.model_dump(exclude={"incident_id", "timestamp"})})
    _active_incidents[signal.incident_id] = signal
    asyncio.create_task(_run_and_broadcast(signal))
    return {"incident_id": signal.incident_id}


@app.post("/api/webhooks/{source}")
async def receive_webhook(source: str, request: Request):
    """AUTOMATIC ingestion. Point your monitoring tool's webhook config at
    this URL and Crisis Room runs the full 4-agent pipeline with zero human
    involvement - this is the actual product, not a demo convenience.

    `source` selects the adapter that parses that tool's payload shape into
    our IncidentSignal contract (see integrations/adapters.py). Unsupported
    tools can still integrate immediately via `generic`, which accepts our
    IncidentSignal shape directly - no adapter code required for a company
    with its own alerting to get value on day one.
    """
    adapter = ADAPTERS.get(source)
    if adapter is None:
        raise HTTPException(404, f"no adapter for source '{source}'. Supported: {list(ADAPTERS)}")

    payload = await request.json()
    try:
        signal = adapter(payload)
    except Exception as e:
        raise HTTPException(422, f"could not parse {source} payload into an incident signal: {e}")

    _active_incidents[signal.incident_id] = signal
    asyncio.create_task(_run_and_broadcast(signal))
    return {"incident_id": signal.incident_id, "source": source, "status": "pipeline started"}


@app.websocket("/ws/live")
async def live_feed(websocket: WebSocket):
    """The real always-on ops dashboard connection: subscribes to EVERY
    incident, from ANY source (webhook or manual), automatically - nobody
    needs to know an incident_id in advance. This is what makes Crisis Room
    usable as a product instead of a button-triggered demo: point your
    monitoring stack's webhooks here, leave this dashboard open, and new
    incidents just appear and resolve live."""
    await websocket.accept()
    _live_subscribers.add(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep the connection open; we don't expect client messages
    except WebSocketDisconnect:
        pass
    finally:
        _live_subscribers.discard(websocket)


@app.websocket("/ws/{incident_id}")
async def incident_stream(websocket: WebSocket, incident_id: str):
    """Stream one specific incident - used by the demo UI right after it
    triggers a scenario, when it already knows the incident_id it wants.
    NOTE: registered AFTER /ws/live so the literal "live" path isn't
    swallowed by this parameterized route - Starlette matches websocket
    routes in registration order."""
    await websocket.accept()

    # replay anything that already happened (the pipeline may have started
    # running before this socket connected, since triggering and streaming
    # are now decoupled to support the automatic webhook path)
    for payload in _incident_history.get(incident_id, []):
        await websocket.send_json(payload)

    if incident_id not in _active_incidents:
        await websocket.send_json({"error": f"unknown incident_id {incident_id}"})
        await websocket.close()
        return

    # then keep streaming new events for this incident as they arrive
    seen = len(_incident_history.get(incident_id, []))
    try:
        while True:
            await asyncio.sleep(0.3)
            history = _incident_history.get(incident_id, [])
            for payload in history[seen:]:
                await websocket.send_json(payload)
            seen = len(history)
            if history and history[-1].get("event_type") == "incident_resolved":
                break
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()
