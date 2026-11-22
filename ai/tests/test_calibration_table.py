import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))

from calibration_table import render

from app.eval import compute_metrics


def test_render_one_table_per_module_with_rows() -> None:
    gold = {1: True, 2: False}
    results = [compute_metrics(2, t, gold, {1: 0.8, 2: 0.4}) for t in (0.5, 0.9)]
    out = render(results)
    assert "## M2 (gold rows: 2, without finding: 0)" in out
    assert "## M1" not in out
    assert "| 0.5 | 1 | 0 | 0 | 1 | 1.00 | 1.00 |" in out
    assert "| 0.9 | 0 | 0 | 1 | 1 | 0.00 | 0.00 |" in out
