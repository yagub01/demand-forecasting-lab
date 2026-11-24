// Run with: npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildSeries, detectColumns, parseCsv, parseNumber, type Series } from "./csv.ts";
import { quantile, runForecast, stockPlan } from "./engine.ts";
import { croston, holtWinters, seasonalAverage, seasonalNaive } from "./models.ts";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test("parses quoted fields, semicolons and number formats", () => {
  const t = parseCsv('day;"product name";qty\r\n2024-01-01;"Soap, large";3\n2024-01-02;Soap;"1,250"\n');
  assert.deepEqual(t.headers, ["day", "product name", "qty"]);
  assert.deepEqual(t.rows[0], ["2024-01-01", "Soap, large", "3"]);
  assert.equal(parseNumber("1,250"), 1250);
  assert.equal(parseNumber("12,5"), 12.5);
  assert.equal(parseNumber("$3.10"), 3.1);
  assert.equal(parseNumber("abc"), null);
});

test("detects date, number and text columns", () => {
  const t = parseCsv("date,store,units\n03/15/2024,A,4\n03/16/2024,A,5\n03/17/2024,B,6\n");
  assert.deepEqual(detectColumns(t), { dateCols: [0], numericCols: [2], textCols: [1] });
});

test("builds a daily series: sums duplicate dates, fills gaps with zero, filters a product", () => {
  const t = parseCsv("date,sku,units\n2024-01-01,A,2\n2024-01-01,A,3\n2024-01-03,A,1\n2024-01-02,B,9\n");
  const r = buildSeries(t, 0, 2, { col: 1, value: "A" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.series.values, [5, 0, 1]);
  assert.deepEqual(r.series.dates, ["2024-01-01", "2024-01-02", "2024-01-03"]);
  assert.equal(r.series.filledGaps, 1);
  assert.equal(r.series.mergedRows, 1);
  assert.equal(r.series.frequency, "day");
});

test("recognizes weekly and monthly data", () => {
  const weekly = buildSeries(parseCsv("w,v\n2024-01-07,1\n2024-01-14,2\n2024-01-28,3\n"), 0, 1);
  assert.ok(weekly.ok && weekly.series.frequency === "week" && weekly.series.values.join() === "1,2,0,3");
  const monthly = buildSeries(parseCsv("m,v\n2023-11,5\n2023-12,6\n2024-01,7\n"), 0, 1);
  assert.ok(monthly.ok && monthly.series.frequency === "month" && monthly.series.season === 12);
  if (monthly.ok) assert.deepEqual(monthly.series.dates, ["2023-11-01", "2023-12-01", "2024-01-01"]);
});

test("simple methods produce the expected numbers", () => {
  const y = [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16, 17];
  assert.deepEqual(seasonalNaive(y, 9, 7), [11, 12, 13, 14, 15, 16, 17, 11, 12]);
  assert.deepEqual(seasonalAverage(y, 2, 7), [6, 7]);
  // Sales of 4 every 2nd period: rate 2 per period, times the SBA factor (1 - 0.1 / 2).
  near(croston([0, 4, 0, 4, 0, 4, 0, 4], 1)[0], 2 * 0.95);
});

test("Holt-Winters reproduces a clean seasonal pattern with a trend", () => {
  const pattern = [5, 9, 7, 3, 1, 2, 8];
  const y = Array.from({ length: 70 }, (_, t) => 50 + 0.5 * t + pattern[t % 7]);
  const fc = holtWinters(y, 7, 7);
  const truth = Array.from({ length: 7 }, (_, i) => 50 + 0.5 * (70 + i) + pattern[(70 + i) % 7]);
  fc.forEach((v, i) => near(v, truth[i], 1.5));
});

function sampleSeries(name: string): Series {
  const t = parseCsv(readFileSync(new URL(`../../../public/samples/${name}`, import.meta.url), "utf8"));
  const r = buildSeries(t, 0, 1);
  if (!r.ok) throw new Error(r.error);
  return r.series;
}

test("full run on the sample files: ranges contain the forecast, ensemble is built", () => {
  for (const [file, horizon] of [["grocery-fast-seller.csv", 28], ["household-slow-seller.csv", 28], ["store-weekly.csv", 13]] as const) {
    const series = sampleSeries(file);
    const run = runForecast(series, horizon);
    assert.ok(run.ok, file);
    if (!run.ok) continue;
    const { models, windows } = run.result;
    assert.equal(windows, 4);
    assert.ok(models.some((m) => m.id === "ensemble"));
    for (const m of models) {
      assert.equal(m.forecast.length, horizon);
      m.forecast.forEach((v, i) => {
        assert.ok(m.lo95[i] <= m.lo80[i] && m.lo80[i] <= m.hi80[i] && m.hi80[i] <= m.hi95[i], `${file} ${m.id}`);
        assert.ok(v >= 0);
      });
      assert.ok(Number.isFinite(m.wape));
    }
    // The best method is at least as accurate as the baseline (the baseline itself may win).
    const baseline = models.find((m) => m.id === "seasonal_naive")!;
    assert.ok(models[0].wape <= baseline.wape, `${file}: best ${models[0].wape} vs baseline ${baseline.wape}`);
  }
});

test("too little history gives a clear error", () => {
  const r = buildSeries(parseCsv("d,v\n2024-01-01,1\n2024-01-02,2\n2024-01-03,3\n"), 0, 1);
  assert.ok(r.ok);
  if (r.ok) assert.equal(runForecast(r.series, 28).ok, false);
});

test("stock plan: expected demand plus z x sigma x sqrt(lead time), rounded up", () => {
  const model = { forecast: [5, 5, 5, 5, 5], sigma: 2 } as Parameters<typeof stockPlan>[0];
  const plan = stockPlan(model, 4, 0.95, true);
  near(plan.expectedDemand, 20);
  near(plan.safetyStock, 1.6449 * 2 * 2);
  assert.equal(plan.targetStock, 27);
  near(quantile([1, 2, 3, 4], 0.5), 2.5);
});
