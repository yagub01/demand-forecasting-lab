"""Small checks of the calculations, using hand-made data."""

import numpy as np
import pandas as pd
import pytest

from forecast_lab.config import RetailConfig
from forecast_lab.data_m5 import _event_features
from forecast_lab.evaluation import add_ensemble, add_intervals, choose_ensemble, summarize
from forecast_lab.inventory import stock_targets
from forecast_lab.models import days_since_sale


def test_days_since_sale():
    x = np.array([np.nan, 0, 2, 0, 0, 1, 0.0])
    np.testing.assert_array_equal(days_since_sale(x), [np.nan, np.nan, 0, 1, 2, 0, 1])


def test_event_features_count_down_and_up():
    ds = pd.date_range("2020-01-01", periods=6)
    cal = pd.DataFrame({"ds": ds, "event_name_1": [None, None, "X", None, None, None],
                        "event_type_1": [None, None, "National", None, None, None]})
    f = _event_features(cal, max_days=2)
    assert f["days_to_event"].tolist() == [2, 1, 0, 3, 3, 3]
    assert f["next_event"].tolist() == ["X", "X", "X", "none", "none", "none"]
    assert f["days_since_event"].tolist() == [3, 3, 0, 1, 2, 3]
    assert f["prev_event"].tolist() == ["none", "none", "X", "X", "X", "none"]


def test_ensemble_chosen_on_calibration_only():
    cfg = RetailConfig(calibration_windows=1, ensemble_size=1)
    rows = []
    # Model A is better in the first (calibration) period, model B in the second (test) period.
    for cutoff, err_a, err_b in [("2020-01-01", 1, 5), ("2020-02-01", 5, 1)]:
        for model, err in [("A", err_a), ("B", err_b)]:
            rows.append({"unique_id": "P", "ds": pd.Timestamp(cutoff) + pd.Timedelta(days=1),
                         "cutoff": pd.Timestamp(cutoff), "y": 10.0, "model": model,
                         "yhat": 10.0 - err, "error": float(err)})
    long = pd.DataFrame(rows)
    members, _ = choose_ensemble(long, cfg)
    assert members == ["A"]
    ens = add_ensemble(long, ["A", "B"])
    assert ens.loc[ens["model"] == "Ensemble", "yhat"].tolist() == [7.0, 7.0]


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
    # 10th and 90th percentiles of the errors are -1.6 and +1.6; bounds are rounded to whole units.
    assert fc["lo_80"].iloc[0] == 8
    assert fc["hi_80"].iloc[0] == 12


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
