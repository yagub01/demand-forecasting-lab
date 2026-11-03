/**
 * Retail results produced by the Python pipeline (pipeline/forecast_lab/export.py).
 * summary.json and products.json are read at build time; each product's forecast file
 * (series/<id>.json) is fetched in the browser when that product is opened.
 */
import eventFeaturesJson from "@data/retail/event_features.json";
import productsJson from "@data/retail/products.json";
import summaryJson from "@data/retail/summary.json";
import type { ModelId } from "./models";

export { MODEL_LABELS, MODEL_NOTES, type ModelId } from "./models";

export interface Metric {
  model: ModelId;
  wape: number;
  mase: number;
  rmse: number;
  bias: number;
  coverage_80: number;
  coverage_95: number;
  wape_event_days: number;
  wape_other_days: number;
}

export interface InventoryRow {
  model: ModelId;
  achieved_service_level: number;
  avg_safety_stock_units: number;
  safety_stock_value_per_cutoff: number;
}

export interface Summary {
  dataset: {
    name: string;
    store_id: string;
    n_products: number;
    first_date: string;
    last_date: string;
    scored_cutoffs: string[];
  };
  config: {
    horizon: number;
    n_windows: number;
    calibration_windows: number;
    tuning_windows: number;
    lead_time_days: number;
    service_level: number;
    ensemble_size: number;
    event_lead_days: number;
  };
  tuning: { chosen: Record<string, number>; period_end: string };
  ensemble: { members: ModelId[]; calibration_wape: Record<string, number> };
  metrics: Metric[];
  inventory: InventoryRow[];
}

export interface Product {
  id: string;
  dept: string;
  category: string;
  avg_daily_units: number;
  zero_share: number;
  wape: Record<string, number | null>;
  mase: Record<string, number | null>;
}

export interface ModelForecast {
  yhat: number[];
  lo_80: number[];
  hi_80: number[];
  lo_95: number[];
  hi_95: number[];
}

export interface StockRecommendation {
  expected_demand: number;
  safety_stock: number;
  target_stock: number;
  actual_demand: number;
  stockout: boolean;
}

export interface Series {
  id: string;
  cutoff: string;
  history: { ds: string[]; y: number[] };
  actual: { ds: string[]; y: number[] };
  forecasts: Record<string, ModelForecast>;
  inventory: Record<string, StockRecommendation>;
}

export interface EventFeatureCheck {
  model: ModelId;
  with_event_features: { wape: number; wape_event_days: number; wape_other_days: number };
  without_event_features: { wape: number; wape_event_days: number; wape_other_days: number };
}

export const summary = summaryJson as unknown as Summary;
export const products = productsJson as unknown as Product[];
export const eventFeatures = eventFeaturesJson as unknown as EventFeatureCheck;

/** Models ordered from most to least accurate on the test periods. */
export const MODEL_ORDER: ModelId[] = [...summary.metrics].sort((a, b) => a.wape - b.wape).map((m) => m.model);

export const BASELINE: ModelId = "SeasonalNaive";
export const BEST: ModelId = MODEL_ORDER[0];

export function metricFor(model: ModelId): Metric {
  return summary.metrics.find((m) => m.model === model)!;
}

export function inventoryFor(model: ModelId): InventoryRow {
  return summary.inventory.find((m) => m.model === model)!;
}

/** Start and end dates of each stage of the backtest timeline. */
export function timeline() {
  const { horizon, n_windows, calibration_windows, tuning_windows } = summary.config;
  const day = 86_400_000;
  const end = Date.parse(`${summary.dataset.last_date}T00:00:00Z`);
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const stage = (startOffsetPeriods: number, periods: number) => {
    const startCut = end - startOffsetPeriods * horizon * day;
    return { start: iso(startCut + day), end: iso(startCut + periods * horizon * day), days: periods * horizon };
  };
  const total = tuning_windows + calibration_windows + n_windows;
  return {
    tuning: stage(total, tuning_windows),
    calibration: stage(calibration_windows + n_windows, calibration_windows),
    test: stage(n_windows, n_windows),
  };
}
