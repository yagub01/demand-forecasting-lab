# Demand Forecasting Lab

A demand forecasting project for supply chain. Statistical and machine-learning models are compared on the same historical test periods, every forecast includes a range of likely outcomes, and each forecast is converted into a recommended stock level that is checked against actual sales.

The first dataset is retail (Walmart). More industries will follow.

**Status:** the Python forecasting pipeline for retail is complete. An interactive website (Next.js, hosted on Vercel) and an electricity-demand dataset are in progress.

## Retail results

500 randomly sampled products from one Walmart store in California (M5 dataset), forecast 28 days ahead. Scores cover four 28-day periods from 28 February to 19 June 2016, with each model refitted at every cutoff.

### Forecast accuracy

| Model | WAPE | MASE | RMSE | Bias | 80% range coverage | 95% range coverage |
|---|---|---|---|---|---|---|
| AutoETS | **76.6%** | **0.93** | 1.96 | −1.3% | 70.6% | 82.7% |
| LightGBM | 77.1% | 0.99 | **1.87** | +2.2% | 72.1% | 86.2% |
| Seasonal naive | 91.5% | 1.06 | 2.43 | −2.5% | 81.8% | 90.5% |

### Inventory: 7-day lead time, 95% target service level

| Model | Achieved service level | Safety stock per product (units) | Safety stock value, all 500 products |
|---|---|---|---|
| LightGBM | 94.2% | 5.6 | $10,211 |
| AutoETS | 93.6% | 5.7 | $10,364 |
| Seasonal naive | 94.7% | 7.4 | $13,491 |

### Findings

- **Both advanced models clearly beat the baseline.** AutoETS and LightGBM cut total error (WAPE) by about 15 percentage points compared with repeating last week's sales.
- **AutoETS and LightGBM are close.** AutoETS has slightly lower average error; LightGBM makes fewer large misses (lower RMSE). In this untuned setup, the machine-learning model does not outperform a well-established statistical method.
- **Better forecasts reduce inventory.** At nearly the same service level, LightGBM needs 24% less safety stock than the baseline ($10,211 versus $13,491 at shelf prices).
- **The ranges are too narrow.** The 95% ranges contain actual sales only 83–90% of the time. The stock recommendations still come close to the 95% target (93.6–94.7%). Two likely reasons: daily errors partly cancel out over 7 days, and stock is rounded up to whole units.

Error levels around 75% are normal for daily sales of individual products. Most of these products sell a few units a day or fewer, so day-to-day variation is largely random. [docs/methodology.md](docs/methodology.md) explains every step, metric and limitation in plain language.

## How it works

1. **Prepare** (`data_m5.py`): sample products, convert to one row per product per day, and add price, discount, event and SNAP-day information.
2. **Backtest** (`models.py`): seasonal naive, AutoETS (statsforecast) and LightGBM (mlforecast), all refitted at each cutoff.
3. **Prediction ranges** (`evaluation.py`): built from each model's own errors over the previous eight weeks, using the same method for every model.
4. **Metrics** (`evaluation.py`): WAPE, MASE, RMSE, bias and range coverage.
5. **Inventory** (`inventory.py`): target stock = expected demand over the lead time + safety stock, then checked against actual sales.
6. **Export** (`export.py`): summary, product list and one file per product for the website.

## Project structure

```
demand-forecasting-lab/
├── pipeline/
│   ├── forecast_lab/       Python package: data, models, evaluation, inventory, export
│   ├── tests/              checks of the core calculations
│   └── requirements.txt
├── outputs/retail/         results consumed by the website
│   ├── summary.json
│   ├── products.json
│   └── series/<product>.json
└── docs/methodology.md     plain-language explanation of each step
```

## Running the pipeline

Requires Python 3.13 (other recent versions will likely work but are untested). The dataset (50 MB) downloads automatically on the first run.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r pipeline/requirements.txt
cd pipeline
python -m forecast_lab retail                 # full run, about 4 minutes
python -m forecast_lab retail --n-items 50    # quick run
python -m pytest tests                        # checks
```

Settings (store, number of products, horizon, lead time, service level) are in `pipeline/forecast_lab/config.py`.

## Data

The M5 dataset was released by the University of Nicosia (Makridakis Open Forecasting Center) and Walmart for the [M5 forecasting competition](https://www.kaggle.com/competitions/m5-forecasting-accuracy) (2020). The pipeline downloads it from a public mirror maintained by [Nixtla](https://github.com/Nixtla/m5-forecasts).

## Roadmap

- [x] Retail pipeline: data, three models, backtesting, ranges, stock recommendations
- [ ] Interactive website on Vercel
- [ ] Electricity demand (hourly, weather-driven)
- [ ] Third industry
- [ ] Improvements: LightGBM tuning, better-calibrated ranges, methods for intermittent demand
