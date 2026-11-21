"""M1 rule signal: registered firm mentioned by someone who is not that firm.

Pure function `match_entities` (no DB); `load_entities` fetches the rows. The score here is only the
rules part of the M1 score; LLM and embedding parts and the final score belong to ai-core.
"""
import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from functools import lru_cache
from typing import Any
from urllib.parse import urlparse

import asyncpg

log = logging.getLogger(__name__)

SHORT_ALIAS_MAX = 4  # aliases this short (IG, XM, XTB, ING) need exact case and an anchor nearby
INFLECTION_SUFFIX = 3  # max extra letters after a token (Polish case endings)
FUZZY_MIN_ALIAS_LEN = 6
FUZZY_RATIO = 0.88
ANCHOR_WINDOW = 200  # chars around a mention searched for promo anchors
QUOTE_MAX = 300

SOCIAL_HOSTS = {
    "instagram.com", "facebook.com", "fb.com", "tiktok.com", "youtube.com", "youtu.be",
    "x.com", "twitter.com", "linkedin.com", "t.me", "threads.net",
}

_ANCHOR_RE = re.compile(
    r"(?<!\w)(?:polecam\w*|polecan\w+|link w (?:bio|opisie)|kod\w* (?:rabatow\w+|promocyjn\w+|polecaj\w+)"
    r"|#reklama|#sponsored|#ad|wsp[oó]łprac\w+|sponsorowan\w+|reklam\w+|za[łl][oó]ż konto|otw[oó]rz konto"
    r"|zarejestruj się|bonus\w*|partner\w*|afiliac\w+)(?!\w)",
    re.IGNORECASE,
)
_WORD_RE = re.compile(r"\w+")
_SENTENCE_END = ".!?\n"


@dataclass(frozen=True)
class Entity:
    id: int
    name: str
    aliases: tuple[str, ...] = ()
    is_authorized: bool = False
    official_domains: tuple[str, ...] = ()
    social_handles: tuple[str, ...] = ()


@dataclass(frozen=True)
class M1Candidate:
    firm_entity_id: int
    firm_name: str
    matched_text: str
    quote: str  # exact substring of the input text
    anchors: tuple[str, ...]
    advertiser: str | None  # host (web) or handle (social); None when unknown
    advertiser_entity_id: int | None  # filled by ai-core
    url: str
    rules_score: float  # 0..1, rules part only
    official_channels_known: bool
    reasons: list[dict[str, Any]] = field(default_factory=list)  # contracts.md shape


async def load_entities(conn: asyncpg.Connection) -> list[Entity]:
    rows = await conn.fetch(
        "SELECT id, name, aliases, is_authorized, official_domains, social_handles FROM entities"
    )
    return [
        Entity(r["id"], r["name"], tuple(r["aliases"] or ()), r["is_authorized"],
               tuple(r["official_domains"] or ()), tuple(r["social_handles"] or ()))
        for r in rows
    ]


# --- publisher ---------------------------------------------------------------------------------

def _norm_domain(d: str) -> str:
    d = d.strip().lower()
    d = re.sub(r"^[a-z]+://", "", d)
    return d.split("/")[0].removeprefix("www.")


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def _is_host(host: str, domain: str) -> bool:
    return bool(domain) and (host == domain or host.endswith("." + domain))


def _norm_handle(handle: str | None) -> str | None:
    if not handle:
        return None
    h = handle.strip().split("?")[0].rstrip("/")
    h = h.rsplit("/", 1)[-1].lstrip("@").lower()
    return h or None


# --- mention search ----------------------------------------------------------------------------

@lru_cache(maxsize=4096)
def _alias_regex(alias: str) -> re.Pattern[str] | None:
    tokens = _WORD_RE.findall(alias)
    if not tokens:
        return None
    if len(tokens) == 1 and len(tokens[0]) <= SHORT_ALIAS_MAX:
        return re.compile(rf"(?<!\w){re.escape(tokens[0])}(?!\w)")  # case-sensitive
    parts = [
        re.escape(t) + (rf"\w{{0,{INFLECTION_SUFFIX}}}" if len(t) >= 4 else "") for t in tokens
    ]
    return re.compile(r"(?<!\w)" + r"\W+".join(parts) + r"(?!\w)", re.IGNORECASE)


def _is_short(alias: str) -> bool:
    tokens = _WORD_RE.findall(alias)
    return len(tokens) == 1 and len(tokens[0]) <= SHORT_ALIAS_MAX


