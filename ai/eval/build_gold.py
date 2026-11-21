"""Build ai/eval/gold.csv (url,module,label) from the hand-labelled sheet.

Usage (from repo root):
  python ai/eval/build_gold.py            # writes ai/eval/gold.csv

Sheet rows labelled 0 or 1 become gold rows; POMIN and empty labels are skipped.
/eval joins gold rows to documents by sha256(url), so no database export is needed.
"""
import argparse
import csv
import logging
import sys
from pathlib import Path

log = logging.getLogger("build_gold")
HERE = Path(__file__).resolve().parent


def build(sheet: Path, out: Path) -> int:
    gold: dict[tuple[str, int], str] = {}
    with sheet.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            label = row["etykieta (1 lub 0)"].strip()
            if label not in ("0", "1"):
                continue
            key = (row["url"].strip(), int(row["modul"]))
            if gold.setdefault(key, label) != label:
                raise ValueError(f"conflicting labels for {key[0]}, module {key[1]}")
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["url", "module", "label"])
        w.writerows((u, m, lab) for (u, m), lab in sorted(gold.items(), key=lambda kv: (kv[0][1], kv[0][0])))
    return len(gold)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sheet", type=Path, default=HERE / "label_sheet.csv")
    p.add_argument("--out", type=Path, default=HERE / "gold.csv")
    a = p.parse_args()
    n = build(a.sheet, a.out)
    log.info("wrote %d gold rows to %s", n, a.out)
    return 0 if n else 1


if __name__ == "__main__":
    sys.exit(main())
