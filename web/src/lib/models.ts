/** Model names and descriptions. Kept separate from the data so browser code can import it cheaply. */

export type ModelId =
  | "Ensemble"
  | "LightGBM_direct"
  | "AutoETS"
  | "TSB"
  | "LightGBM_recursive"
  | "CrostonSBA"
  | "SeasonalNaive";

export const MODEL_LABELS: Record<ModelId, string> = {
  Ensemble: "Ensemble",
  LightGBM_direct: "LightGBM, direct",
  AutoETS: "AutoETS",
  TSB: "TSB",
  LightGBM_recursive: "LightGBM, recursive",
  CrostonSBA: "Croston (SBA)",
  SeasonalNaive: "Seasonal naive",
};

export const MODEL_NOTES: Record<ModelId, string> = {
  Ensemble: "Average of the three most accurate models on the calibration periods.",
  LightGBM_direct:
    "Machine-learning model trained on all 2,872 products; uses only sales from 28 or more days earlier.",
  AutoETS: "Exponential smoothing with a weekly pattern, fitted to each product.",
  TSB: "Method for slow sellers: forecasts how often sales happen and how large they are.",
  LightGBM_recursive:
    "Machine-learning model that also uses recent days, feeding its own predictions back in.",
  CrostonSBA: "Classic method for slow sellers with many zero-sales days.",
  SeasonalNaive: "Baseline: each day repeats the same weekday of the last week.",
};
