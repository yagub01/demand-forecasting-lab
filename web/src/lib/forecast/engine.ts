/**
 * Test every method on the most recent part of the history, rank them, build an ensemble,
 * and produce the final forecast with 80% and 95% ranges.
 *
 * Testing: the history is cut at up to four points, each one `horizon` periods apart.
 * At each cut, every method sees only the data before it and forecasts the next
 * `horizon` periods, which are compared with what actually happened.
 */

import { futureDates, type Series } from "./csv.ts";
import { METHODS, type MethodId } from "./models.ts";

export type ModelId = MethodId | "ensemble";

export interface ModelResult {
  id: ModelId;
  label: string;
  description: string;
  wape: number; // total absolute error / total actual, over the test periods
  bias: number; // (total forecast - total actual) / total actual
  sigma: number; // spread (standard deviation) of the test errors
  forecast: number[];
  lo80: number[];
  hi80: number[];
  lo95: number[];
  hi95: number[];
}

export interface ForecastResult {
  horizon: number;
  windows: number; // number of test cuts
  testedPeriods: number;
  dates: string[]; // forecast dates
  models: ModelResult[]; // best first
  ensembleMembers: ModelId[];
}

export type RunResult = { ok: true; result: ForecastResult } | { ok: false; error: string };

export const DEFAULT_HORIZON: Record<Series["frequency"], number> = { day: 28, week: 13, month: 12 };
const MAX_WINDOWS = 4;
const ENSEMBLE_SIZE = 3;

export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function std(a: number[]): number {
  if (a.length < 2) return 0;
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

export function runForecast(series: Series, horizon: number): RunResult {
  const y = series.values;
  const n = y.length;
  const m = series.season;
  const minTrain = Math.max(8, Math.min(2 * m + 2, n - horizon));
  const windows = Math.min(MAX_WINDOWS, Math.floor((n - minTrain) / horizon));
  if (windows < 1) {
    return {
      ok: false,
      error: `Not enough history to test a ${horizon}-period forecast. Provide at least ${horizon + 8} periods, or shorten the forecast.`,
    };
  }
  const firstCut = n - windows * horizon;
  const methods = METHODS.filter((meth) => firstCut >= meth.minLength(m));
  const clean = (v: number) => (series.nonNegative ? Math.max(0, v) : v);

  // Test forecasts at each cut.
  const tested = new Map<ModelId, number[]>();
  for (const meth of methods) {
    const preds: number[] = [];
    for (let w = 0; w < windows; w++) {
      const cut = firstCut + w * horizon;
      preds.push(...meth.forecast(y.slice(0, cut), horizon, m).map(clean));
    }
    tested.set(meth.id, preds);
  }
  const actual = y.slice(firstCut);
  const totalActual = actual.reduce((s, v) => s + Math.abs(v), 0) || 1;
  const score = (preds: number[]) => {
    const errors = actual.map((v, i) => v - preds[i]);
    return {
      errors,
      wape: errors.reduce((s, e) => s + Math.abs(e), 0) / totalActual,
      bias: -errors.reduce((s, e) => s + e, 0) / totalActual,
    };
  };

  // Ensemble: average of the best-scoring methods.
  const ranked = methods.map((meth) => ({ id: meth.id, ...score(tested.get(meth.id)!) })).sort((a, b) => a.wape - b.wape);
  const members = ranked.slice(0, Math.min(ENSEMBLE_SIZE, ranked.length)).map((r) => r.id);
  const average = (rows: number[][]) => rows[0].map((_, i) => rows.reduce((s, r) => s + r[i], 0) / rows.length);
  if (members.length >= 2) tested.set("ensemble", average(members.map((id) => tested.get(id)!)));

  // Final forecasts on the full history.
  const final = new Map<ModelId, number[]>();
  for (const meth of methods) final.set(meth.id, meth.forecast(y, horizon, m).map(clean));
  if (members.length >= 2) final.set("ensemble", average(members.map((id) => final.get(id)!)));

  const round = (v: number) => (series.integer ? Math.round(v) : v);
  const models: ModelResult[] = [...tested.keys()].map((id) => {
    const meth = METHODS.find((x) => x.id === id);
    const { errors, wape, bias } = score(tested.get(id)!);
    const sorted = [...errors].sort((a, b) => a - b);
    const fc = final.get(id)!;
    const band = (p: number) => fc.map((v) => clean(round(v + quantile(sorted, p))));
    return {
      id,
      label: meth?.label ?? "Ensemble",
      description:
        meth?.description ??
        `Average of the ${members.length} methods that tested best: ${members
          .map((x) => METHODS.find((mm) => mm.id === x)!.label)
          .join(", ")}.`,
      wape,
      bias,
      sigma: std(errors),
      forecast: fc,
      lo80: band(0.1),
      hi80: band(0.9),
      lo95: band(0.025),
      hi95: band(0.975),
    };
  });
  models.sort((a, b) => a.wape - b.wape);

  return {
    ok: true,
    result: {
      horizon,
      windows,
      testedPeriods: windows * horizon,
      dates: futureDates(series, horizon),
      models,
      ensembleMembers: members,
    },
  };
}

export const Z_SCORES: Record<string, number> = { "0.9": 1.2816, "0.95": 1.6449, "0.98": 2.0537, "0.99": 2.3263 };

export interface StockPlan {
  expectedDemand: number;
  safetyStock: number;
  targetStock: number;
}

/**
 * Stock needed to cover demand over the lead time with the chosen probability:
 * expected demand + z x sigma x sqrt(lead time).
 */
export function stockPlan(model: ModelResult, leadTime: number, serviceLevel: number, integer: boolean): StockPlan {
  const z = Z_SCORES[String(serviceLevel)] ?? 1.6449;
  const expectedDemand = model.forecast.slice(0, leadTime).reduce((s, v) => s + v, 0);
  const safetyStock = z * model.sigma * Math.sqrt(leadTime);
  const target = expectedDemand + safetyStock;
  return { expectedDemand, safetyStock, targetStock: integer ? Math.ceil(target) : target };
}
