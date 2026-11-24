/**
 * Forecasting methods, written to run quickly in the browser.
 * Each takes the history `y`, the number of periods to forecast `h` and the season length `m`.
 */

export type MethodId = "seasonal_naive" | "seasonal_average" | "holt_winters" | "ses" | "croston";

export interface Method {
  id: MethodId;
  label: string;
  description: string;
  /** Shortest history the method needs. */
  minLength: (m: number) => number;
  forecast: (y: number[], h: number, m: number) => number[];
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

export function seasonalNaive(y: number[], h: number, m: number): number[] {
  const n = y.length;
  if (n < m) return new Array(h).fill(y[n - 1]);
  return Array.from({ length: h }, (_, i) => y[n - m + (i % m)]);
}

/** Average of the same point in each of the last (up to) four seasons. */
export function seasonalAverage(y: number[], h: number, m: number): number[] {
  const n = y.length;
  const k = Math.min(4, Math.floor(n / m));
  return Array.from({ length: h }, (_, i) => {
    let s = 0;
    for (let j = 1; j <= k; j++) s += y[n - j * m + (i % m)];
    return s / k;
  });
}

/** Simple exponential smoothing; the smoothing weight is chosen by one-step-ahead error. */
export function ses(y: number[], h: number): number[] {
  let best = { sse: Infinity, level: y[0] };
  for (let a = 0.01; a < 1; a += 0.01) {
    let level = y[0];
    let sse = 0;
    for (let t = 1; t < y.length; t++) {
      const e = y[t] - level;
      sse += e * e;
      level += a * e;
    }
    if (sse < best.sse) best = { sse, level };
  }
  return new Array(h).fill(best.level);
}

interface HwParams {
  a: number; // level
  b: number; // trend
  g: number; // season
  phi: number; // trend damping
}

function holtWintersRun(y: number[], m: number, p: HwParams) {
  let level = mean(y.slice(0, m));
  let trend = y.length >= 2 * m ? (mean(y.slice(m, 2 * m)) - level) / m : 0;
  const season = y.slice(0, m).map((v) => v - level);
  let sse = 0;
  for (let t = m; t < y.length; t++) {
    const s = season[t % m];
    const e = y[t] - (level + p.phi * trend + s);
    sse += e * e;
    const newLevel = p.a * (y[t] - s) + (1 - p.a) * (level + p.phi * trend);
    trend = p.b * (newLevel - level) + (1 - p.b) * p.phi * trend;
    season[t % m] = p.g * (y[t] - newLevel) + (1 - p.g) * s;
    level = newLevel;
  }
  return { sse, level, trend, season };
}

function holtWintersForecast(y: number[], h: number, m: number, p: HwParams): number[] {
  const { level, trend, season } = holtWintersRun(y, m, p);
  let damp = 0;
  return Array.from({ length: h }, (_, i) => {
    damp += p.phi ** (i + 1);
    return level + damp * trend + season[(y.length + i) % m];
  });
}

/**
 * Additive Holt-Winters with a damped trend: level, trend and seasonal pattern, each
 * updated with its own weight.
 *
 * The weights are chosen by how well they forecast `h` periods ahead on the last two
 * stretches of the history, not by one-step-ahead fit. One-step fit favours weights that
 * react strongly to every movement, which forecasts poorly several weeks out.
 */
export function holtWinters(y: number[], h: number, m: number): number[] {
  const checks = [2, 1].filter((k) => y.length - k * h >= 2 * m + 2);
  let best: HwParams = { a: 0.05, b: 0, g: 0.05, phi: 0.9 };
  if (checks.length) {
    let bestErr = Infinity;
    for (const a of [0.02, 0.05, 0.1, 0.2, 0.35])
      for (const b of [0, 0.01, 0.05])
        for (const g of [0.02, 0.05, 0.1, 0.2])
          for (const phi of [0.8, 0.9, 0.98]) {
            const p = { a, b, g, phi };
            let err = 0;
            for (const k of checks) {
              const cut = y.length - k * h;
              const fc = holtWintersForecast(y.slice(0, cut), h, m, p);
              for (let i = 0; i < h; i++) err += Math.abs(y[cut + i] - fc[i]);
            }
            if (err < bestErr) [bestErr, best] = [err, p];
          }
  }
  return holtWintersForecast(y, h, m, best);
}

/** Croston's method with the SBA correction, for products that often sell nothing. */
export function croston(y: number[], h: number): number[] {
  const alpha = 0.1;
  let size: number | null = null;
  let interval = 1;
  let sinceLast = 1;
  for (const v of y) {
    if (v > 0) {
      if (size == null) {
        size = v;
        interval = sinceLast;
      } else {
        size += alpha * (v - size);
        interval += alpha * (sinceLast - interval);
      }
      sinceLast = 1;
    } else {
      sinceLast++;
    }
  }
  const rate = size == null ? 0 : (1 - alpha / 2) * (size / interval);
  return new Array(h).fill(rate);
}

export const METHODS: Method[] = [
  {
    id: "holt_winters",
    label: "Exponential smoothing (Holt-Winters)",
    description: "Tracks level, trend and the seasonal pattern, giving more weight to recent periods.",
    minLength: (m) => 2 * m + 2,
    forecast: holtWinters,
  },
  {
    id: "seasonal_average",
    label: "Seasonal average",
    description: "Average of the same point in each of the last four seasons, e.g. the last four Mondays.",
    minLength: (m) => m,
    forecast: seasonalAverage,
  },
  {
    id: "ses",
    label: "Simple exponential smoothing",
    description: "A weighted average of recent periods, with no trend or seasonal pattern.",
    minLength: () => 4,
    forecast: (y, h) => ses(y, h),
  },
  {
    id: "croston",
    label: "Croston (SBA)",
    description: "For slow sellers: forecasts how large sales are and how often they happen, separately.",
    minLength: () => 4,
    forecast: (y, h) => croston(y, h),
  },
  {
    id: "seasonal_naive",
    label: "Seasonal naive (baseline)",
    description: "Repeats the last season, e.g. last week's sales for each weekday. The reference point.",
    minLength: () => 2,
    forecast: seasonalNaive,
  },
];
