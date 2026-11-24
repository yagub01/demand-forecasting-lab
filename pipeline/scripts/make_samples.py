"""Create the sample CSV files offered on the website's forecasting tool.

    python scripts/make_samples.py      (run from the pipeline folder)

Writes to web/public/samples/: two single products (daily) and the whole store (weekly).
"""

import sys
import zipfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
from forecast_lab.data_m5 import START_DATE, download  # noqa: E402

OUT = ROOT / "web" / "public" / "samples"


def main() -> None:
    zf = zipfile.ZipFile(download(ROOT / "data" / "raw"))
    with zf.open("sales_train_evaluation.csv") as f:
        train = pd.read_csv(f)
    with zf.open("sales_test_evaluation.csv") as f:
        test = pd.read_csv(f)
    keys = ["item_id", "dept_id", "cat_id", "store_id", "state_id"]
    wide = train.drop(columns="id", errors="ignore").merge(test, on=keys)
    wide = wide[wide["store_id"] == "CA_1"].set_index("item_id")
    days = [c for c in wide.columns if c.startswith("d_")]
    dates = START_DATE + pd.to_timedelta([int(d[2:]) - 1 for d in days], unit="D")

    OUT.mkdir(parents=True, exist_ok=True)
    last_two_years = dates >= dates[-1] - pd.Timedelta(days=2 * 365)
    for item, name in [("FOODS_3_406", "grocery-fast-seller"), ("HOUSEHOLD_1_012", "household-slow-seller")]:
        s = pd.Series(wide.loc[item, days].to_numpy(), index=dates)[last_two_years]
        pd.DataFrame({"date": s.index.strftime("%Y-%m-%d"), "units": s.astype(int)}).to_csv(
            OUT / f"{name}.csv", index=False
        )

    store = pd.Series(wide[days].sum().to_numpy(), index=dates)
    weekly = store.resample("W-SUN").sum().iloc[1:]  # drop the partial first week
    pd.DataFrame({"week": weekly.index.strftime("%Y-%m-%d"), "units": weekly.astype(int)}).to_csv(
        OUT / "store-weekly.csv", index=False
    )


if __name__ == "__main__":
    main()
