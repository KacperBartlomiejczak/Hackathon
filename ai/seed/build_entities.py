"""One-off converter: KNF register dumps (ai/seed/raw/) -> ai/seed/entities.csv.

Run from repo root: python3 ai/seed/build_entities.py
Only stdlib. Aliases are `|`-separated, like official_domains and social_handles.
"""
import csv
import json
import logging
import re
from pathlib import Path

log = logging.getLogger("build_entities")

SEED = Path(__file__).parent
RAW = SEED / "raw"
OUT = SEED / "entities.csv"
COLUMNS = [
    "name", "aliases", "type", "is_authorized", "register_ref", "nip", "official_domains", "social_handles",
]
TYPES = {"investment_firm", "foreign_firm", "advertiser", "finfluencer", "advisory_unlicensed", "unknown"}

LEGAL = (
    r"(?:S\.A\.|SP\. Z O\.O\.|Sp\. z o\.o\.|S\.A|Ltd\.?|LTD|GmbH|B\.V\.|UAB|AS|ASA|a\.s\.|AG|PLC|Plc"
    r"|S\.L\.U\.|N\.V\.|S\.r\.l\.|SE)"
)
SPLIT = re.compile(rf"({LEGAL})\s+(?=\S)")
STRIP = re.compile(rf"[\s,]+{LEGAL}$")
PREFIX = re.compile(r"^(DOM MAKLERSKI|Dom Maklerski|DOM INWESTYCYJNY|Dom Inwestycyjny)\s+", re.IGNORECASE)
SUFFIX = re.compile(r"\s+(Biuro Maklerskie|Departament Maklerski)$", re.IGNORECASE)


def split_names(raw: str) -> list[str]:
    """Register often glues former/alternative names into one string; cut after each legal-form suffix."""
    return [p.strip() for p in SPLIT.sub(r"\1\n", raw).split("\n") if p.strip()]


def variants(part: str) -> list[str]:
    out = [part]
    short = STRIP.sub("", part).strip()
    out.append(short)
    nopref = PREFIX.sub("", short)
    if nopref != short:
        out.append(nopref)
        out.append("DM " + nopref)
    nosuf = SUFFIX.sub("", short)
    if nosuf != short:
        out.append(nosuf)
    return out


def dedupe(items: list[str], skip: str = "") -> list[str]:
    seen, res = {skip.lower()}, []
    for i in items:
        i = i.strip()
        if len(i) >= 2 and i.count("(") == i.count(")") and "|" not in i and i.lower() not in seen:
            seen.add(i.lower())
            res.append(i)
    return res


def match(overrides: dict, raw_name: str) -> dict | None:
    for key, val in overrides.items():
        if key.lower() in raw_name.lower():
            return val
    return None


def load(name: str) -> list[dict]:
    return json.loads((RAW / name).read_text(encoding="utf-8"))


def build_row(raw_name: str, typ: str, ref: str, ov: dict | None) -> list[str]:
    parts = split_names(raw_name)
    name = ov["name"] if ov else parts[0]
    aliases = [v for p in parts for v in variants(p)]
    if ov:
        aliases = ov["aliases"] + aliases
    domains = ov["domains"] if ov else []
    return [name, "|".join(dedupe(aliases, skip=name)), typ, "true", ref, "", "|".join(domains), ""]


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ov = json.loads((RAW / "overrides.json").read_text(encoding="utf-8"))
    rows: list[list[str]] = []

    for fname, ref in [
        ("knf_domy_maklerskie.json", "KNF:domy_maklerskie"),
        ("knf_banki.json", "KNF:banki_maklerskie"),
    ]:
        for r in load(fname):
            raw = " ".join(r["names"])
            o = match(ov["domestic"], raw)
            if not o:
                log.warning("no override for domestic firm: %s", raw)
            rows.append(build_row(raw, "investment_firm", ref, o))

    seen = set()
    for fname, ref, take_all in [("knf_oddzialy.json", "KNF:notyfikacje_oddzialy", True),
                                  ("knf_zagraniczne.json", "KNF:notyfikacje_bez_oddzialu", False)]:
        for r in load(fname):
            raw = r["Nazwa podmiotu"]
            o = match(ov["foreign"], raw)
            if not o and not take_all:
                continue
            row = build_row(raw, "foreign_firm", ref, o)
            if row[0] in seen:
                continue
            seen.add(row[0])
            rows.append(row)

    used = {row[0] for row in rows}
    for key, o in ov["foreign"].items():
        if o["name"] not in used:
            log.warning("foreign override matched nothing in register: %s", key)

    names = [r[0] for r in rows]
    assert len(names) == len(set(names)), "duplicate names"
    assert all(r[2] in TYPES and len(r) == len(COLUMNS) for r in rows)

    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        w.writerows(rows)
    log.info("wrote %d rows to %s (%d without domain)", len(rows), OUT, sum(1 for r in rows if not r[6]))


if __name__ == "__main__":
    main()
