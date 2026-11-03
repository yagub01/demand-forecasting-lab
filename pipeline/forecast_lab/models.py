"""Forecasting models and their backtests.

A backtest replays the past: for each cutoff date, the model sees only data up to
that date and forecasts the next `horizon` days, which are then compared with what
actually happened. All models use the same cutoffs, so results are comparable.
"""

import warnings

import lightgbm as lgb
import numpy as np
import pandas as pd
from mlforecast import MLForecast
from mlforecast.lag_transforms import RollingMean, RollingStd
from statsforecast import StatsForecast
from statsforecast.models import TSB, AutoETS, CrostonSBA, SeasonalNaive

from .config import RetailConfig

STAT_MODELS = ["SeasonalNaive", "AutoETS", "CrostonSBA", "TSB"]
ML_MODELS = ["LightGBM_recursive", "LightGBM_direct"]

# Information known in advance for every forecast day (see data_m5.py).
DYNAMIC_FEATURES = [
    "sell_price", "price_ratio", "price_change_7d", "event", "snap",
    "event_type", "days_to_event", "next_event", "days_since_event", "prev_event",
]
STATIC_FEATURES = ["dept_id", "cat_id"]

# LightGBM settings used when tuning is skipped; tuning.py normally replaces them.
DEFAULT_LGB_PARAMS = {
    "num_leaves": 63,
    "min_child_samples": 50,
    "learning_rate": 0.05,
    "tweedie_variance_power": 1.1,
    "n_estimators": 400,
}

warnings.filterwarnings("ignore", message="Non-numba transforms are computed sequentially")


def days_since_sale(x: np.ndarray) -> np.ndarray:
    """Days since the last day with at least one sale (0 on a day with sales)."""
    idx = np.arange(x.size, dtype=np.float64)
    last_sale = np.fmax.accumulate(np.where(x > 0, idx, np.nan))
    return idx - last_sale


def backtest_statistical(sales: pd.DataFrame, cfg: RetailConfig, n_windows: int) -> pd.DataFrame:
    """Statistical models, fitted separately to each product.

    - SeasonalNaive: each day repeats the same weekday of the last observed week.
    - AutoETS: exponential smoothing with a weekly pattern, chosen automatically per product.
    - CrostonSBA and TSB: designed for slow sellers with many zero days. They forecast
      the size of a typical sale and how often sales happen, separately.
    """
    sf = StatsForecast(
        models=[
            SeasonalNaive(season_length=7),
            AutoETS(season_length=7),
            CrostonSBA(),
            TSB(alpha_d=0.1, alpha_p=0.1),
        ],
        freq="D",
        n_jobs=-1,
    )
    return sf.cross_validation(
        df=sales[["unique_id", "ds", "y"]],
        h=cfg.horizon,
        n_windows=n_windows,
        step_size=cfg.horizon,
    )


def make_lightgbm(variant: str, params: dict, seed: int) -> MLForecast:
    """A LightGBM model trained across all products, in one of two variants.

    - recursive: uses sales up to the previous day. Beyond the first day, those inputs are the
      model's own earlier predictions, so errors can build up over the 28 days.
    - direct: uses only sales from 28 or more days earlier, which are always actual values
      for a 28-day forecast, so no predictions are fed back in.

    Both use the calendar, prices, events and product department/category. The Tweedie
    objective suits sales counts with many zeros.
    """
    if variant == "recursive":
        lags = [1, 2, 3, 7, 14, 21, 28]
        lag_transforms = {
            1: [RollingMean(window_size=7), RollingMean(window_size=28)],
            7: [RollingMean(window_size=7), RollingMean(window_size=28)],
            28: [RollingMean(window_size=182), RollingStd(window_size=28), days_since_sale],
        }
    elif variant == "direct":
        lags = [28, 35, 42, 49, 56]
        lag_transforms = {
            28: [
                RollingMean(window_size=7), RollingMean(window_size=28), RollingMean(window_size=56),
                RollingMean(window_size=182), RollingStd(window_size=28), days_since_sale,
            ],
        }
    else:
        raise ValueError(f"unknown variant {variant!r}")

    model = lgb.LGBMRegressor(
        objective="tweedie",
        subsample=0.8,
        subsample_freq=1,
        colsample_bytree=0.8,
        random_state=seed,
        verbose=-1,
        **params,
    )
    return MLForecast(
        models={f"LightGBM_{variant}": model},
        freq="D",
        lags=lags,
        lag_transforms=lag_transforms,
        date_features=["dayofweek", "day", "month"],
        num_threads=4,
    )


def backtest_lightgbm(
    sales: pd.DataFrame, cfg: RetailConfig, variant: str, params: dict, n_windows: int
) -> pd.DataFrame:
    mlf = make_lightgbm(variant, params, cfg.seed)
    return mlf.cross_validation(
        df=sales[["unique_id", "ds", "y", *STATIC_FEATURES, *DYNAMIC_FEATURES]],
        h=cfg.horizon,
        n_windows=n_windows,
        step_size=cfg.horizon,
        static_features=STATIC_FEATURES,
    )


def run_backtests(
    sales: pd.DataFrame, scored_ids: pd.Index, cfg: RetailConfig, lgb_params: dict
) -> pd.DataFrame:
    """Run every model over the calibration and test periods.

    The statistical models run on the scored products only. LightGBM trains on every
    product in the store, which gives it more examples to learn from, and its forecasts
    are then kept for the scored products.
    """
    n_windows = cfg.calibration_windows + cfg.n_windows
    scored = sales[sales["unique_id"].isin(scored_ids)]
    print(f"  statistical models on {len(scored_ids)} products ...")
    cv = backtest_statistical(scored, cfg, n_windows)
    for variant in ["recursive", "direct"]:
        print(f"  LightGBM ({variant}) on {sales['unique_id'].nunique()} products ...")
        ml = backtest_lightgbm(sales, cfg, variant, lgb_params, n_windows)
        ml = ml[ml["unique_id"].isin(scored_ids)].drop(columns="y")
        cv = cv.merge(ml, on=["unique_id", "ds", "cutoff"], how="inner")
    return cv[["unique_id", "ds", "cutoff", "y", *STAT_MODELS, *ML_MODELS]]
