"""Choose LightGBM settings on a period that comes before every reported result.

Settings are compared on the tuning period only (see config.py). The calibration and
test periods are never used here, so the reported accuracy is not flattered by tuning.

The comparison uses the direct variant: its inputs are always actual sales from 28 or
more days earlier, so one feature table can score every candidate quickly. The chosen
settings are then used for both LightGBM variants.
"""

import numpy as np
import pandas as pd

from .config import RetailConfig
from .models import DYNAMIC_FEATURES, STATIC_FEATURES, make_lightgbm

# Candidate settings: tree size and the shape of the Tweedie loss.
PARAM_GRID = [
    {"num_leaves": 63, "min_child_samples": 50, "tweedie_variance_power": 1.1},
    {"num_leaves": 255, "min_child_samples": 100, "tweedie_variance_power": 1.1},
    {"num_leaves": 63, "min_child_samples": 50, "tweedie_variance_power": 1.3},
    {"num_leaves": 255, "min_child_samples": 100, "tweedie_variance_power": 1.3},
]
LEARNING_RATE = 0.05
N_ESTIMATORS = [200, 400, 700, 1000]  # number of trees; each candidate is scored at each size


def tune_lightgbm(
    sales: pd.DataFrame, scored_ids: pd.Index, cfg: RetailConfig, tuning_end: pd.Timestamp
) -> tuple[dict, pd.DataFrame]:
    """Return the best settings and a table with the score of every candidate."""
    tuning_cutoff = tuning_end - pd.Timedelta(days=cfg.tuning_windows * cfg.horizon)
    cols = ["unique_id", "ds", "y", *STATIC_FEATURES, *DYNAMIC_FEATURES]
    mlf = make_lightgbm("direct", {}, cfg.seed)
    table = mlf.preprocess(sales.loc[sales["ds"] <= tuning_end, cols], static_features=STATIC_FEATURES)

    train = table[table["ds"] <= tuning_cutoff]
    valid = table[(table["ds"] > tuning_cutoff) & table["unique_id"].isin(scored_ids)]
    features = [c for c in table.columns if c not in ("unique_id", "ds", "y")]
    print(
        f"  tuning on {tuning_cutoff + pd.Timedelta(days=1):%Y-%m-%d} to {tuning_end:%Y-%m-%d} "
        f"({len(PARAM_GRID)} candidates x {len(N_ESTIMATORS)} sizes) ..."
    )

    rows = []
    for params in PARAM_GRID:
        model = make_lightgbm(
            "direct", {**params, "learning_rate": LEARNING_RATE, "n_estimators": max(N_ESTIMATORS)}, cfg.seed
        ).models["LightGBM_direct"]
        model.fit(train[features], train["y"])
        for n in N_ESTIMATORS:
            pred = np.clip(model.predict(valid[features], num_iteration=n), 0, None)
            wape = np.abs(valid["y"] - pred).sum() / valid["y"].sum()
            rows.append({**params, "learning_rate": LEARNING_RATE, "n_estimators": n, "wape": wape})

    results = pd.DataFrame(rows).sort_values("wape").reset_index(drop=True)
    best = results.iloc[0].drop("wape").to_dict()
    best["num_leaves"] = int(best["num_leaves"])
    best["min_child_samples"] = int(best["min_child_samples"])
    best["n_estimators"] = int(best["n_estimators"])
    return best, results
