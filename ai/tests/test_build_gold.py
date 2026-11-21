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


def test_build_writes_url_key_and_skips_pomin(tmp_path: Path) -> None:
    sheet, out = tmp_path / "s.csv", tmp_path / "g.csv"
    _write(sheet, [HEADER, ["1", "1", "t", "http://a", "1", "", ""], ["2", "2", "t", "http://b", "0", "", ""],
                   ["3", "3", "t", "http://c", "POMIN", "", ""], ["4", "3", "t", "http://d", "", "", ""]])
    assert build(sheet, out) == 2
    assert out.read_text().splitlines() == ["url,module,label", "http://a,1,1", "http://b,2,0"]


def test_conflicting_labels_raise(tmp_path: Path) -> None:
    sheet = tmp_path / "s.csv"
    _write(sheet, [HEADER, ["1", "1", "t", "http://a", "1", "", ""],
                   ["2", "1", "t", "http://a", "0", "", ""]])
    with pytest.raises(ValueError):
        build(sheet, tmp_path / "g.csv")
