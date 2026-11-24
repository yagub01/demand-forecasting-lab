# Demand Forecasting Lab

A free demand forecasting tool and the research behind it.

**The tool:** upload a CSV of past sales (daily, weekly or monthly) and get a forecast you can plan with. Five forecasting methods and an ensemble are tested on your own recent data, the most accurate one is recommended, every period gets an 80% and a 95% range, and the forecast is turned into a recommended stock level for the lead time and service level you choose. Everything runs in the browser; the file is never uploaded.

**The case study:** the same approach, plus machine-learning models, tested on 500 Walmart products (results below and on the site).

**Status:** the tool, the retail case study and the website are complete. An electricity-demand case study is in progress.

## The forecasting tool

| Step | What happens |
|---|---|
| Read the file | Detects the date and quantity columns (comma, semicolon or tab separated; ISO, US or European dates). Rows on the same date are added up; missing dates count as zero. An optional product column lets you forecast one product or all combined. |
| Detect frequency | Daily, weekly or monthly, with a seasonal cycle of 7, 52 or 12 periods. |
| Test the methods | Up to four cuts in the most recent history. At each cut every method sees only earlier data and forecasts the next periods; the forecast error (WAPE) and bias are measured against what happened. |
| Methods | Seasonal naive (baseline), seasonal average, Holt-Winters exponential smoothing with a damped trend, simple exponential smoothing, Croston (SBA) for slow sellers, and an ensemble of the three best. |
| Ranges | Each method's 80% and 95% ranges come from its own errors in testing. |
| Stock | Expected demand over the lead time plus safety stock (z × error spread × √lead time). |

The code is in `web/src/lib/forecast/` (`csv.ts`, `models.ts`, `engine.ts`), with tests in `forecast.test.ts`.

Holt-Winters weights are chosen by how well they forecast a full horizon on the most recent history, not by one-step-ahead fit: on the grocery sample, one-step fitting gave 55% error against 49% for horizon-based fitting.

## Retail results

One Walmart store in California (M5 dataset). The machine-learning models train on all 2,872 products with at least two years of sales; every model is scored on the same random sample of 500 of them, forecasting 28 days ahead.

Results cover four 28-day test periods from 29 February to 19 June 2016. Model settings and ensemble members were chosen on earlier periods, so the test periods played no part in any choice (one disclosed exception, below).

### Forecast accuracy

| Model | WAPE | MASE | RMSE | Bias | 80% range coverage | 95% range coverage |
|---|---|---|---|---|---|---|
| Ensemble | **75.4%** | 0.930 | 1.88 | −2.4% | 89.0% | 95.8% |
| LightGBM, direct | 76.3% | 0.945 | 1.90 | −6.8% | 88.8% | 95.9% |
| AutoETS | 76.6% | 0.927 | 1.96 | −1.3% | 88.6% | 95.6% |
| TSB | 77.9% | 0.945 | 1.96 | +0.9% | 88.5% | 95.3% |
| LightGBM, recursive | 78.6% | 1.002 | 1.88 | +6.5% | 89.4% | 96.2% |
| Croston (SBA) | 79.5% | 0.967 | 1.97 | −2.4% | 88.9% | 95.7% |
| Seasonal naive | 91.5% | 1.063 | 2.43 | −2.5% | 83.5% | 93.5% |

The ensemble is the average of LightGBM (direct), AutoETS and TSB, the three most accurate models on the calibration periods.

### Inventory: 7-day lead time, 95% target service level

| Model | Achieved service level | Safety stock per product (units) | Safety stock value, all 500 products |
|---|---|---|---|
| Ensemble | 94.2% | 5.7 | $10,350 |
| LightGBM, direct | 91.6% | 5.7 | $10,341 |
| AutoETS | 94.0% | 5.8 | $10,560 |
| TSB | 94.7% | 5.9 | $10,692 |
| LightGBM, recursive | 96.0% | 5.7 | $10,326 |
| Croston (SBA) | 93.3% | 5.9 | $10,741 |
| Seasonal naive | 95.3% | 7.6 | $13,821 |

### Real-world events

The models use about 30 calendar events (national holidays, cultural and religious events, major sporting events), including the days before and after each one.

| Model | WAPE on event days and the 3 days before | WAPE on other days |
|---|---|---|
| Ensemble | 76.6% | 74.8% |
| LightGBM, direct | 77.2% | 75.9% |
| AutoETS | 78.2% | 75.7% |
| Seasonal naive | 93.6% | 90.5% |

To measure the effect of the event information, LightGBM (direct) was refitted without it ([`pipeline/experiments/event_features.py`](pipeline/experiments/event_features.py)):

| | With event features | Without |
|---|---|---|
| WAPE, all days | 76.3% | 76.5% |
| WAPE, event days and the 3 days before | 77.2% | 77.5% |
| WAPE, other days | 75.9% | 76.0% |

### Findings

