"""
A real service Crisis Room actually controls — the honest version of
integrations/mock_infra.py.

mock_infra is a decay formula. This is a live HTTP endpoint with real
failure *mechanisms* and a real control API:

  GET  /api/target/                      the endpoint a monitor watches
  POST /api/target/_control/inject       break it (bad_deploy | pool_exhaustion | dependency_down)
  POST /api/target/_control/remediate    what Crisis Room's executor calls
  POST /api/target/_control/clear        manual reset
  GET  /api/target/_control              a tiny HTML panel to drive a demo
  GET  /api/target/_control/state        inspect

When the Commander picks `rollback` and RealTargetExecutor calls
POST /_control/remediate {"action":"rollback"}, this service's request
handler genuinely stops throwing and its error rate genuinely recovers on
the next polls. If the Commander picks the wrong action, it genuinely does
not — each remediation only addresses the fault it actually fixes.

Still a service this build owns, not a customer's production system (see
README). Pointing RealTargetExecutor at real infra — a Docker socket, a
Kubernetes API, a cloud deploy pipeline — is the Level 2 swap; nothing
upstream changes because it only ever talks to the RemediationExecutor
interface.
"""
from __future__ import annotations

import asyncio
import random

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/target", tags=["demo-target"])

FAULTS = ("bad_deploy", "pool_exhaustion", "dependency_down")

# What each remediation actually addresses. A "restart" clears transient
# runtime state but a bad deploy survives it — so the Commander picking
# rollback vs restart genuinely matters.
_REMEDIATION_FIXES: dict[str, set[str]] = {
    "rollback": {"bad_deploy"},
    "scale": {"pool_exhaustion"},
    "restart": {"pool_exhaustion", "dependency_down"},
    "failover": {"dependency_down"},
    # escalate / monitor intentionally fix nothing
}


class _State:
    def __init__(self) -> None:
        self.faults: set[str] = set()
        self.deploy_version: int = 14
        self.using_backup_upstream: bool = False
        self.total_requests: int = 0
        self.failed_requests: int = 0

    @property
    def healthy(self) -> bool:
        return not self.faults

    def as_dict(self) -> dict:
        return {
            "faults": sorted(self.faults),
            "deploy_version": self.deploy_version,
            "using_backup_upstream": self.using_backup_upstream,
            "healthy": self.healthy,
            "total_requests": self.total_requests,
            "failed_requests": self.failed_requests,
        }


STATE = _State()


async def _serve_request() -> tuple[int, float, str]:
    """The actual request path. Returns (status, latency_ms, note)."""
    STATE.total_requests += 1

    # bad deploy: a code path in the shipped build that throws on a fraction
    # of requests
    if "bad_deploy" in STATE.faults and random.random() < 0.55:
        return 500, 28.0, f"NullPointer in v{STATE.deploy_version} checkout handler"

    # undersized worker pool: real slow responses, some queued out entirely
    latency = 42.0
    if "pool_exhaustion" in STATE.faults:
        latency = 3200.0 + random.random() * 900.0
        await asyncio.sleep(min(latency, 4000.0) / 1000.0)
        if random.random() < 0.4:
            return 503, latency, "worker pool exhausted — request queued out"
    else:
        await asyncio.sleep(latency / 1000.0)

    # dependency down: a real upstream call that fails unless we've failed over
    if "dependency_down" in STATE.faults and not STATE.using_backup_upstream:
        return 502, latency, "upstream inventory-svc unreachable (us-east)"

    return 200, latency, "ok"


@router.get("/")
async def target_root():
    code, latency, note = await _serve_request()
    if code >= 500:
        STATE.failed_requests += 1
        return JSONResponse(
            {"error": note, "version": STATE.deploy_version},
            status_code=code,
        )
    return {"ok": True, "version": STATE.deploy_version, "latency_ms": round(latency), "note": note}


class InjectBody(BaseModel):
    fault: str


