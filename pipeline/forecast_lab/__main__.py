"""Command-line entry point.

    python -m forecast_lab retail                  # full run (500 products)
    python -m forecast_lab retail --n-items 50     # quick run
"""

import argparse
import time
from dataclasses import replace
from pathlib import Path

from .config import RetailConfig
from .data_m5 import load_retail
from .evaluation import add_intervals, naive_scale, per_series, summarize, to_long
from .export import export_retail
from .inventory import stock_targets, summarize_inventory
from .models import run_backtests

REPO_ROOT = Path(__file__).resolve().parents[2]


def run_retail(cfg: RetailConfig, raw_dir: Path, out_dir: Path) -> None:
    t0 = time.time()
    sales, products = load_retail(cfg, raw_dir)
    print(
        f"Loaded {sales['unique_id'].nunique()} products from store {cfg.store_id}, "
        f"{len(sales):,} daily rows ({sales['ds'].min():%Y-%m-%d} to {sales['ds'].max():%Y-%m-%d})."
    )

    print("Running backtests ...")
    cv = run_backtests(sales, cfg)
    fc = add_intervals(to_long(cv), cfg)

    scale = naive_scale(sales, fc["cutoff"].min())
    metrics = summarize(fc, scale, cfg.levels)
    series_metrics = per_series(fc, scale)
    targets = stock_targets(fc, sales[["unique_id", "ds", "sell_price"]], cfg)
    inventory = summarize_inventory(targets)

    export_retail(out_dir, cfg, sales, products, fc, metrics, series_metrics, targets, inventory)

    print("\nForecast accuracy (scored windows: %d x %d days)" % (cfg.n_windows, cfg.horizon))
    print(metrics.to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print(
        f"\nInventory (lead time {cfg.lead_time_days} days, target service level {cfg.service_level:.0%})"
    )
    print(inventory.to_string(index=False, float_format=lambda v: f"{v:,.3f}"))
    print(f"\nResults written to {out_dir} in {time.time() - t0:.0f}s.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="forecast_lab", description="Run a forecasting pipeline.")
    parser.add_argument("dataset", choices=["retail"], help="which dataset to run")
    parser.add_argument("--n-items", type=int, help="number of products to sample")
    parser.add_argument("--store", help="M5 store id, e.g. CA_1")
    parser.add_argument("--raw-dir", type=Path, default=REPO_ROOT / "data" / "raw")
    parser.add_argument("--out", type=Path, help="output folder (default: outputs/<dataset>)")
    args = parser.parse_args()

    cfg = RetailConfig()
    if args.n_items:
        cfg = replace(cfg, n_items=args.n_items)
    if args.store:
        cfg = replace(cfg, store_id=args.store)
    out_dir = args.out or REPO_ROOT / "outputs" / args.dataset
    run_retail(cfg, args.raw_dir, out_dir)


if __name__ == "__main__":
    main()
