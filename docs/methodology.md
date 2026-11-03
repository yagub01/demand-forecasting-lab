# Methodology

This document explains each step of the retail pipeline in plain language: what it does, why it was chosen, and where it falls short. The code for each step is in `pipeline/forecast_lab/`.

## 1. Data

**Source.** The M5 dataset contains daily unit sales for 3,049 Walmart products across 10 stores in California, Texas and Wisconsin, from 29 January 2011 to 19 June 2016. It was released for the M5 forecasting competition in 2020 and is one of the standard benchmarks for retail demand forecasting.

**Products.** The pipeline uses one store (`CA_1`) and every product that has sold for at least two years: 2,872 products.

- **Training:** the machine-learning models learn from all 2,872 products. A single model trained across many products can transfer patterns from one product to another, and it improves with more examples.
- **Scoring:** every model is scored on the same random sample of 500 of these products. A random sample keeps the mix realistic: most products sell only a few units a day, and many have days with no sales at all. Selecting only best-sellers would make the problem look easier than it is.

**Cleaning.** Each product's history starts at its first recorded sale. The zeros before that date mean the product was not yet on the shelf, so they would mislead the models.

## 2. Real-world events and other information known in advance

A forecast for next week can only use information that is available today. Each day therefore carries information known in advance (`data_m5.py`).

**Events.** The M5 calendar lists about 30 recurring events, in four types:

- national holidays: Christmas, Thanksgiving, Independence Day, Memorial Day, Labor Day and others;
- cultural: Easter, Mother's Day, Father's Day, Halloween, Valentine's Day, Cinco de Mayo and others;
- religious: Ramadan, Eid, Chanukah, Lent, Purim, Pesach and others;
- sporting: Super Bowl, NBA Finals.

Shopping changes before an event as well as on the day itself, for example in the days before Thanksgiving. For every day, the model sees:

- the type of event on that day, if any;
- the name of the next event within 14 days, and how many days away it is;
- the name of the most recent event within 14 days, and how many days ago it was.

This lets the model learn, for example, that sales of a product rise three days before Thanksgiving and fall on Christmas Day, when stores are closed.

**SNAP days.** Days when US food-assistance benefits are paid out. Food sales rise on these days.

**Prices.**

- the shelf price;
- the price relative to the highest price of the past year (below 1 means a discount);
- the price change compared with one week earlier.

Only past and current prices are used for the discount measure, so no information from the future leaks into the inputs. Future shelf prices are treated as known, which is realistic for a retailer that plans its own prices and promotions.

**Information not included.** Weather, local economic conditions and news can also affect demand. They are not included for two reasons:

- M5 does not disclose where its stores are, beyond the state, so local weather cannot be matched to a store.
- The environment used to build this project cannot reach weather or economic data services.

A further caution applies to any such data. In a backtest, using the weather that actually happened overstates accuracy, because at forecast time only a weather forecast would have been available. Weather is planned for the electricity dataset, where temperature is the main driver of demand. That requires access to a weather data service.

## 3. Backtesting

**Purpose.** A forecast can only be judged against what actually happened. A backtest replays the past: pick a cutoff date, give each model only the data up to that date, forecast the next 28 days, and compare with real sales.

**Timeline.** The last 280 days of data are split into three stages, each made of 28-day periods:

| Stage | Periods | Dates | Used for |
|---|---|---|---|
| Tuning | 2 | 14 Sep – 8 Nov 2015 | Choosing LightGBM settings |
| Calibration | 4 | 9 Nov 2015 – 28 Feb 2016 | Choosing ensemble members; first errors for prediction ranges |
| Test | 4 | 29 Feb – 19 Jun 2016 | Reporting results |

The test periods are never used to make any choice. If they were, the reported accuracy would be flattered by the choices made on them.

Every model is refitted at every cutoff, and all models use the same cutoffs, so the comparison is fair. This approach is called rolling-origin evaluation.

## 4. Models

The models go from simplest to most complex. A complex model is only worth using if it clearly beats the simple ones.

**Seasonal naive.** Each day of the next four weeks repeats the same weekday of the last observed week. It has no parameters and is the reference point for every other model.

**AutoETS** (exponential smoothing). Fitted separately to each product. It tracks the product's level, trend and weekly pattern, giving more weight to recent days. For each product it chooses the best-fitting variant automatically. It is a long-established standard method in demand planning.

**Croston (SBA) and TSB.** Methods designed for slow-moving products with many zero days. They estimate two things separately: how large a sale typically is, and how often sales happen. Their forecast is a flat average rate, with no weekly pattern. TSB updates the sales frequency every day, so it reacts faster when a product stops selling.

**LightGBM** (gradient-boosted decision trees). A single model trained on all 2,872 products. It learns from:

- past sales: specific earlier days, averages over the previous week, month, two months and half-year, sales volatility, and days since the last sale;
- the calendar: day of week, day of month, month;
- events, SNAP days and prices (section 2);
- product department and category.

It uses a Tweedie loss, which is designed for quantities that are often zero and occasionally large, as retail sales are. It comes in two variants:

