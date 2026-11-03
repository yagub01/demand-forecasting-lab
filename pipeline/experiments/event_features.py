"""Do the event features help? Re-run LightGBM (direct) on the test periods without them.

Run from the `pipeline` folder after a full run (it reads the chosen LightGBM settings):

    python experiments/event_features.py

Compare the printed WAPE values with the LightGBM_direct row in outputs/retail/summary.json.
Takes about 7 minutes.
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
    params = json.loads((root / "outputs" / "retail" / "summary.json").read_text())["tuning"]["chosen"]
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

    print("LightGBM_direct without event features:")
    print({"wape": wape(cv), "wape_event_days": wape(cv[on_event]), "wape_other_days": wape(cv[~on_event])})


if __name__ == "__main__":
    main()
