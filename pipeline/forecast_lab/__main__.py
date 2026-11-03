"""Command-line entry point.

    python -m forecast_lab retail                  # full run (about 20 minutes)
    python -m forecast_lab retail --no-tuning      # skip tuning, use default LightGBM settings
    python -m forecast_lab retail --reuse-backtests  # reuse saved forecasts, recompute the rest
"""

import argparse
import time
from dataclasses import replace
from pathlib import Path

import pandas as pd

from .config import RetailConfig
from .data_m5 import load_retail
from .evaluation import (
    add_ensemble, add_intervals, choose_ensemble, naive_scale, per_series, summarize, to_long,
)
from .export import export_retail
from .inventory import stock_targets, summarize_inventory
from .models import DEFAULT_LGB_PARAMS, ML_MODELS, STAT_MODELS, run_backtests
from .tuning import tune_lightgbm

REPO_ROOT = Path(__file__).resolve().parents[2]


def run_retail(cfg: RetailConfig, raw_dir: Path, out_dir: Path, tune: bool = True, reuse: bool = False) -> None:
    t0 = time.time()
    sales, products = load_retail(cfg, raw_dir)
    scored_ids = pd.Index(products.loc[products["scored"], "unique_id"])
    print(
        f"Loaded {len(products)} products from store {cfg.store_id} ({len(scored_ids)} scored), "
        f"{len(sales):,} daily rows ({sales['ds'].min():%Y-%m-%d} to {sales['ds'].max():%Y-%m-%d})."
    )

    # Timeline: tuning | calibration | test, each period `horizon` days long.
    n_backtest = cfg.calibration_windows + cfg.n_windows
    first_cutoff = sales["ds"].max() - pd.Timedelta(days=n_backtest * cfg.horizon)

    cache = raw_dir.parent / "cache" / f"retail_{cfg.store_id}_backtests.pkl"
    if reuse and cache.exists():
        # Saved model forecasts from an earlier run; skips tuning and model fitting.
        lgb_params, tuning_table, cv = pd.read_pickle(cache)
        print(f"Reusing saved backtests from {cache}")
    else:
        if tune:
            print("Tuning LightGBM ...")
            lgb_params, tuning_table = tune_lightgbm(sales, scored_ids, cfg, tuning_end=first_cutoff)
            print(tuning_table.head(5).to_string(index=False, float_format=lambda v: f"{v:.4f}"))
        else:
            lgb_params, tuning_table = DEFAULT_LGB_PARAMS, pd.DataFrame()
        print("Running backtests ...")
        cv = run_backtests(sales, scored_ids, cfg, lgb_params)
        cache.parent.mkdir(parents=True, exist_ok=True)
        pd.to_pickle((lgb_params, tuning_table, cv), cache)
    print(f"LightGBM settings: {lgb_params}")
    long = to_long(cv, STAT_MODELS + ML_MODELS)
    members, calib_scores = choose_ensemble(long, cfg)
    print(f"Ensemble members (best on calibration periods): {', '.join(members)}")
    fc = add_intervals(add_ensemble(long, members), cfg)

    scored_sales = sales[sales["unique_id"].isin(scored_ids)]
    near_event = (scored_sales["event"] == 1) | (scored_sales["days_to_event"] <= cfg.event_lead_days)
    event_dates = set(scored_sales.loc[near_event, "ds"])
    scale = naive_scale(scored_sales, fc["cutoff"].min())
    metrics = summarize(fc, scale, cfg.levels, event_dates)
    series_metrics = per_series(fc, scale)
    targets = stock_targets(fc, scored_sales[["unique_id", "ds", "sell_price"]], cfg)
    inventory = summarize_inventory(targets)

    export_retail(
        out_dir, cfg, scored_sales, products[products["scored"]], fc, metrics, series_metrics, targets, inventory,
        tuning={
            "chosen": lgb_params,
            "period_end": f"{first_cutoff:%Y-%m-%d}",
            "candidates": tuning_table.round(4).to_dict(orient="records"),
        },
        ensemble={
            "members": members,
            "calibration_wape": {m: round(float(v), 4) for m, v in calib_scores.items()},
        },
    )

    print(f"\nForecast accuracy (test periods: {cfg.n_windows} x {cfg.horizon} days)")
    print(metrics.to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print(f"\nInventory (lead time {cfg.lead_time_days} days, target service level {cfg.service_level:.0%})")
    print(inventory.to_string(index=False, float_format=lambda v: f"{v:,.3f}"))
    print(f"\nResults written to {out_dir} in {time.time() - t0:.0f}s.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="forecast_lab", description="Run a forecasting pipeline.")
    parser.add_argument("dataset", choices=["retail"], help="which dataset to run")
    parser.add_argument("--n-items", type=int, help="number of products to score")
    parser.add_argument("--store", help="M5 store id, e.g. CA_1")
    parser.add_argument("--no-tuning", action="store_true", help="skip tuning and use default LightGBM settings")
    parser.add_argument(
        "--reuse-backtests", action="store_true",
        help="reuse model forecasts saved by the last full run (recomputes ranges, metrics and stock only)",
    )
    parser.add_argument("--raw-dir", type=Path, default=REPO_ROOT / "data" / "raw")
    parser.add_argument("--out", type=Path, help="output folder (default: web/public/data/<dataset>)")
    args = parser.parse_args()

    cfg = RetailConfig()
    if args.n_items:
        cfg = replace(cfg, n_items=args.n_items)
    if args.store:
        cfg = replace(cfg, store_id=args.store)
    # Results go straight into the website, which serves them as static files.
    out_dir = args.out or REPO_ROOT / "web" / "public" / "data" / args.dataset
    run_retail(cfg, args.raw_dir, out_dir, tune=not args.no_tuning, reuse=args.reuse_backtests)


if __name__ == "__main__":
    main()
