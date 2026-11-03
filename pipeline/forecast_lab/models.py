"""Backtests for each forecasting model.

A backtest replays the past: for each cutoff date, the model sees only data up to
that date and forecasts the next `horizon` days, which are then compared with what
actually happened. All models use the same cutoffs, so results are comparable.
"""

import lightgbm as lgb
import pandas as pd
from mlforecast import MLForecast
from mlforecast.lag_transforms import RollingMean
from statsforecast import StatsForecast
from statsforecast.models import AutoETS, SeasonalNaive

from .config import RetailConfig

MODEL_NAMES = ["SeasonalNaive", "AutoETS", "LightGBM"]


def _total_windows(cfg: RetailConfig) -> int:
    # Earlier windows supply the errors used for intervals; later ones are scored.
    return cfg.calibration_windows + cfg.n_windows


def backtest_baselines(sales: pd.DataFrame, cfg: RetailConfig) -> pd.DataFrame:
    """Statistical baselines, fitted separately to each product.

    - SeasonalNaive: each day repeats the same weekday of the last observed week.
    - AutoETS: exponential smoothing with a weekly pattern, chosen automatically per product.
    """
    sf = StatsForecast(
        models=[SeasonalNaive(season_length=7), AutoETS(season_length=7)],
        freq="D",
        n_jobs=-1,
    )
    return sf.cross_validation(
        df=sales[["unique_id", "ds", "y"]],
        h=cfg.horizon,
        n_windows=_total_windows(cfg),
        step_size=cfg.horizon,
    )


def backtest_lightgbm(sales: pd.DataFrame, cfg: RetailConfig) -> pd.DataFrame:
    """One gradient-boosted tree model trained across all products at once.

    It learns from recent sales (lags and rolling averages), the calendar, prices,
    events and product category. The Tweedie objective suits sales counts with many zeros.
    """
    model = lgb.LGBMRegressor(
        objective="tweedie",
        tweedie_variance_power=1.1,
        n_estimators=400,
        learning_rate=0.05,
        num_leaves=63,
        min_child_samples=50,
        subsample=0.8,
        subsample_freq=1,
        colsample_bytree=0.8,
        random_state=cfg.seed,
        verbose=-1,
    )
    mlf = MLForecast(
        models={"LightGBM": model},
        freq="D",
        lags=[7, 14, 21, 28],
        lag_transforms={
            7: [RollingMean(window_size=7), RollingMean(window_size=28)],
            28: [RollingMean(window_size=7), RollingMean(window_size=28)],
        },
        date_features=["dayofweek", "day", "month"],
    )
    features = ["unique_id", "ds", "y", "dept_id", "cat_id", "sell_price", "price_ratio", "event", "snap"]
    return mlf.cross_validation(
        df=sales[features],
        h=cfg.horizon,
        n_windows=_total_windows(cfg),
        step_size=cfg.horizon,
        static_features=["dept_id", "cat_id"],
    )


def run_backtests(sales: pd.DataFrame, cfg: RetailConfig) -> pd.DataFrame:
    """Run every model and return one table of forecasts aligned by product, date and cutoff."""
    baselines = backtest_baselines(sales, cfg)
    lightgbm = backtest_lightgbm(sales, cfg)
    cv = baselines.merge(lightgbm.drop(columns="y"), on=["unique_id", "ds", "cutoff"], how="inner")
    return cv[["unique_id", "ds", "cutoff", "y", *MODEL_NAMES]]
