"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, num, pct, shortDate } from "@/lib/format";
import { MODEL_LABELS, MODEL_NOTES, type ModelId } from "@/lib/models";
import type { Product, Series } from "@/lib/retail";
import { ForecastChart, type ChartPoint } from "./ForecastChart";

interface Props {
  products: Product[];
  models: ModelId[];
  baseline: ModelId;
  defaultProduct: string;
  leadTimeDays: number;
  serviceLevel: number;
}

const CATEGORIES: Record<string, string> = { FOODS: "Food", HOUSEHOLD: "Household", HOBBIES: "Hobbies" };
const HISTORY_OPTIONS = [
  { days: 56, label: "Last 8 weeks" },
  { days: 182, label: "Last 26 weeks" },
];

type Loaded = { id: string; series: Series | null; failed: boolean };

const selectClass =
  "w-full rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-series-1";

export function ProductExplorer({ products, models, baseline, defaultProduct, leadTimeDays, serviceLevel }: Props) {
  const [category, setCategory] = useState("all");
  const [productId, setProductId] = useState(defaultProduct);
  const [model, setModel] = useState<ModelId>(models[0]);
  const [historyDays, setHistoryDays] = useState(HISTORY_OPTIONS[0].days);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const list = useMemo(
    () =>
      products
        .filter((p) => category === "all" || p.category === category)
        .sort((a, b) => b.avg_daily_units - a.avg_daily_units),
    [products, category],
  );
  const product = products.find((p) => p.id === productId)!;

  useEffect(() => {
    let cancelled = false;
    fetch(`/data/retail/series/${encodeURIComponent(productId)}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Series>;
      })
      .then((series) => !cancelled && setLoaded({ id: productId, series, failed: false }))
      .catch(() => !cancelled && setLoaded({ id: productId, series: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // While a new product loads, the previous chart stays on screen, dimmed.
  const loading = loaded?.id !== productId;
  const series = loaded?.series ?? null;

  const chart = useMemo(() => {
    if (!series) return null;
    const f = series.forecasts[model];
    const start = Math.max(0, series.history.ds.length - historyDays);
    const history: ChartPoint[] = series.history.ds.slice(start).map((ds, i) => ({ ds, actual: series.history.y[start + i] }));
    const future: ChartPoint[] = series.actual.ds.map((ds, i) => ({
      ds,
      actual: series.actual.y[i],
      yhat: f.yhat[i],
      lo80: f.lo_80[i],
      hi80: f.hi_80[i],
      lo95: f.lo_95[i],
      hi95: f.hi_95[i],
    }));
    return { points: [...history, ...future], forecastStart: history.length };
  }, [series, model, historyDays]);

  function chooseCategory(next: string) {
    setCategory(next);
    const visible = products.filter((p) => next === "all" || p.category === next);
    if (!visible.some((p) => p.id === productId)) {
      setProductId(visible.sort((a, b) => b.avg_daily_units - a.avg_daily_units)[0].id);
    }
  }

  function chooseRandom() {
    setProductId(list[Math.floor(Math.random() * list.length)].id);
  }

  const stock = series?.inventory[model];
  const leadStart = series ? addDays(series.cutoff, 1) : null;
  const leadEnd = series ? addDays(series.cutoff, leadTimeDays) : null;

  return (
    <div>
      {/* One filter row scopes everything below it. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_1fr_13rem_10rem]">
        <label className="text-xs text-ink-2">
          Category
          <select className={`${selectClass} mt-1`} value={category} onChange={(e) => chooseCategory(e.target.value)}>
            <option value="all">All categories</option>
            {Object.entries(CATEGORIES).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs text-ink-2">
          <label htmlFor="product">Product (sorted by average daily sales)</label>
          <div className="mt-1 flex gap-2">
            <select id="product" className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {num(p.avg_daily_units, 1)} units/day
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={chooseRandom}
              className="shrink-0 rounded border border-line px-2 text-sm text-ink hover:bg-wash"
            >
              Random
            </button>
          </div>
        </div>
        <label className="text-xs text-ink-2">
          Model
          <select className={`${selectClass} mt-1`} value={model} onChange={(e) => setModel(e.target.value as ModelId)}>
            {models.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-2">
          History shown
          <select className={`${selectClass} mt-1`} value={historyDays} onChange={(e) => setHistoryDays(Number(e.target.value))}>
            {HISTORY_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs text-ink-2">
        <span className="font-medium text-ink">{MODEL_LABELS[model]}:</span> {MODEL_NOTES[model]}
      </p>

      <div className={`mt-5 grid gap-5 lg:grid-cols-[1fr_17rem] ${loading ? "opacity-60" : ""} transition-opacity`}>
        <div className="min-w-0 rounded-lg border border-line bg-surface p-4">
          <h3 className="text-sm font-semibold">
            {product.id}: forecast for the 28 days after {series ? shortDate(series.cutoff, true) : "…"}
          </h3>
          <p className="mb-4 mt-1 text-xs text-ink-2">
            The model only saw sales up to the forecast start. Everything to the right is compared with what actually
            sold.
          </p>
          {loaded?.failed && loaded.id === productId ? (
            <p className="py-16 text-center text-sm text-ink-2">Could not load this product&apos;s forecast.</p>
          ) : chart ? (
            <ForecastChart
              points={chart.points}
              forecastStart={chart.forecastStart}
              forecastLabel={MODEL_LABELS[model]}
              description={`Daily unit sales of ${product.id} with the ${MODEL_LABELS[model]} forecast and its 80% and 95% ranges.`}
            />
          ) : (
            <div style={{ height: 360 }} />
          )}
        </div>

        <div className="flex flex-col gap-5">
          <section className="rounded-lg border border-line bg-surface p-4" aria-label="Stock recommendation">
            <h3 className="text-sm font-semibold">Stock recommendation</h3>
            <p className="mt-1 text-xs text-ink-2">
              Units needed to cover {leadStart ? `${shortDate(leadStart)}–${shortDate(leadEnd!)}` : "the next week"} (
              {leadTimeDays}-day lead time) with {pct(serviceLevel, 0)} probability.
            </p>
            {stock ? (
              <>
                <dl className="tabular mt-3 space-y-1.5 text-sm">
                  <Row label="Expected demand" value={`${num(stock.expected_demand, 1)} units`} />
                  <Row label="Safety stock" value={`+ ${num(stock.safety_stock, 1)} units`} />
                  <div className="border-t border-line pt-1.5">
                    <Row label="Recommended stock" value={`${num(stock.target_stock, 0)} units`} strong />
                  </div>
                  <Row label="Actually sold" value={`${num(stock.actual_demand, 0)} units`} />
                </dl>
                <p className="mt-3 flex items-center gap-2 text-sm">
                  {stock.stockout ? (
                    <>
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs text-white"
                        style={{ background: "var(--status-critical)" }}
                        aria-hidden
                      >
                        ✕
                      </span>
                      <span>Stock would have run out</span>
                    </>
                  ) : (
                    <>
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs text-white"
                        style={{ background: "var(--status-good)" }}
                        aria-hidden
                      >
                        ✓
                      </span>
                      <span>Enough stock</span>
                    </>
                  )}
                </p>
              </>
            ) : (
              <div className="h-40" />
            )}
          </section>

          <section className="rounded-lg border border-line bg-surface p-4" aria-label="Product details">
            <h3 className="text-sm font-semibold">About this product</h3>
            <dl className="tabular mt-3 space-y-1.5 text-sm">
              <Row label="Department" value={product.dept.replace("_", " ")} />
              <Row label="Average sales" value={`${num(product.avg_daily_units, 1)} units/day`} />
              <Row label="Days with no sales" value={pct(product.zero_share, 0)} />
              <Row label={`Error, ${MODEL_LABELS[model]}`} value={pct(product.wape[model], 0)} />
              {model !== baseline && <Row label={`Error, ${MODEL_LABELS[baseline]}`} value={pct(product.wape[baseline], 0)} />}
            </dl>
            <p className="mt-3 text-xs text-ink-2">Error (WAPE) and averages cover all four test periods.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className={strong ? "font-semibold text-ink" : "text-ink"}>{value}</dd>
    </div>
  );
}