@router.post("/_control/inject")
async def inject_fault(body: InjectBody):
    if body.fault not in FAULTS:
        return JSONResponse(
            {"error": f"unknown fault '{body.fault}'. one of: {list(FAULTS)}"}, status_code=422
        )
    STATE.faults.add(body.fault)
    return STATE.as_dict()


class ClearBody(BaseModel):
    fault: str | None = None


@router.post("/_control/clear")
async def clear_fault(body: ClearBody | None = None):
    if body and body.fault:
        STATE.faults.discard(body.fault)
    else:
        STATE.faults.clear()
        STATE.using_backup_upstream = False
    return STATE.as_dict()


class RemediateBody(BaseModel):
    action: str


@router.post("/_control/remediate")
async def remediate(body: RemediateBody):
    """Called by RealTargetExecutor. Applies exactly what `action` fixes —
    nothing more. A wrong action returns changed=[] and effective=false."""
    action = (body.action or "").lower()
    fixes = _REMEDIATION_FIXES.get(action, set())
    cleared = sorted(STATE.faults & fixes)

    STATE.faults -= fixes
    changed: list[str] = []
    if "bad_deploy" in cleared:
        STATE.deploy_version += 1
        changed.append(f"rolled back to v{STATE.deploy_version} (previous good build)")
    if "pool_exhaustion" in cleared:
        changed.append("raised worker-pool capacity, latency back to baseline")
    if "dependency_down" in cleared:
        STATE.using_backup_upstream = True
        changed.append("failed over to backup inventory-svc (us-west)")

    return {
        "action": action,
        "effective": bool(changed),
        "changed": changed,
        "state": STATE.as_dict(),
    }


@router.get("/_control/state")
async def control_state():
    return STATE.as_dict()


@router.get("/_control", response_class=HTMLResponse)
async def control_panel():
    return """<!doctype html><html><head><meta charset="utf-8">
<title>Crisis Room — demo target control</title>
<style>
 body{background:#0b0c0e;color:#eee;font:14px/1.5 -apple-system,system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 20px}
 h1{font-size:18px} button{background:#1b1d21;color:#eee;border:1px solid #333;border-radius:8px;padding:9px 13px;margin:4px 4px 4px 0;cursor:pointer}
 button:hover{border-color:#666} .break button{border-color:#5a2b2b} .fix button{border-color:#2b5a3b}
 pre{background:#141518;border:1px solid #222;border-radius:8px;padding:12px;font-size:12px;white-space:pre-wrap}
 .muted{color:#888;font-size:12.5px}
</style></head><body>
<h1>Demo target — <code>/api/target/</code></h1>
<p class="muted">Inject a real fault, then let a Crisis Room monitor watch this URL. This service really breaks and really recovers — the recovery you see in the incident is measured off these endpoints.</p>
<div class="break"><strong>Break it:</strong><br>
 <button onclick="ctl('/_control/inject',{fault:'bad_deploy'})">inject bad deploy (500s)</button>
 <button onclick="ctl('/_control/inject',{fault:'pool_exhaustion'})">inject pool exhaustion (latency + 503s)</button>
 <button onclick="ctl('/_control/inject',{fault:'dependency_down'})">inject dependency down (502s)</button>
</div>
<div class="fix"><strong>Fix it manually:</strong><br>
 <button onclick="ctl('/_control/clear',{})">clear all faults</button>
</div>
<p class="muted">The agents' chosen remediation is applied automatically via <code>/_control/remediate</code> during an incident — you shouldn't need the manual clear except to reset.</p>
<pre id="s">loading…</pre>
<script>
 const B='/api/target';
 async function refresh(){const r=await fetch(B+'/_control/state');document.getElementById('s').textContent=JSON.stringify(await r.json(),null,2);}
 async function ctl(p,body){await fetch(B+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});refresh();}
 refresh();setInterval(refresh,2000);
</script>
</body></html>"""
