"""
Owns the background asyncio tasks — one synthetic monitor per active
monitored_sites row, plus the pipeline runs those monitors kick off.

Lifecycle:
  - server startup  -> resume_all_monitors()   (one task per active site)
  - POST /api/sites -> start_monitor(site)
  - DELETE /api/sites/{id} -> stop_monitor(site_id)
  - server shutdown -> shutdown_all_monitors()

Single-process, in-memory task registry — the same scope as the existing
/ws/live pub-sub in server/main.py. A multi-instance deployment would move
this to a real worker/queue.
"""
from __future__ import annotations

import asyncio
import logging

from db.database import session_scope
from db.models import MonitoredSite
from integrations.synthetic_monitor import (
    Assessment,
    MonitorConfig,
    merge_thresholds,
    run_monitor,
)
from monitoring.runner import run_and_persist_incident

log = logging.getLogger("crisis_room.monitor")

_monitor_tasks: dict[int, asyncio.Task] = {}
_pipeline_tasks: set[asyncio.Task] = set()


def _config_for(site: MonitoredSite) -> MonitorConfig:
    return MonitorConfig(
        site_id=site.id,
        user_id=site.user_id,
        url=site.url,
        service_name=site.service_name,
        thresholds=merge_thresholds(site.thresholds),
    )


def _make_emitter(user_id: int, site_id: int, monitored_url: str):
    async def _emit(signal, assessment: Assessment) -> None:
        log.info(
            "site %s degraded (%s) -> firing incident %s",
            site_id, "; ".join(assessment.reasons), signal.incident_id,
        )
        task = asyncio.create_task(
            run_and_persist_incident(
                signal, user_id=user_id, site_id=site_id, monitored_url=monitored_url
            )
        )
        _pipeline_tasks.add(task)
        task.add_done_callback(_pipeline_tasks.discard)

    return _emit


def start_monitor(site: MonitoredSite) -> None:
    if site.id in _monitor_tasks and not _monitor_tasks[site.id].done():
        return
    config = _config_for(site)
    emitter = _make_emitter(site.user_id, site.id, site.url)

    async def _guarded() -> None:
        try:
            await run_monitor(config, emitter)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("monitor for site %s crashed", site.id)

    task = asyncio.create_task(_guarded(), name=f"monitor-site-{site.id}")
    _monitor_tasks[site.id] = task
    log.info("started monitor for site %s (%s every %ss)", site.id, site.url, config.poll_interval_s)


async def stop_monitor(site_id: int) -> None:
    task = _monitor_tasks.pop(site_id, None)
    if task is None:
        return
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):  # noqa: BLE001
        pass
    log.info("stopped monitor for site %s", site_id)


def is_running(site_id: int) -> bool:
    task = _monitor_tasks.get(site_id)
    return task is not None and not task.done()


async def resume_all_monitors() -> None:
    db = session_scope()
    try:
        sites = list(db.query(MonitoredSite).filter(MonitoredSite.active.is_(True)).all())
    finally:
        db.close()
    for site in sites:
        start_monitor(site)
    if sites:
        log.info("resumed %d monitor(s) on startup", len(sites))


async def shutdown_all_monitors() -> None:
    for site_id in list(_monitor_tasks):
        await stop_monitor(site_id)
    for task in list(_pipeline_tasks):
        task.cancel()
    if _pipeline_tasks:
        await asyncio.gather(*_pipeline_tasks, return_exceptions=True)
    _pipeline_tasks.clear()
