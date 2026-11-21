"""Module routing: which of M1/M2/M3 apply to a document."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from urllib.parse import urlparse

from app.preprocess.entity_match import Entity, match_entities
from app.preprocess.entity_match import M1Candidate as M1Match

_ADVISORY = re.compile(
    r"doradz\w+|doradc\w+|rekomendacj\w+|zarządzam\w* (?:portfel|kapitał|aktyw)\w*|"
    r"prowadzę (?:twoj\w+ )?portfel\w*|sygnał\w* (?:inwestycyjn|handlow)\w*|kupuj|sprzedaj|"
    r"polecam (?:kupić|sprzedać|inwestować)",
    re.IGNORECASE,
)


@dataclass
class Route:
    modules: list[int] = field(default_factory=list)
    official_entity_id: int | None = None  # firm that published the document (M2)
    m1_candidates: list[M1Match] = field(default_factory=list)


def _host(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host.removeprefix("www.")


def _publisher_firm(url: str, author_handle: str | None, entities: Sequence[Entity]) -> Entity | None:
    host = _host(url)
    handle = (author_handle or "").strip().lower().lstrip("@")
    for e in entities:
        if not e.is_authorized:
            continue
        for d in e.official_domains:
            d = d.strip().lower().removeprefix("www.")
            if d and host and (host == d or host.endswith("." + d)):
                return e
        if handle and handle in {h.strip().lower().lstrip("@") for h in e.social_handles}:
            return e
    return None


def route_document(
    text: str, url: str, author_handle: str | None, entities: Sequence[Entity], document_id: int
) -> Route:
    route = Route()
    firm = _publisher_firm(url, author_handle, entities)
    if firm is not None:
        route.modules.append(2)
        route.official_entity_id = firm.id
    route.m1_candidates = match_entities(text, url, author_handle, entities, document_id)
    if route.m1_candidates:
        route.modules.append(1)
    elif firm is None and _ADVISORY.search(text):
        route.modules.append(3)
    return route
