"""Small checks of the calculations, using hand-made data."""

import numpy as np
import pandas as pd
import pytest

from forecast_lab.config import RetailConfig
from forecast_lab.evaluation import add_intervals, summarize
from forecast_lab.inventory import stock_targets


def _forecasts(errors_by_cutoff: dict[str, list[float]], yhat: float = 10.0) -> pd.DataFrame:
    """One product, one model; each cutoff has len(errors) forecast days."""
    rows = []
    for cutoff, errors in errors_by_cutoff.items():
        c = pd.Timestamp(cutoff)
        for day, e in enumerate(errors, start=1):
            rows.append(
                {"unique_id": "A", "model": "M", "cutoff": c, "ds": c + pd.Timedelta(days=day),
                 "yhat": yhat, "y": yhat + e, "error": e}
            )
    return pd.DataFrame(rows)


def test_intervals_use_only_earlier_errors():
    cfg = RetailConfig(calibration_windows=1, levels=(80,))
    long = _forecasts({"2020-01-01": [-2, -1, 0, 1, 2], "2020-01-06": [100, 100, 100, 100, 100]})
    fc = add_intervals(long, cfg)
    # Only the second cutoff is scored, and its range comes from the first cutoff's errors.
    assert fc["cutoff"].nunique() == 1
    assert fc["lo_80"].iloc[0] == pytest.approx(10 + np.quantile([-2, -1, 0, 1, 2], 0.1))
    assert fc["hi_80"].iloc[0] == pytest.approx(10 + np.quantile([-2, -1, 0, 1, 2], 0.9))


def test_summary_metrics():
    fc = _forecasts({"2020-01-01": [2, -2]})
    fc[["lo_80", "hi_80"]] = [[9, 13], [9, 13]]  # actuals are 12 and 8
    m = summarize(fc, pd.Series({"A": 2.0}), levels=(80,)).iloc[0]
    assert m["wape"] == pytest.approx(4 / 20)
    assert m["mase"] == pytest.approx(1.0)
    assert m["bias"] == pytest.approx(0.0)
    assert m["coverage_80"] == pytest.approx(0.5)


def test_stock_target_formula():
    cfg = RetailConfig(lead_time_days=4, service_level=0.95)
    fc = _forecasts({"2020-01-01": [0] * 7}, yhat=5.0).assign(sigma=2.0)
    prices = pd.DataFrame({"unique_id": ["A"], "ds": [pd.Timestamp("2020-01-01")], "sell_price": [3.0]})
    t = stock_targets(fc, prices, cfg).iloc[0]
    # 4 days x 5 units, plus 1.645 x 2 x sqrt(4) = 6.58 safety stock -> 26.58, rounded up to 27.
    assert t["expected_demand"] == pytest.approx(20)
    assert t["safety_stock"] == pytest.approx(1.6449 * 2 * 2, rel=1e-3)
    assert t["target_stock"] == 27
    assert not t["stockout"]