- **Recursive:** uses sales up to the previous day. For days beyond tomorrow, those inputs are the model's own earlier predictions, so errors can build up over the 28 days.
- **Direct:** uses only sales from 28 or more days earlier. For a 28-day forecast these are always actual values, so no predictions are fed back in. The trade-off is that it cannot react to the most recent days.

Gradient-boosted trees with features like these were the basis of the winning entries in the M5 competition, and several top entries combined recursive and direct models.

**Tuning** (`tuning.py`). Four combinations of tree size and loss shape, each at four model sizes (200 to 1,000 trees), are compared on the tuning period. The best combination is used for both variants.

**Ensemble.** The average of the three most accurate models on the calibration periods. Averaging models that make different kinds of errors often beats each of them; this was a consistent finding of the M4 and M5 competitions. Members are chosen on the calibration periods so that the test periods stay untouched.

All forecasts below zero are set to zero.

## 5. Prediction ranges

A single number hides how uncertain a forecast is. Each forecast therefore comes with an 80% and a 95% range: if the ranges are well calibrated, actual sales should fall inside them 80% and 95% of the time.

**Method** (`evaluation.py`). For each model, product and cutoff, the pipeline collects the model's forecast errors on that product over the previous 16 weeks (four periods, 112 days). The range is the forecast plus the 10th and 90th percentiles of those errors for 80%, or the 2.5th and 97.5th percentiles for 95%. Only errors already known at the cutoff are used, so nothing from the future leaks in.

**Whole numbers.** Sales are whole numbers, so the range bounds are rounded to the nearest whole number. Without rounding, a range ending at 0.98 would exclude a sale of 1.

For slow sellers, ranges can only grow in whole-unit steps. A product that sells 0 or 1 unit on most days can only have a range of "0" or "0 to 1". If those cover 70% and 95% of days, no range can cover exactly 80%. This is why the 80% ranges contain more than 80% of actual sales.

The same method applies to all models, including the ensemble. This keeps their ranges comparable and means the ranges reflect each model's actual track record. The approach is a form of conformal prediction.

## 6. Accuracy metrics

All metrics are computed over the four test periods and the 500 scored products.

| Metric | Meaning | Better |
|---|---|---|
| WAPE | Total absolute error divided by total units sold | Lower |
| MASE | Average error relative to the seasonal naive model's typical error on that product's history; below 1 beats repeating last week | Lower |
| RMSE | Square root of the average squared error; penalises large misses more than WAPE | Lower |
| Bias | Total forecast minus total sales, as a share of sales; positive means over-forecasting | Closer to 0 |
| Coverage | Share of actual values inside the 80% or 95% range | Closer to 80% / 95% |
| WAPE on event days | WAPE on event days and the three days before them, compared with all other days | Lower |

WAPE values near 75% look high but are normal at this level of detail. For a product selling half a unit a day on average, most days are 0 or 1, and no model can predict which.

Flat-rate methods such as Croston can score well on WAPE for slow sellers while being of little use for planning, because they ignore the weekly pattern. WAPE and RMSE should be read together.

## 7. Inventory recommendation

A forecast is useful in supply chain when it drives a decision. The pipeline converts each forecast into a recommended stock level (`inventory.py`).

**Question answered.** An order placed today arrives in 7 days. How many units should be available to cover demand during those 7 days with 95% probability?

**Formula.**

```
expected demand = sum of the daily forecasts over the next 7 days
safety stock    = z × σ × √7
target stock    = expected demand + safety stock, rounded up to whole units
```

- `σ` is the standard deviation of the model's daily errors on that product over the previous 16 weeks (the same errors used for the ranges).
- `z` = 1.645 for a 95% service level (from the normal distribution).
- `√7` scales one day's uncertainty to seven days, assuming each day's error is independent of the others.

**Check.** For every product and test period, the pipeline compares the target stock with actual sales over the 7 days. The achieved service level is the share of cases with no stockout. If it is close to 95%, the recommendations are trustworthy. It also reports the dollar value of safety stock at shelf prices: a more accurate model needs less safety stock for the same service level, which ties forecast accuracy to money.

## 8. Known limitations

- **One store.** Results may differ for other stores.
- **No weather or economic data** (section 2).
- **Small tuning search.** Sixteen settings were compared, and the best was the largest model tested (255 leaves, 1,000 trees). A wider search might find better settings, at the cost of run time.
- **Normal approximation in the stock formula.** Daily sales of slow-moving products are small whole numbers and skewed, so the normal distribution is only an approximation. Simulating demand from each model's error distribution is a possible improvement.
- **Historical "future".** The data ends in 2016, so the "latest" forecast is also historical. That is what makes it possible to score it.

## Glossary

- **Cutoff:** the last date a model is allowed to see before forecasting.
- **Horizon:** how many days ahead the model forecasts (28 here).
- **Lead time:** the time between placing an order and receiving it.
- **Service level:** the probability of not running out of stock before the next delivery.
- **Safety stock:** extra stock held above expected demand to absorb forecast errors.
- **Global model:** one model trained across many products, as opposed to one model per product.
- **Ensemble:** a forecast made by averaging several models.
