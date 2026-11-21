import csv
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))

from build_gold import build

HEADER = ["nr", "modul", "typ", "url", "etykieta (1 lub 0)", "reguly", "notatka"]


def _write(path: Path, rows: list[list[str]], delimiter: str = ";") -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        csv.writer(f, delimiter=delimiter).writerows(rows)


def test_build_maps_urls_and_skips_pomin_and_missing(tmp_path: Path) -> None:
    sheet, docs, out = tmp_path / "s.csv", tmp_path / "d.csv", tmp_path / "g.csv"
    _write(sheet, [HEADER, ["1", "1", "t", "http://a", "1", "", ""], ["2", "2", "t", "http://b", "0", "", ""],
                   ["3", "3", "t", "http://c", "POMIN", "", ""], ["4", "3", "t", "http://d", "1", "", ""]])
    _write(docs, [["id", "url"], ["10", "http://a"], ["11", "http://b"], ["12", "http://c"]], delimiter=",")
    n, missing = build(sheet, docs, out)
    assert n == 2 and missing == ["http://d"]
    assert out.read_text().splitlines() == ["document_id,module,label", "10,1,1", "11,2,0"]


def test_conflicting_labels_raise(tmp_path: Path) -> None:
    sheet, docs = tmp_path / "s.csv", tmp_path / "d.csv"
    _write(sheet, [HEADER, ["1", "1", "t", "http://a", "1", "", ""], ["2", "1", "t", "http://a", "0", "", ""]])
    _write(docs, [["id", "url"], ["10", "http://a"]], delimiter=",")
    with pytest.raises(ValueError):
        build(sheet, docs, tmp_path / "g.csv")
