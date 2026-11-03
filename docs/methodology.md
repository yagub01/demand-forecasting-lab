# Methodology

This document explains each step of the retail pipeline in plain language: what it does, why it was chosen, and where it falls short. The code for each step is in `pipeline/forecast_lab/`.

## 1. Data

**Source.** The M5 dataset contains daily unit sales for 3,049 Walmart products across 10 stores in California, Texas and Wisconsin, from 29 January 2011 to 19 June 2016. It was released for the M5 forecasting competition in 2020 and is one of the standard benchmarks for retail demand forecasting.

**Sample.** The pipeline uses one store (`CA_1`) and a random sample of 500 products that have sold for at least two years. A random sample keeps the mix realistic: most products sell only a few units a day, and many have days with no sales at all. Selecting only best-sellers would make the problem look easier than it is.

**Cleaning.** Each product's history starts at its first recorded sale. The zeros before that date mean the product was not yet on the shelf, so they would mislead the models.

**Extra information** (`data_m5.py`). Each day carries information that is known in advance and can therefore be used when forecasting:

- the shelf price, and the price relative to the product's usual price (below 1 means a discount);
- whether the day has a holiday or event (Super Bowl, Easter, Thanksgiving and others);
- whether it is a SNAP day, when US food-assistance benefits are paid out, which raises food sales.

## 2. Backtesting

**Purpose.** A forecast can only be judged against what actually happened. A backtest replays the past: pick a cutoff date, give each model only the data up to that date, forecast the next 28 days, and compare with real sales.

**Setup** (`models.py`). The pipeline uses six consecutive 28-day periods ending on 19 June 2016:

- the first two periods supply past errors for the prediction ranges (section 4);
- the last four periods, starting 28 February 2016, are scored.

Every model is refitted at every cutoff and uses the same cutoffs, so the comparison is fair. This approach is called rolling-origin evaluation.

## 3. Models

The models go from simplest to most complex. A complex model is only worth using if it clearly beats the simple ones.

**Seasonal naive.** Each day of the next four weeks repeats the same weekday of the last observed week. It has no parameters and is the reference point for every other model.

**AutoETS** (exponential smoothing). Fitted separately to each product. It tracks the product's level, trend and weekly pattern, giving more weight to recent days. For each product it chooses the best-fitting variant automatically. It is a long-established standard method in demand planning.

**LightGBM** (gradient-boosted decision trees). A single model trained on all 500 products together, so patterns learned on one product can help another. It learns from:

- recent sales: sales 7, 14, 21 and 28 days earlier, and averages over the previous week and month;
- the calendar: day of week, day of month, month;
- price, discount, events and SNAP days;
- product department and category.

The model uses a Tweedie loss, which is designed for quantities that are often zero and occasionally large, as retail sales are. Forecasts beyond the first week reuse the model's own earlier predictions as inputs (recursive forecasting).

Gradient-boosted trees with features like these were the basis of the winning entries in the M5 competition. This version uses fixed settings without tuning, so it is a reasonable first version of the approach, well short of a competition entry.

All forecasts below zero are set to zero.

## 4. Prediction ranges

A single number hides how uncertain a forecast is. Each forecast therefore comes with an 80% and a 95% range: if the ranges are well calibrated, actual sales should fall inside them 80% and 95% of the time.

**Method** (`evaluation.py`). For each model, product and cutoff, the pipeline collects the model's forecast errors on that product over the previous eight weeks (two periods, 56 days). The range is the forecast plus the 10th and 90th percentiles of those errors for 80%, or the 2.5th and 97.5th percentiles for 95%. Only errors already known at the cutoff are used, so nothing from the future leaks in.

The same method applies to all three models. This keeps their ranges comparable and means the ranges reflect each model's actual track record. The approach is a form of conformal prediction.

## 5. Accuracy metrics

All metrics are computed over the four scored periods and all 500 products.

| Metric | Meaning | Better |
|---|---|---|
| WAPE | Total absolute error divided by total units sold | Lower |
| MASE | Average error relative to the seasonal naive model's typical error on that product's history; below 1 beats repeating last week | Lower |
| RMSE | Square root of the average squared error; penalises large misses more than WAPE | Lower |
| Bias | Total forecast minus total sales, as a share of sales; positive means over-forecasting | Closer to 0 |
| Coverage | Share of actual values inside the 80% or 95% range | Closer to 80% / 95% |

WAPE values near 75% look high but are normal at this level of detail. For a product selling half a unit a day on average, most days are 0 or 1, and no model can predict which.

## 6. Inventory recommendation

A forecast is useful in supply chain when it drives a decision. The pipeline converts each forecast into a recommended stock level (`inventory.py`).

**Question answered.** An order placed today arrives in 7 days. How many units should be available to cover demand during those 7 days with 95% probability?

**Formula.**

```
expected demand = sum of the daily forecasts over the next 7 days
safety stock    = z × σ × √7
target stock    = expected demand + safety stock, rounded up to whole units
```

- `σ` is the standard deviation of the model's daily errors on that product over the previous eight weeks (the same errors used for the ranges).
- `z` = 1.645 for a 95% service level (from the normal distribution).
- `√7` scales one day's uncertainty to seven days, assuming each day's error is independent of the others.

**Check.** For every product and scored period, the pipeline compares the target stock with actual sales over the 7 days. The achieved service level is the share of cases with no stockout. If it is close to 95%, the recommendations are trustworthy. It also reports the dollar value of safety stock at shelf prices: a more accurate model needs less safety stock for the same service level, which ties forecast accuracy to money.

## 7. Known limitations

- **One store, 500 products.** Results may differ for other stores or the full product range.
- **No tuning.** LightGBM uses reasonable default settings. Tuning, more features (for example, price changes over time) or a direct multi-step setup could improve it.
- **Ranges are too narrow.** Eight weeks of errors is a small sample, and sales patterns shift over time, so the ranges cover actual sales less often than their stated level (see the README). Using more past periods would likely help, at the cost of reacting more slowly to change.
- **Normal approximation in the stock formula.** Daily sales of slow-moving products are small whole numbers and skewed, so the normal distribution is only an approximation. Methods designed for intermittent demand, such as Croston's method or simulating demand from the forecast distribution, are possible improvements.
- **Historical "future".** The data ends in 2016, so the "latest" forecast is also historical. That is what makes it possible to score it.

## Glossary

- **Cutoff:** the last date a model is allowed to see before forecasting.
- **Horizon:** how many days ahead the model forecasts (28 here).
- **Lead time:** the time between placing an order and receiving it.
- **Service level:** the probability of not running out of stock before the next delivery.
- **Safety stock:** extra stock held above expected demand to absorb forecast errors.
- **Global model:** one model trained across many products, as opposed to one model per product.
