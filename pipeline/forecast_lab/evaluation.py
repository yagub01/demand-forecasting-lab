"""Ensemble, prediction ranges and accuracy metrics.

Ensemble: the average of the `ensemble_size` most accurate models on the calibration
periods, which come before every test period.

Ranges: for each model, product and cutoff, the range is built from that model's own
forecast errors on the same product over the previous `calibration_windows` periods
(16 weeks by default), with bounds rounded to whole units. Only errors already known
at the cutoff are used. The same method applies to every model, so their ranges are
directly comparable.
"""

import numpy as np
import pandas as pd

from .config import RetailConfig


def to_long(cv: pd.DataFrame, models: list[str]) -> pd.DataFrame:
    """One row per product, date, cutoff and model. Forecasts below zero are set to zero."""
    long = cv.melt(
        id_vars=["unique_id", "ds", "cutoff", "y"], value_vars=models, var_name="model", value_name="yhat"
    )
    long["yhat"] = long["yhat"].clip(lower=0)
    long["error"] = long["y"] - long["yhat"]
    return long


def _wape(df: pd.DataFrame) -> float:
    return df["error"].abs().sum() / df["y"].sum()


def choose_ensemble(long: pd.DataFrame, cfg: RetailConfig) -> tuple[list[str], pd.Series]:
    """Pick the most accurate models on the calibration periods (never the test periods)."""
    cutoffs = sorted(long["cutoff"].unique())[: cfg.calibration_windows]
    calib = long[long["cutoff"].isin(cutoffs)]
    scores = calib.groupby("model").apply(_wape, include_groups=False).sort_values()
    return scores.index[: cfg.ensemble_size].tolist(), scores


def add_ensemble(long: pd.DataFrame, members: list[str]) -> pd.DataFrame:
    keys = ["unique_id", "ds", "cutoff", "y"]
    ens = long[long["model"].isin(members)].groupby(keys, as_index=False)["yhat"].mean()
    ens["model"] = "Ensemble"
    ens["error"] = ens["y"] - ens["yhat"]
    return pd.concat([long, ens[long.columns]], ignore_index=True)


def add_intervals(long: pd.DataFrame, cfg: RetailConfig) -> pd.DataFrame:
    """Attach lo/hi bounds and the daily error spread (sigma); keep only the test periods."""
    cutoffs = sorted(long["cutoff"].unique())
    keys = ["model", "unique_id"]
    scored = []
    for i in range(cfg.calibration_windows, len(cutoffs)):
        past = long[long["cutoff"].isin(cutoffs[i - cfg.calibration_windows : i])]
        current = long[long["cutoff"] == cutoffs[i]]
        grouped = past.groupby(keys)["error"]
        stats = pd.DataFrame({"sigma": grouped.std()})
        for level in cfg.levels:
            tail = (100 - level) / 200
            stats[f"q_lo_{level}"] = grouped.quantile(tail)
            stats[f"q_hi_{level}"] = grouped.quantile(1 - tail)
        current = current.merge(stats.reset_index(), on=keys, how="left")
        for level in cfg.levels:
            # Sales are whole numbers, so the bounds are rounded to the nearest whole number.
            # (A bound of 0.98 would otherwise exclude a sale of 1.)
            lo = current["yhat"] + current.pop(f"q_lo_{level}")
            hi = current["yhat"] + current.pop(f"q_hi_{level}")
            current[f"lo_{level}"] = np.floor(lo + 0.5).clip(lower=0)
            current[f"hi_{level}"] = np.floor(hi + 0.5).clip(lower=0)
        scored.append(current)
    return pd.concat(scored, ignore_index=True)


def naive_scale(sales: pd.DataFrame, before: pd.Timestamp) -> pd.Series:
    """Average absolute change versus the same weekday a week earlier, per product.

    Used to scale errors (MASE): a value of 1.0 means "as accurate as repeating last week".
    """
    hist = sales[sales["ds"] <= before].sort_values(["unique_id", "ds"])
    diff = hist.groupby("unique_id")["y"].diff(7).abs()
    return diff.groupby(hist["unique_id"]).mean().replace(0, np.nan).rename("scale")


def summarize(
    fc: pd.DataFrame, scale: pd.Series, levels: tuple[int, ...], event_dates: set | None = None
) -> pd.DataFrame:
    """Overall accuracy per model across all scored products and test periods.

    `event_dates`, if given, splits WAPE into days around events and all other days.
    """
    rows = []
    for model, g in fc.groupby("model"):
        abs_err = g["error"].abs()
        per_series_mae = abs_err.groupby(g["unique_id"]).mean()
        row = {
            "model": model,
            # Total absolute error as a share of total units sold (lower is better).
            "wape": abs_err.sum() / g["y"].sum(),
            # Error relative to repeating last week, averaged over products (below 1 beats it).
            "mase": (per_series_mae / scale).mean(),
            "rmse": float(np.sqrt((g["error"] ** 2).mean())),
            # Positive means the model forecast more than was sold.
            "bias": -g["error"].sum() / g["y"].sum(),
        }
        for level in levels:
            inside = (g["y"] >= g[f"lo_{level}"]) & (g["y"] <= g[f"hi_{level}"])
            row[f"coverage_{level}"] = inside.mean()
        if event_dates is not None:
            near_event = g["ds"].isin(event_dates)
            row["wape_event_days"] = _wape(g[near_event])
            row["wape_other_days"] = _wape(g[~near_event])
        rows.append(row)
    return pd.DataFrame(rows).sort_values("wape").reset_index(drop=True)


def per_series(fc: pd.DataFrame, scale: pd.Series) -> pd.DataFrame:
    """WAPE and MASE per product and model, for the website's product picker."""
    g = fc.assign(abs_err=fc["error"].abs()).groupby(["unique_id", "model"])
    out = g.agg(abs_err=("abs_err", "sum"), units=("y", "sum"), mae=("abs_err", "mean")).reset_index()
    out["wape"] = out["abs_err"] / out["units"].replace(0, np.nan)
    out["mase"] = out["mae"] / out["unique_id"].map(scale)
    return out[["unique_id", "model", "wape", "mase"]]
