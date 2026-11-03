"""Do the event features help? Re-run LightGBM (direct) on the test periods without them.

Run from the `pipeline` folder after a full run (it reads the chosen LightGBM settings):

    python experiments/event_features.py

The result, together with the LightGBM_direct scores from the full run, is saved to
web/public/data/retail/event_features.json for the website. Takes about 7 minutes.
"""

import json
import sys
from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))

import forecast_lab.models as models  # noqa: E402
from forecast_lab.config import RetailConfig  # noqa: E402
from forecast_lab.data_m5 import load_retail  # noqa: E402

EVENT_FEATURES = ["event", "event_type", "days_to_event", "next_event", "days_since_event", "prev_event"]


def main() -> None:
    cfg = RetailConfig()
    root = PIPELINE.parent
    data_dir = root / "web" / "public" / "data" / "retail"
    summary = json.loads((data_dir / "summary.json").read_text())
    params = summary["tuning"]["chosen"]
    sales, products = load_retail(cfg, root / "data" / "raw")
    scored = set(products.loc[products["scored"], "unique_id"])

    models.DYNAMIC_FEATURES = [c for c in models.DYNAMIC_FEATURES if c not in EVENT_FEATURES]
    cv = models.backtest_lightgbm(sales, cfg, "direct", params, n_windows=cfg.n_windows)
    cv = cv[cv["unique_id"].isin(scored)]
    cv["error"] = cv["y"] - cv["LightGBM_direct"].clip(lower=0)

    s = sales[sales["unique_id"].isin(scored)]
    near_event = set(s.loc[(s["event"] == 1) | (s["days_to_event"] <= cfg.event_lead_days), "ds"])
    on_event = cv["ds"].isin(near_event)

    def wape(d):
        return round(float(d["error"].abs().sum() / d["y"].sum()), 4)

    keys = ["wape", "wape_event_days", "wape_other_days"]
    with_events = next(m for m in summary["metrics"] if m["model"] == "LightGBM_direct")
    result = {
        "model": "LightGBM_direct",
        "with_event_features": {k: with_events[k] for k in keys},
        "without_event_features": dict(zip(keys, [wape(cv), wape(cv[on_event]), wape(cv[~on_event])])),
    }
    (data_dir / "event_features.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
