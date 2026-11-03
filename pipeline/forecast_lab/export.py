"""Write results as JSON files for the website.

    summary.json        dataset description, settings, accuracy and inventory tables
    products.json       one entry per product with its accuracy per model
    series/<id>.json    recent history, latest forecasts with ranges, stock recommendation
"""

import json
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

from .config import RetailConfig


def _clean(value):
    """Round floats and turn NaN into null so the JSON stays small and valid."""
    if isinstance(value, (float, np.floating)):
        return None if np.isnan(value) else round(float(value), 4)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    return value


def _records(df: pd.DataFrame) -> list[dict]:
    return [{k: _clean(v) for k, v in row.items()} for row in df.to_dict(orient="records")]


def _dates(s: pd.Series) -> list[str]:
    return s.dt.strftime("%Y-%m-%d").tolist()


def _numbers(s: pd.Series, digits: int = 2) -> list:
    return [None if pd.isna(v) else round(float(v), digits) for v in s]


def write_json(path: Path, data, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        if pretty:
            json.dump(data, f, indent=2)
        else:
            json.dump(data, f, separators=(",", ":"))


def export_retail(
    out_dir: Path,
    cfg: RetailConfig,
    sales: pd.DataFrame,
    products: pd.DataFrame,
    fc: pd.DataFrame,
    metrics: pd.DataFrame,
    series_metrics: pd.DataFrame,
    targets: pd.DataFrame,
    inventory: pd.DataFrame,
    tuning: dict,
    ensemble: dict,
) -> None:
    cutoffs = sorted(fc["cutoff"].unique())
    last_cutoff = pd.Timestamp(cutoffs[-1])
    levels = cfg.levels

    write_json(
        out_dir / "summary.json",
        {
            "dataset": {
                "name": "M5 (Walmart daily unit sales)",
                "store_id": cfg.store_id,
                "n_products": int(products["unique_id"].nunique()),
                "first_date": _clean(sales["ds"].min()),
                "last_date": _clean(sales["ds"].max()),
                "scored_cutoffs": [_clean(pd.Timestamp(c)) for c in cutoffs],
            },
            "config": asdict(cfg),
            "tuning": tuning,
            "ensemble": ensemble,
            "metrics": _records(metrics),
            "inventory": _records(inventory),
        },
        pretty=True,
    )

    # Product list with simple descriptors and per-model accuracy.
    scored = fc[fc["model"] == fc["model"].iloc[0]]
    demand = scored.groupby("unique_id")["y"].agg(avg_daily_units="mean", zero_share=lambda s: (s == 0).mean())
    wape = series_metrics.pivot(index="unique_id", columns="model", values="wape")
    mase = series_metrics.pivot(index="unique_id", columns="model", values="mase")
    entries = []
    for p in products.sort_values("unique_id").itertuples(index=False):
        entries.append(
            {
                "id": p.unique_id,
                "dept": p.dept_id,
                "category": p.cat_id,
                "avg_daily_units": _clean(demand.loc[p.unique_id, "avg_daily_units"]),
                "zero_share": _clean(demand.loc[p.unique_id, "zero_share"]),
                "wape": {m: _clean(v) for m, v in wape.loc[p.unique_id].items()},
                "mase": {m: _clean(v) for m, v in mase.loc[p.unique_id].items()},
            }
        )
    write_json(out_dir / "products.json", entries)

    # One file per product, loaded by the website only when that product is opened.
    start = last_cutoff - pd.Timedelta(days=cfg.history_days_exported - 1)
    history = sales[(sales["ds"] >= start) & (sales["ds"] <= last_cutoff)]
    latest = fc[fc["cutoff"] == last_cutoff]
    latest_targets = targets[targets["cutoff"] == last_cutoff]
    for uid, hist in history.groupby("unique_id"):
        window = latest[latest["unique_id"] == uid].sort_values("ds")
        actual = window[window["model"] == window["model"].iloc[0]]
        forecasts = {}
        for model, g in window.groupby("model"):
            forecasts[model] = {"yhat": _numbers(g["yhat"])}
            for level in levels:
                forecasts[model][f"lo_{level}"] = _numbers(g[f"lo_{level}"])
                forecasts[model][f"hi_{level}"] = _numbers(g[f"hi_{level}"])
        stock = latest_targets[latest_targets["unique_id"] == uid].set_index("model")
        write_json(
            out_dir / "series" / f"{uid}.json",
            {
                "id": uid,
                "cutoff": _clean(last_cutoff),
                "history": {"ds": _dates(hist["ds"]), "y": _numbers(hist["y"], 0)},
                "actual": {"ds": _dates(actual["ds"]), "y": _numbers(actual["y"], 0)},
                "forecasts": forecasts,
                "inventory": {
                    model: {
                        k: _clean(row[k])
                        for k in ["expected_demand", "safety_stock", "target_stock", "actual_demand", "stockout"]
                    }
                    for model, row in stock.iterrows()
                },
            },
        )
