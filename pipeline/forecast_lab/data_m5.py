"""Download and prepare the M5 retail dataset (Walmart daily unit sales, 2011-2016).

The output is a "long" table with one row per product per day:
unique_id, ds (date), y (units sold), plus features known in advance
(price, events, SNAP food-assistance days) and product attributes.
"""

import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

from .config import RetailConfig

# Public mirror of the M5 competition files maintained by Nixtla.
M5_URL = "https://raw.githubusercontent.com/Nixtla/m5-forecasts/main/datasets/m5.zip"
# Day "d_1" in the M5 files corresponds to this date.
START_DATE = pd.Timestamp("2011-01-29")


def download(raw_dir: Path) -> Path:
    """Download the M5 archive once and reuse it on later runs."""
    zip_path = raw_dir / "m5.zip"
    if not zip_path.exists():
        raw_dir.mkdir(parents=True, exist_ok=True)
        print(f"Downloading M5 data to {zip_path} ...")
        urllib.request.urlretrieve(M5_URL, zip_path)
    return zip_path


def _read(zf: zipfile.ZipFile, name: str, **kwargs) -> pd.DataFrame:
    with zf.open(name) as f:
        return pd.read_csv(f, **kwargs)


def _event_features(calendar: pd.DataFrame, max_days: int = 14) -> pd.DataFrame:
    """Per date: today's event type, and the nearest upcoming and most recent event.

    Shopping often changes in the days before an event (Thanksgiving, Super Bowl) and
    sometimes after it, so the model sees the event name and the distance in days.
    Events further than `max_days` away are recorded as "none".
    """
    cal = calendar[["ds", "event_name_1", "event_type_1"]].sort_values("ds").reset_index(drop=True)
    has_event = cal["event_name_1"].notna()
    event_dates = cal["ds"].where(has_event)
    names = cal["event_name_1"].where(has_event)

    out = pd.DataFrame({"ds": cal["ds"]})
    out["event_type"] = cal["event_type_1"].fillna("none")
    next_date, next_name = event_dates.bfill(), names.bfill()
    prev_date, prev_name = event_dates.ffill(), names.ffill()
    days_to = (next_date - cal["ds"]).dt.days
    days_since = (cal["ds"] - prev_date).dt.days
    out["days_to_event"] = days_to.where(days_to <= max_days, max_days + 1).fillna(max_days + 1)
    out["next_event"] = next_name.where(days_to <= max_days, "none").fillna("none")
    out["days_since_event"] = days_since.where(days_since <= max_days, max_days + 1).fillna(max_days + 1)
    out["prev_event"] = prev_name.where(days_since <= max_days, "none").fillna("none")
    return out


def load_retail(cfg: RetailConfig, raw_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (sales, products) for every product in one store with enough history.

    All of them are used to train the machine-learning models; the column
    `products.scored` marks the random sample on which every model is evaluated.
    """
    zf = zipfile.ZipFile(download(raw_dir))

    # Training period (d_1 to d_1941) plus the 28 days released after the competition.
    train = _read(zf, "sales_train_evaluation.csv")
    test = _read(zf, "sales_test_evaluation.csv")
    train = train[train["store_id"] == cfg.store_id]
    test = test[test["store_id"] == cfg.store_id]
    keys = ["item_id", "dept_id", "cat_id", "store_id", "state_id"]
    wide = train.drop(columns="id", errors="ignore").merge(test, on=keys, how="inner")

    # Keep products with enough history to fit the models and run every backtest window.
    day_cols = [c for c in wide.columns if c.startswith("d_")]
    first_sale = (wide[day_cols].to_numpy() > 0).argmax(axis=1)
    wide = wide[len(day_cols) - first_sale >= cfg.min_history_days]

    # Random, reproducible sample of products to score (includes slow and fast sellers).
    rng = np.random.default_rng(cfg.seed)
    items = sorted(wide["item_id"])
    chosen = set(rng.choice(items, size=min(cfg.n_items, len(items)), replace=False))

    products = wide[["item_id", "dept_id", "cat_id"]].rename(columns={"item_id": "unique_id"})
    products["scored"] = products["unique_id"].isin(chosen)

    # Wide (one column per day) to long (one row per day).
    sales = wide.melt(id_vars=["item_id"], value_vars=day_cols, var_name="d", value_name="y")
    sales["ds"] = START_DATE + pd.to_timedelta(sales["d"].str[2:].astype(int) - 1, unit="D")
    sales = sales.rename(columns={"item_id": "unique_id"}).drop(columns="d")
    sales["y"] = sales["y"].astype("float32")
    sales = sales.sort_values(["unique_id", "ds"]).reset_index(drop=True)

    # Drop the zeros before each product's first sale (the product was not yet on the shelf).
    started = sales.groupby("unique_id")["y"].cummax() > 0
    sales = sales[started].reset_index(drop=True)

    # Calendar features: known in advance, so they can be used when forecasting.
    calendar = _read(zf, "calendar.csv")
    calendar["ds"] = pd.to_datetime(calendar["date"])
    state = cfg.store_id.split("_")[0]
    calendar["event"] = (calendar["event_name_1"].notna() | calendar["event_name_2"].notna()).astype(int)
    calendar["snap"] = calendar[f"snap_{state}"].astype(int)
    calendar = calendar.merge(_event_features(calendar), on="ds", how="left")
    cal_cols = ["ds", "wm_yr_wk", "event", "snap", "event_type", "days_to_event", "next_event",
                "days_since_event", "prev_event"]
    sales = sales.merge(calendar[cal_cols], on="ds", how="left")

    # Weekly shelf price; filled forward/backward where a week is missing.
    prices = _read(zf, "sell_prices.csv")
    prices = prices[prices["store_id"] == cfg.store_id].rename(columns={"item_id": "unique_id"})
    sales = sales.merge(prices[["unique_id", "wm_yr_wk", "sell_price"]], on=["unique_id", "wm_yr_wk"], how="left")
    by_item = sales.groupby("unique_id")["sell_price"]
    sales["sell_price"] = by_item.transform(lambda s: s.ffill().bfill()).astype("float32")
    by_item = sales.groupby("unique_id")["sell_price"]
    # Price relative to the highest price of the past year: values below 1 indicate a discount.
    # (Only past and current prices are used, so no information from the future leaks in.)
    regular = by_item.transform(lambda s: s.rolling(365, min_periods=1).max())
    sales["price_ratio"] = (sales["sell_price"] / regular).astype("float32")
    # Price change versus one week earlier (positive means a price increase).
    sales["price_change_7d"] = (by_item.pct_change(7).fillna(0)).astype("float32")
    sales = sales.drop(columns="wm_yr_wk")

    # Product attributes used by the machine-learning models.
    sales = sales.merge(products[["unique_id", "dept_id", "cat_id"]], on="unique_id", how="left")
    for col in ["dept_id", "cat_id", "event_type", "next_event", "prev_event"]:
        sales[col] = sales[col].astype("category")

    return sales, products.reset_index(drop=True)
