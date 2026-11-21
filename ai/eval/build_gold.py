"""Build ai/eval/gold.csv from the hand-labelled sheet and an export of the `documents` table.

Usage (from repo root):
  docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
    "COPY (SELECT id, url FROM documents) TO STDOUT WITH CSV HEADER"' > ai/eval/documents.csv
  python ai/eval/build_gold.py            # writes ai/eval/gold.csv

Sheet rows labelled 0 or 1 become gold rows; POMIN and empty labels are skipped.
Rows whose URL is not in the documents export are listed and skipped (not crawled yet).
"""
import argparse
import csv
import logging
import sys
from pathlib import Path

log = logging.getLogger("build_gold")
HERE = Path(__file__).resolve().parent


def build(sheet: Path, documents: Path, out: Path) -> tuple[int, list[str]]:
    with documents.open(encoding="utf-8-sig", newline="") as f:
        ids = {row["url"]: int(row["id"]) for row in csv.DictReader(f)}
    gold: dict[tuple[int, int], str] = {}
    missing: list[str] = []
    with sheet.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            label = row["etykieta (1 lub 0)"].strip()
            if label not in ("0", "1"):
                continue
            doc_id = ids.get(row["url"].strip())
            if doc_id is None:
                missing.append(row["url"])
                continue
            key = (doc_id, int(row["modul"]))
            if gold.setdefault(key, label) != label:
                raise ValueError(f"conflicting labels for document {doc_id}, module {key[1]}")
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["document_id", "module", "label"])
        w.writerows((d, m, lab) for (d, m), lab in sorted(gold.items(), key=lambda kv: (kv[0][1], kv[0][0])))
    return len(gold), missing


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sheet", type=Path, default=HERE / "label_sheet.csv")
    p.add_argument("--documents", type=Path, default=HERE / "documents.csv")
    p.add_argument("--out", type=Path, default=HERE / "gold.csv")
    a = p.parse_args()
    n, missing = build(a.sheet, a.documents, a.out)
    log.info("wrote %d gold rows to %s", n, a.out)
    for url in missing:
        log.warning("not in documents (not crawled yet): %s", url)
    return 0 if n else 1


if __name__ == "__main__":
    sys.exit(main())
