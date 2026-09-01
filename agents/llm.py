"""
Thin LLM wrapper shared by all four agents.

Design decision (documented for judges): every agent calls a real model
(Claude) when ANTHROPIC_API_KEY is present in the environment. If it's not
set — e.g. running offline at a venue with bad wifi — each agent falls back
to a deterministic rule-based responder so the *pipeline* never breaks mid-demo.
The fallback still produces the same typed Pydantic output, it's just not
LLM-authored. Toggle is automatic; no code change needed to switch a laptop
between "live AI" and "offline fallback" mode.
"""
from __future__ import annotations

import json
import os
from typing import Any

_client = None
_MODEL = os.environ.get("CRISIS_ROOM_MODEL", "claude-sonnet-4-6")


def _get_client():
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    try:
        import anthropic

        _client = anthropic.Anthropic(api_key=api_key)
        return _client
    except ImportError:
        return None


def llm_available() -> bool:
    return _get_client() is not None


def structured_completion(system_prompt: str, user_prompt: str, max_tokens: int = 1000) -> dict[str, Any] | None:
    """Ask Claude for JSON-only output. Returns None if no API key is set or
    the call/parsing fails, so callers can fall back cleanly."""
    client = _get_client()
    if client is None:
        return None
    try:
        response = client.messages.create(
            model=_MODEL,
            max_tokens=max_tokens,
            system=system_prompt
            + "\n\nRespond with ONLY a single valid JSON object. No markdown fences, no preamble, no commentary.",
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = "".join(block.text for block in response.content if block.type == "text").strip()
        text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(text)
    except Exception:
        return None
