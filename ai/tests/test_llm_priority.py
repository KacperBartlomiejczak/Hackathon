import asyncio
import json

import httpx

from app.llm import OllamaClient, _PrioritySlots, background_priority


def test_interactive_waiter_beats_earlier_background_waiter() -> None:
    order: list[str] = []
    gate = asyncio.Event

    async def run() -> None:
        release = gate()

        async def handler(req: httpx.Request) -> httpx.Response:
            tag = json.loads(req.content)["messages"][1]["content"]
            order.append(tag.split("\n")[1])
            if "holder" in tag:
                await release.wait()
            return httpx.Response(200, json={"message": {"content": '{"verdict":"a","score":1}'}})

        from pydantic import BaseModel

        class Out(BaseModel):
            verdict: str
            score: float

        client = OllamaClient(base_url="http://ollama.test", model="m",
                              transport=httpx.MockTransport(handler), backoff_s=0, max_concurrency=1)

        async def bg() -> None:
            with background_priority():
                await client.generate("s", "background", Out)

        holder = asyncio.create_task(client.generate("s", "holder", Out))
        await asyncio.sleep(0.05)
        t_bg = asyncio.create_task(bg())
        await asyncio.sleep(0.05)
        t_fg = asyncio.create_task(client.generate("s", "interactive", Out))
        await asyncio.sleep(0.05)
        release.set()
        await asyncio.gather(holder, t_bg, t_fg)

    asyncio.run(run())
    assert order == ["holder", "interactive", "background"]


def test_cancelled_waiter_does_not_leak_slot() -> None:
    async def run() -> None:
        slots = _PrioritySlots(1)
        await slots.acquire(0)
        waiter = asyncio.create_task(slots.acquire(0))
        await asyncio.sleep(0)
        waiter.cancel()
        try:
            await waiter
        except asyncio.CancelledError:
            pass
        slots.release()
        await asyncio.wait_for(slots.acquire(0), timeout=1)  # would hang if the slot leaked

    asyncio.run(run())


def test_cancel_after_handoff_passes_slot_on() -> None:
    async def run() -> None:
        slots = _PrioritySlots(1)
        await slots.acquire(0)
        w1 = asyncio.create_task(slots.acquire(0))
        w2 = asyncio.create_task(slots.acquire(1))
        await asyncio.sleep(0)
        slots.release()  # hands slot to w1 (future done) ...
        w1.cancel()  # ... but w1 is cancelled before it resumes
        try:
            await w1
        except asyncio.CancelledError:
            pass
        await asyncio.wait_for(w2, timeout=1)

    asyncio.run(run())


def test_num_predict_in_options() -> None:
    seen: dict = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen.update(json.loads(req.content))
        return httpx.Response(200, json={"message": {"content": '{"verdict":"a","score":1}'}})

    from pydantic import BaseModel

    class Out(BaseModel):
        verdict: str
        score: float

    client = OllamaClient(base_url="http://ollama.test", model="m",
                          transport=httpx.MockTransport(handler), num_predict=512)
    asyncio.run(client.generate("s", "d", Out))
    assert seen["options"] == {"temperature": 0, "num_predict": 512}
