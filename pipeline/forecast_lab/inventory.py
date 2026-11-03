"""Turn forecasts into a recommended stock level, then check it against what happened.

For each product at each cutoff:
    expected demand  = sum of daily forecasts over the lead time
    safety stock     = z * sigma * sqrt(lead time)
    target stock     = expected demand + safety stock, rounded up to whole units

sigma is the spread of the model's recent daily errors (see evaluation.py), and z
comes from the target service level (1.645 for 95%). The formula assumes daily errors
are independent; the achieved service level below shows how well that holds.
"""

from math import sqrt
from statistics import NormalDist

import numpy as np
import pandas as pd

from .config import RetailConfig


def stock_targets(fc: pd.DataFrame, prices: pd.DataFrame, cfg: RetailConfig) -> pd.DataFrame:
    """One row per model, product and cutoff with the recommendation and the actual outcome."""
    lead = fc[fc["ds"] <= fc["cutoff"] + pd.Timedelta(days=cfg.lead_time_days)]
    out = (
        lead.groupby(["model", "unique_id", "cutoff"])
        .agg(expected_demand=("yhat", "sum"), actual_demand=("y", "sum"), sigma=("sigma", "first"))
        .reset_index()
    )
    z = NormalDist().inv_cdf(cfg.service_level)
    out["safety_stock"] = z * out["sigma"].fillna(0) * sqrt(cfg.lead_time_days)
    out["target_stock"] = np.ceil(out["expected_demand"] + out["safety_stock"])
    out["stockout"] = out["actual_demand"] > out["target_stock"]

    # Shelf price on the cutoff date, to express stock in dollars.
    price = prices.rename(columns={"ds": "cutoff"})[["unique_id", "cutoff", "sell_price"]]
    out = out.merge(price, on=["unique_id", "cutoff"], how="left")
    out["safety_stock_value"] = out["safety_stock"] * out["sell_price"]
    return out


def summarize_inventory(targets: pd.DataFrame) -> pd.DataFrame:
    """Achieved service level and cost of safety stock per model."""
    n_cutoffs = targets["cutoff"].nunique()
    summary = targets.groupby("model").agg(
        achieved_service_level=("stockout", lambda s: 1 - s.mean()),
        avg_safety_stock_units=("safety_stock", "mean"),
        total_safety_stock_value=("safety_stock_value", "sum"),
    )
    # Dollar value of safety stock across all products at a typical cutoff.
    summary["safety_stock_value_per_cutoff"] = summary.pop("total_safety_stock_value") / n_cutoffs
    return summary.reset_index()
