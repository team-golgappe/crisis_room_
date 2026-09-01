"""
Local testing aid — a controllable endpoint you can point a synthetic
monitor at to exercise real degradation detection without a real failing
site.

NOT part of the product. Mounted only when ENABLE_DEVTOOLS is true (default
on for local dev; turn it off for any real deployment). Has nothing to do
with the /console demo.

  GET  /api/dev/probe          -> responds per the current mode
  GET  /api/dev/probe/state    -> current mode
  POST /api/dev/probe          -> set mode: healthy | erroring | slow
"""
from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/dev", tags=["devtools"])

_state: dict = {"mode": "healthy", "status": 503, "latency_ms": 5000}


class ProbeControl(BaseModel):
    mode: Literal["healthy", "erroring", "slow"]
    status: int = Field(default=503, ge=400, le=599)
    latency_ms: int = Field(default=5000, ge=0, le=60000)


@router.get("/probe")
async def probe():
    mode = _state["mode"]
    if mode == "slow":
        await asyncio.sleep(_state["latency_ms"] / 1000.0)
        return {"ok": True, "note": "intentionally slow response"}
    if mode == "erroring":
        return JSONResponse({"error": "synthetic failure (devtools)"}, status_code=_state["status"])
    return {"ok": True}


@router.get("/probe/state")
async def probe_state():
    return _state


@router.post("/probe")
async def set_probe(control: ProbeControl):
    _state.update(mode=control.mode, status=control.status, latency_ms=control.latency_ms)
    return _state
