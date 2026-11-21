import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.eval import GOLD_PATH, compute_metrics, evaluate, load_gold, parse_module


def test_metrics_and_threshold_moves_fp_fn() -> None:
    gold = {1: True, 2: True, 3: False, 4: False}
    scores = {1: 0.9, 2: 0.5, 3: 0.7}  # doc 4 has no finding
    r = compute_metrics(1, 0.6, gold, scores)
    assert (r.tp, r.fp, r.fn, r.tn) == (1, 1, 1, 1)
    assert r.precision == 0.5 and r.recall == 0.5 and r.missing_findings == 1
    low = compute_metrics(1, 0.4, gold, scores)
    high = compute_metrics(1, 0.95, gold, scores)
    assert (low.fp, low.fn) == (1, 0) and (high.fp, high.fn) == (0, 2)


def test_zero_division() -> None:
    assert compute_metrics(1, 0.5, {}, {}).precision == 0.0
    r = compute_metrics(1, 0.99, {1: True}, {1: 0.5})
    assert r.precision == 0.0 and r.recall == 0.0


def test_parse_module() -> None:
    assert parse_module("M2") == parse_module("2") == parse_module(2) == 2
    with pytest.raises(ValueError):
        parse_module("M4")


def test_load_gold(tmp_path: Path) -> None:
    f = tmp_path / "gold.csv"
    f.write_text("document_id,module,label\n1,M1,1\n2,M1,0\n3,M2,1\n1,M1,1\n")
    assert load_gold(1, f) == {1: True, 2: False}
    f.write_text("document_id,module,label\n1,M1,1\n1,M1,0\n")
    with pytest.raises(ValueError):
        load_gold(1, f)
    f.write_text("document_id,module,label\n1,M1,yes\n")
    with pytest.raises(ValueError):
        load_gold(1, f)


def test_load_gold_missing_and_header_only(tmp_path: Path) -> None:
    assert load_gold(1, tmp_path / "nope.csv") == {}
    assert GOLD_PATH.exists()  # committed header-only file


@pytest.mark.asyncio
async def test_evaluate_from_db(conn, tmp_path: Path) -> None:
    f = tmp_path / "gold.csv"
    f.write_text("document_id,module,label\n1,M2,1\n2,M2,0\n3,M2,1\n9,M1,1\n")
    for i in (1, 2, 3):
        await conn.execute("INSERT INTO documents (url, url_hash) VALUES ($1,$1)", f"u{i}")
    for doc, score in [(1, 0.9), (1, 0.3), (2, 0.7)]:  # doc 1 has two findings: max counts
        await conn.execute(
            "INSERT INTO findings (document_id, module, score, risk_level, label, reasons, model, prompt_version) "
            "VALUES ($1, 2, $2, 'low', 'x', '[]', 'm', 'v')", doc, score,
        )
    r = await evaluate(conn, "M2", 0.6, f)
    assert (r.tp, r.fp, r.fn, r.tn, r.missing_findings) == (1, 1, 1, 0, 1)
    assert (await evaluate(conn, "M3", 0.6, f)).total == 0
    with pytest.raises(ValueError):
        await evaluate(conn, "M2", 1.5, f)


def test_metrics_hand_computed() -> None:
    gold = {i: i <= 4 for i in range(1, 11)}  # docs 1-4 positive, 5-10 negative
    scores = {1: 0.9, 2: 0.8, 3: 0.4, 4: 0.2, 5: 0.7, 6: 0.6, 7: 0.3, 8: 0.1, 9: 0.05}  # doc 10 missing
    r = compute_metrics(2, 0.35, gold, scores)
    assert (r.tp, r.fp, r.fn, r.tn) == (3, 2, 1, 4)
    assert r.precision == pytest.approx(0.6) and r.recall == pytest.approx(0.75)
    assert r.total == 10 and r.missing_findings == 1