def _fuzzy_spans(alias: str, words: list[re.Match[str]]) -> list[tuple[int, int]]:
    tokens = _WORD_RE.findall(alias.lower())
    n = len(tokens)
    target = " ".join(tokens)
    spans: list[tuple[int, int]] = []
    for i in range(len(words) - n + 1):
        cand = " ".join(w.group().lower() for w in words[i : i + n])
        if cand[:1] != target[:1] or abs(len(cand) - len(target)) > 2:
            continue
        sm = SequenceMatcher(None, cand, target)
        if min(sm.real_quick_ratio(), sm.quick_ratio(), sm.ratio()) >= FUZZY_RATIO:
            spans.append((words[i].start(), words[i + n - 1].end()))
    return spans


def _mentions(text: str, entity: Entity, words: list[re.Match[str]]) -> list[tuple[int, int, bool]]:
    """(start, end, needs_anchor) for each mention of the entity, de-overlapped."""
    found: list[tuple[int, int, bool]] = []
    for alias in dict.fromkeys((entity.name, *entity.aliases)):
        rx = _alias_regex(alias)
        if rx is None:
            continue
        short = _is_short(alias)
        found += [(m.start(), m.end(), short) for m in rx.finditer(text)]
        if not short and len(alias) >= FUZZY_MIN_ALIAS_LEN:
            found += [(s, e, False) for s, e in _fuzzy_spans(alias, words)]
    found.sort()
    out: list[tuple[int, int, bool]] = []
    for s, e, needs in found:
        if out and s < out[-1][1]:
            continue
        out.append((s, e, needs))
    return out


def _quote_span(text: str, start: int, end: int) -> tuple[int, int]:
    a = max((text.rfind(c, 0, start) for c in _SENTENCE_END), default=-1) + 1
    ends = [i for c in _SENTENCE_END if (i := text.find(c, end)) != -1]
    b = min(ends) + 1 if ends else len(text)
    a, b = max(a, start - 100), min(b, max(end + 200, start + 1))
    if b - a > QUOTE_MAX:
        b = a + QUOTE_MAX
    while a < start and text[a].isspace():
        a += 1
    while b > end and text[b - 1].isspace():
        b -= 1
    return a, b


# --- main --------------------------------------------------------------------------------------

def match_entities(
    text: str,
    url: str,
    author_handle: str | None,
    entities: Sequence[Entity],
    document_id: int | None = None,
) -> list[M1Candidate]:
    """One candidate per registered firm mentioned in `text` by a publisher that is not that firm."""
    host = _host(url)
    social = host in SOCIAL_HOSTS
    handle = _norm_handle(author_handle)
    advertiser = (handle if social else host) or None
    words = list(_WORD_RE.finditer(text))
    candidates: list[M1Candidate] = []

    for ent in entities:
        if not ent.is_authorized:
            continue
        domains = [_norm_domain(d) for d in ent.official_domains]
        handles = {_norm_handle(h) for h in ent.social_handles}
        if (handle and handle in handles) or (not social and any(_is_host(host, d) for d in domains)):
            continue  # publisher is the firm itself: M2 territory
        channels_known = bool(handles - {None}) if social else bool(domains)

        best: tuple[int, int, int, list[str]] | None = None  # start, end, anchor count, anchors
        for s, e, needs_anchor in _mentions(text, ent, words):
            window = text[max(0, s - ANCHOR_WINDOW) : e + ANCHOR_WINDOW]
            anchors = [m.group() for m in _ANCHOR_RE.finditer(window)]
            if needs_anchor and not anchors:
                continue
            if best is None or len(anchors) > best[2]:
                best = (s, e, len(anchors), anchors)
        if best is None:
            continue

        s, e, _, anchors = best
        a, b = _quote_span(text, s, e)
        quote = text[a:b]
        publisher_part = 0.2 if advertiser and channels_known else 0.1 if advertiser else 0.0
        score = 0.4 + (0.3 if anchors else 0.0) + publisher_part
        reasons: list[dict[str, Any]] = [
            {"criterion": "firm_mentioned", "verdict": "detected", "quote": text[s:e], "weight": 0.4},
        ]
        if anchors:
            reasons.append(
                {"criterion": "promo_anchor", "verdict": "detected", "quote": anchors[0], "weight": 0.3}
            )
        reasons.append(
            {"criterion": "publisher_not_official", "verdict": "detected" if channels_known else "unverified",
             "quote": quote, "weight": publisher_part}
        )
        candidates.append(
            M1Candidate(ent.id, ent.name, text[s:e], quote, tuple(anchors), advertiser, None, url,
                        round(score, 2), channels_known, reasons)
        )

    log.info("m1 match document_id=%s url=%s candidates=%d", document_id, url, len(candidates))
    return candidates