- **The ensemble is the most accurate model, but its lead is small.** Its error is 1.5% lower than AutoETS and 17.6% lower than the seasonal naive baseline. Compared with the first version of this project (untuned LightGBM trained on 500 products, WAPE 77.1%), error fell by 2.2%. All six models other than the baseline land between 75% and 80%. This suggests that most of the remaining error, at the level of one product on one day, is random variation that no model can remove.
- **Direct beats recursive.** The LightGBM variant that never feeds its own predictions back in is more accurate (76.3% versus 78.6%). The two variants err in opposite directions (−6.8% and +6.5% bias), which is one reason averaging helps.
- **Events matter, but the event features add little.** Every model is less accurate around events. Removing the event features from LightGBM raises its error only slightly, by 0.2 percentage points overall and 0.3 on event days.
- **Better forecasts reduce inventory.** At a similar service level, the ensemble needs 25% less safety stock than the baseline ($10,350 versus $13,821 at shelf prices).
- **Bias matters for stock decisions.** LightGBM (direct) needs about the same safety stock as the ensemble but reaches only 91.6% service, because it under-forecasts by 6.8%.
- **The 95% ranges are on target (95.3–96.2%).** The 80% ranges contain 88.5–89.4% of actual sales, above target. This is unavoidable for slow sellers. A product that sells 0 or 1 unit on most days can only have a range of "0" or "0 to 1", and those may cover, say, 70% or 95% of days, with nothing in between.

### Against the targets set at the start

| Target | Result |
|---|---|
| At least 5% lower error than AutoETS | **Not met:** 1.5% lower |
| Ranges contain actual sales at their stated rate | **Met for 95%**; 80% ranges over-cover, as explained above |
| Stock recommendations reach the 95% service level | **Close:** 94.2% for the ensemble |

### Change made after seeing test results

One change was made after examining the test periods. Range bounds are now rounded to whole units. The test results showed that ranges ending just below a whole number (for example 0.98) excluded actual sales of 1. The fix follows from sales being whole numbers and has no tuned setting. Point forecasts, accuracy and stock results are unaffected; only range coverage changed (95% ranges previously contained 82.7–93.5% of actual sales).

[docs/methodology.md](docs/methodology.md) explains every step, metric and limitation in plain language.

## How it works

1. **Prepare** (`data_m5.py`): select products, convert to one row per product per day, and add events, SNAP days, prices and discounts. Only information that would be known at forecast time is used.
2. **Tune** (`tuning.py`): compare 16 LightGBM settings on September to November 2015.
3. **Backtest** (`models.py`): seasonal naive, AutoETS, Croston (SBA), TSB, and two LightGBM variants, all refitted at each of eight cutoffs.
4. **Ensemble** (`evaluation.py`): average the three most accurate models on the four calibration periods.
5. **Prediction ranges** (`evaluation.py`): built from each model's own errors over the previous 16 weeks.
6. **Metrics** (`evaluation.py`): WAPE, MASE, RMSE, bias, range coverage, and accuracy around events.
7. **Inventory** (`inventory.py`): target stock = expected demand over the lead time + safety stock, then checked against actual sales.
8. **Export** (`export.py`): summary, product list and one file per product for the website.

## Project structure

```
demand-forecasting-lab/
├── pipeline/
│   ├── forecast_lab/       Python package: data, models, tuning, evaluation, inventory, export
│   ├── experiments/        one-off checks, such as the event-feature comparison
│   ├── tests/              checks of the core calculations
│   └── requirements.txt
├── web/                    website (Next.js), deployed on Vercel
│   ├── src/app/            pages: forecasting tool and retail case study
│   ├── src/components/     forecasting tool, charts, tables and the product explorer
│   ├── src/lib/forecast/   forecasting engine that runs in the browser, with tests
│   ├── public/samples/     sample CSV files offered on the tool (from M5)
│   └── public/data/retail/ results written by the pipeline
│       ├── summary.json        settings, tuning, ensemble, accuracy and inventory tables
│       ├── products.json       one entry per scored product
│       ├── event_features.json event-feature comparison
│       └── series/<product>.json
└── docs/methodology.md     plain-language explanation of each step
```

The pipeline writes its results straight into `web/public/data/`. The website reads them when it is built, so every page is static: there is no server or database to maintain.

## Running the pipeline

Requires Python 3.13 (other recent versions will likely work but are untested). The dataset (50 MB) downloads automatically on the first run.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r pipeline/requirements.txt
cd pipeline
python -m forecast_lab retail                     # full run, about 37 minutes on 4 cores
python -m forecast_lab retail --reuse-backtests   # reuse saved model forecasts, under a minute
python -m pytest tests                            # checks
```

Settings (store, number of products, periods, lead time, service level) are in `pipeline/forecast_lab/config.py`.

## Website

The website has the forecasting tool (home page) and the retail case study: headline results, model comparison, a product explorer (forecast against actual sales with ranges, and the stock recommendation) and the event analysis.

Run it locally (requires Node.js 20.9 or later):

```bash
cd web
npm install
npm run dev     # then open http://localhost:3000
npm test        # tests of the forecasting engine
```

### Deploying on Vercel

1. Sign in at [vercel.com](https://vercel.com) with GitHub and choose **Add New → Project**.
2. Import the `demand-forecasting-lab` repository.
3. Set **Root Directory** to `web`. Vercel detects Next.js; keep the default build settings.
4. Deploy. Every push to `main` then redeploys the site automatically.

After re-running the pipeline, commit the updated files in `web/public/data/` and push; Vercel rebuilds the site with the new results.

## Data

The M5 dataset was released by the University of Nicosia (Makridakis Open Forecasting Center) and Walmart for the [M5 forecasting competition](https://www.kaggle.com/competitions/m5-forecasting-accuracy) (2020). The pipeline downloads it from a public mirror maintained by [Nixtla](https://github.com/Nixtla/m5-forecasts).

## Roadmap

- [x] Retail pipeline: data, seven models, tuning, backtesting, ranges, stock recommendations
- [x] Interactive website (Next.js, deployable on Vercel)
- [x] Forecasting tool for your own data
- [ ] Electricity demand (hourly, weather-driven)
- [ ] Third industry
- [ ] Retail improvements: wider tuning search, weather data, simulation-based stock levels
