"""The ONLY module that talks to the AI platform.

Why it exists (platform constraints from the challenge):
  * 20 requests/minute, 2 concurrent  -> semaphore + sliding-window rate limiter
  * "avoid regenerating an answer already obtained" -> response cache
  * larger model can be slow/unavailable -> large -> compact fallback + circuit breaker
  * the user must know what is happening -> every result carries metadata
    (model used, fallback?, cached?) and the gateway exposes live queue numbers.
"""
import asyncio
import hashlib
import json
import time
from collections import deque
from dataclasses import dataclass

import config
import mock_llm


class GatewayError(Exception):
    """The AI could not answer (after retries and fallback)."""


class QueueTimeout(GatewayError):
    """Waited too long for a free request slot."""


@dataclass
class LLMResult:
    text: str
    model: str
    tier: str
    requested_tier: str
    fallback: bool = False
    cached: bool = False
    reason: str | None = None

    def meta(self) -> dict:
        return {"model": self.model, "tier": self.tier, "requested_tier": self.requested_tier,
                "fallback": self.fallback, "cached": self.cached, "reason": self.reason}


def _transient(e: Exception) -> bool:
    status = getattr(e, "status_code", None)
    if status in (408, 409, 429, 500, 502, 503, 504):
        return True
    if isinstance(e, (asyncio.TimeoutError, TimeoutError, ConnectionError, QueueTimeout)):
        return True
    return type(e).__name__ in {"APITimeoutError", "APIConnectionError", "RateLimitError",
                                "InternalServerError"}


def _describe(e: Exception) -> str:
    return f"{type(e).__name__}: {str(e)[:120]}"


class Gateway:
    def __init__(self, rate=None, window_s=60.0, concurrent=None, mock=None, breaker_s=30.0,
                 models=None):
        self.rate = rate or config.RATE_PER_MINUTE
        self.window_s = window_s
        self.mock = config.MOCK_LLM if mock is None else mock
        self.models = models or {"compact": config.MODEL_COMPACT, "large": config.MODEL_LARGE}
        self.breaker_s = breaker_s
        self._sem = asyncio.Semaphore(concurrent or config.MAX_CONCURRENT)
        self._times: deque = deque()
        self._lock = asyncio.Lock()
        self._cache: dict[str, LLMResult] = {}
        self._client = None
        self.queued = 0
        self.in_flight = 0
        self.max_in_flight_seen = 0
        self.large_blocked_until = 0.0
        self.stats = {"calls": 0, "cache_hits": 0, "fallbacks": 0, "errors": 0}

    # ---------- public ----------
    def snapshot(self) -> dict:
        now = time.monotonic()
        used = sum(1 for t in self._times if now - t < self.window_s)
        return {"queued": self.queued, "in_flight": self.in_flight, "used_last_minute": used,
                "limit_per_minute": self.rate, "large_available": now >= self.large_blocked_until,
                "mock": self.mock, "models": self.models, **self.stats}

    async def ask(self, task: str, messages: list, tier: str = "compact",
                  temperature: float = 0.4, max_tokens: int = 600, cache: bool = True) -> LLMResult:
        key = hashlib.sha256(json.dumps([task, tier, temperature, max_tokens, messages],
                                        ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        if cache and key in self._cache:
            self.stats["cache_hits"] += 1
            r = self._cache[key]
            return LLMResult(r.text, r.model, r.tier, tier, r.fallback, True, r.reason)

        order = ["large", "compact"] if tier == "large" else ["compact"]
        reason = None
        for t in order:
            if t == "large" and time.monotonic() < self.large_blocked_until:
                reason = "large model temporarily unavailable"
                continue
            try:
                text = await self._call(task, t, messages, temperature, max_tokens)
            except Exception as e:  # noqa: BLE001 - we want to fall back on anything
                self.stats["errors"] += 1
                reason = f"{t}: {_describe(e)}"
                if t == "large" and _transient(e):
                    self.large_blocked_until = time.monotonic() + self.breaker_s
                continue
            res = LLMResult(text, self.models[t], t, tier, fallback=(t != tier),
                            reason=reason if t != tier else None)
            if res.fallback:
                self.stats["fallbacks"] += 1
            elif cache:  # never cache a degraded answer: next time the large model may be back
                self._cache[key] = res
            return res
        raise GatewayError(reason or "no model available")

    # ---------- internals ----------
    async def _call(self, task, tier, messages, temperature, max_tokens) -> str:
        attempts = 2 if tier == "compact" else 1
        for i in range(attempts):
            try:
                return await self._call_once(task, tier, messages, temperature, max_tokens)
            except Exception as e:  # noqa: BLE001
                if i + 1 < attempts and _transient(e) and not isinstance(e, QueueTimeout):
                    await asyncio.sleep(1.5)
                    continue
                raise
        raise GatewayError("unreachable")

    async def _call_once(self, task, tier, messages, temperature, max_tokens) -> str:
        waiting = True
        self.queued += 1
        try:
            async with self._sem:
                self.queued -= 1
                waiting = False
                self.in_flight += 1
                self.max_in_flight_seen = max(self.max_in_flight_seen, self.in_flight)
                try:
                    await self._acquire_rate_slot(max_wait=25 if tier == "large" else 90)
                    self.stats["calls"] += 1
                    timeout = config.LARGE_TIMEOUT_S if tier == "large" else config.COMPACT_TIMEOUT_S
                    text = await asyncio.wait_for(self._request(task, tier, messages, temperature, max_tokens),
                                                  timeout=timeout)
                    if not text or not text.strip():
                        raise ValueError("empty response from the model")
                    return text
                finally:
                    self.in_flight -= 1
        finally:
            if waiting:
                self.queued -= 1

    async def _acquire_rate_slot(self, max_wait: float):
        start = time.monotonic()
        while True:
            async with self._lock:
                now = time.monotonic()
                while self._times and now - self._times[0] >= self.window_s:
                    self._times.popleft()
                if len(self._times) < self.rate:
                    self._times.append(now)
                    return
                wait = self.window_s - (now - self._times[0])
            if time.monotonic() - start + wait > max_wait:
                raise QueueTimeout("rate limit: no free request slot soon enough")
            await asyncio.sleep(min(wait, 1.0) + 0.05)

    async def _request(self, task, tier, messages, temperature, max_tokens) -> str:
        if self.mock:
            return await mock_llm.mock_reply(task, tier, messages)
        client = self._get_client()
        r = await client.chat.completions.create(model=self.models[tier], messages=messages,
                                                 temperature=temperature, max_tokens=max_tokens)
        return r.choices[0].message.content or ""

    def _get_client(self):
        if self._client is None:
            if not config.BASE_URL or not config.API_KEY:
                raise GatewayError("LLM_BASE_URL / LLM_API_KEY are missing: fill your .env "
                                   "(see .env.example) or run with MOCK_LLM=1")
            from openai import AsyncOpenAI  # imported lazily so mock mode needs no package
            self._client = AsyncOpenAI(base_url=config.BASE_URL, api_key=config.API_KEY, max_retries=0)
        return self._client
