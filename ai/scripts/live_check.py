"""Live smoke test against local Ollama: step timings, LLM JSON validity (m2-v2), quote verification.

Usage (from ai/):
  OLLAMA_URL=http://localhost:11434 OLLAMA_LLM_MODEL=bielik:latest \
    python scripts/live_check.py
Needs only Ollama (no Postgres/S3). Every post goes through M2 directly (schema check)
and through full routing.
"""

from __future__ import annotations

import asyncio
import logging
import sys
import time
from pathlib import Path

from rapidfuzz import fuzz

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.analysis import default_settings, run_modules  # noqa: E402
from app.embeddings import embed  # noqa: E402
from app.llm import OllamaClient  # noqa: E402
from app.main import load_config  # noqa: E402
from app.modules.m2 import run_m2  # noqa: E402
from app.preprocess.clean import clean_text  # noqa: E402
from app.preprocess.entity_match import Entity  # noqa: E402
from seed.seed_entities import load_rows  # noqa: E402

logging.basicConfig(level=logging.WARNING)

POSTS = {
    "legit_xtb": (
        "https://www.xtb.com/pl/blog/etf",
        "<html><body><article><h1>ETF-y z XTB</h1><p>XTB S.A. oferuje dostęp do ponad 5000 instrumentów. "
        "Otwórz konto w kilka minut.</p><p>Ostrzeżenie: inwestowanie wiąże się z ryzykiem. Możesz stracić "
        "część lub całość kapitału. Wyniki z przeszłości nie gwarantują wyników w przyszłości.</p>"
        "</article></body></html>",
    ),
    "scam": (
        "https://www.instagram.com/p/scam123/",
        "<html><body><article><h1>Gwarantowany zysk 30% miesięcznie!</h1><p>Bez ryzyka, zero strat. "
        "Wpłać 1000 zł, a w 30 dni odbierzesz 1300 zł. Platforma XTB potwierdza nasze wyniki, "
        "link w bio.</p><p>Zarabiaj już dziś, miejsc zostało tylko 5!</p></article></body></html>",
    ),
}


def out(msg: str) -> None:
    sys.stdout.write(msg + "\n")


async def main() -> int:
    config = load_config()
    llm_cfg = config["llm"]
    llm = OllamaClient(timeout_s=float(llm_cfg["timeout_s"]), retries=int(llm_cfg["retries"]))
    entities = [
        Entity(i, r["name"], tuple(r["aliases"]), r["is_authorized"], tuple(r["official_domains"]),
               tuple(r["social_handles"]))
        for i, r in enumerate(load_rows(), start=1)
    ]
    out(f"model={llm.model} url={llm.base_url}")
    t = time.monotonic()
    await llm.warmup()
    out(f"warmup: {time.monotonic() - t:.1f}s")
    bad = 0
    for name, (url, html) in POSTS.items():
        out(f"\n=== {name}")
        t = time.monotonic()
        text = clean_text(html)
        t_clean = time.monotonic() - t
        t = time.monotonic()
        vec = await embed(text)
        t_embed = time.monotonic() - t
        t = time.monotonic()
        m2 = await run_m2(llm, text)  # schema check: raises LLMInvalidResponse when JSON != M2Output
        t_m2 = time.monotonic() - t
        out(f"clean={t_clean * 1000:.0f}ms embed={t_embed * 1000:.0f}ms m2_llm={t_m2:.1f}s "
            f"prompt={m2.prompt_version} json=VALID")
        for o in m2.outputs:
            ratio = fuzz.partial_ratio(o.quote, text) if o.quote.strip() else None
            ok = ratio is not None and ratio >= 90
            note = "no quote (unclear)" if ratio is None else f"rapidfuzz={ratio:.0f}"
            bad += o.quote.strip() != "" and not ok
            out(f"  {o.criterion:22} {o.verdict:8} conf={o.confidence:.2f} {note}")
        t = time.monotonic()
        route, runs = await run_modules(
            llm, config, default_settings(config), text, url, None, entities, 0, vec
        )
        out(f"full pipeline: modules={route.modules} total={time.monotonic() - t:.1f}s")
        for r in runs:
            out(f"  M{r.module} score={r.score:.3f} llm={r.llm:.2f} rules={r.rules:.2f} "
                f"emb={r.emb} ms={r.ms}")
    await llm.aclose()
    out(f"\nquotes not found by rapidfuzz: {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
