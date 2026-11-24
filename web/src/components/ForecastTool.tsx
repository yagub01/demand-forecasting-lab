"use client";

import { useMemo, useRef, useState } from "react";
import { PERIOD_WORD, formatValue, pct, periodLabel, plural, shortDate, signedPct } from "@/lib/format";
import { buildSeries, detectColumns, distinctValues, parseCsv, type Series } from "@/lib/forecast/csv";
import { DEFAULT_HORIZON, runForecast, stockPlan, type ModelId, type ModelResult } from "@/lib/forecast/engine";
import { ForecastChart, type ChartPoint } from "./ForecastChart";

const SAMPLES = [
  { file: "grocery-fast-seller.csv", label: "Grocery item", detail: "daily, ~15 units a day" },
  { file: "household-slow-seller.csv", label: "Slow-selling item", detail: "daily, often zero" },
  { file: "store-weekly.csv", label: "Whole store", detail: "weekly totals" },
];
const MAX_BYTES = 20 * 1024 * 1024;
const SERVICE_LEVELS = [0.9, 0.95, 0.98, 0.99];
const DEFAULT_LEAD: Record<Series["frequency"], number> = { day: 7, week: 2, month: 1 };

interface Source {
  name: string;
  text: string;
  sample?: boolean;
}

/** How a forecast compares with the periods that were hidden from it. */
function compareWithActual(m: ModelResult, actual: number[]) {
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const actualTotal = sum(actual);
  const forecastTotal = sum(m.forecast);
  const absError = actual.reduce((s, v, i) => s + Math.abs(v - m.forecast[i]), 0);
  return {
    actualTotal,
    forecastTotal,
    totalGap: actualTotal ? (forecastTotal - actualTotal) / actualTotal : 0,
    wape: absError / (actual.reduce((s, v) => s + Math.abs(v), 0) || 1),
    in80: actual.filter((v, i) => v >= m.lo80[i] && v <= m.hi80[i]).length,
    in95: actual.filter((v, i) => v >= m.lo95[i] && v <= m.hi95[i]).length,
  };
}

interface Selection {
  dateCol?: number;
  valueCol?: number;
  groupCol?: number | null;
  group?: string | null;
  horizon?: number;
}

const field =
  "w-full rounded-xl border-2 border-ink bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-series-1";

export function ForecastTool() {
  const [source, setSource] = useState<Source | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [sel, setSel] = useState<Selection>({});
  const [chosenModel, setChosenModel] = useState<ModelId | null>(null);
  const [leadTime, setLeadTime] = useState<number | null>(null);
  const [serviceLevel, setServiceLevel] = useState(0.95);
  const [dragging, setDragging] = useState(false);
  const [check, setCheck] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  function load(next: Source) {
    setSource(next);
    setSel({});
    setChosenModel(null);
    setLeadTime(null);
    // Samples open in "check against reality" mode; your own files open as a real forecast.
    setCheck(!!next.sample);
    setLoadError(null);
    setLoading(null);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function loadFile(file: File) {
    if (file.size > MAX_BYTES) {
      setLoadError("That file is larger than 20 MB. Please aggregate it to daily, weekly or monthly totals first.");
      return;
    }
    load({ name: file.name, text: await file.text() });
  }

  async function loadSample(file: string) {
    setLoading(file);
    try {
      const res = await fetch(`/samples/${file}`);
      if (!res.ok) throw new Error();
      load({ name: file, text: await res.text(), sample: true });
    } catch {
      setLoading(null);
      setLoadError("Could not load the sample. Please try again.");
    }
  }

  // --- Derived state: table -> columns -> series -> forecast -------------------------
  const table = useMemo(() => (source ? parseCsv(source.text) : null), [source]);
  const cols = useMemo(() => (table ? detectColumns(table) : null), [table]);
  const dateCol = sel.dateCol ?? cols?.dateCols[0];
  const valueCol = sel.valueCol ?? cols?.numericCols.at(-1);
  const groupCol = sel.groupCol ?? null;
  const groups = useMemo(
    () => (table && groupCol != null ? distinctValues(table, groupCol) : []),
    [table, groupCol],
  );
  const group = sel.group ?? null;

  const built = useMemo(() => {
    if (!table || dateCol == null || valueCol == null) return null;
    return buildSeries(table, dateCol, valueCol, groupCol != null && group != null ? { col: groupCol, value: group } : undefined);
  }, [table, dateCol, valueCol, groupCol, group]);
  const series = built?.ok ? built.series : null;
  const horizon = sel.horizon ?? (series ? DEFAULT_HORIZON[series.frequency] : 0);
  // Check against reality: hide the last `horizon` periods, forecast them, compare.
  const canCheck = !!series && series.values.length >= 2 * horizon + 8;
  const checking = check && canCheck;
  const fitSeries = useMemo(
    () =>
      series && checking
        ? { ...series, dates: series.dates.slice(0, -horizon), values: series.values.slice(0, -horizon) }
        : series,
    [series, checking, horizon],
  );
  const hidden = useMemo(() => (checking && series ? series.values.slice(-horizon) : null), [checking, series, horizon]);
  const run = useMemo(() => (fitSeries ? runForecast(fitSeries, horizon) : null), [fitSeries, horizon]);
  const result = run?.ok ? run.result : null;

  const model: ModelResult | null = result
    ? (result.models.find((m) => m.id === chosenModel) ?? result.models[0])
    : null;
  const best = result?.models[0] ?? null;
  const baseline = result?.models.find((m) => m.id === "seasonal_naive") ?? null;
  const period = series?.frequency ?? "day";
  const lead = Math.min(horizon, leadTime ?? DEFAULT_LEAD[period]);
  const plan = model && series ? stockPlan(model, lead, serviceLevel, series.integer) : null;
  const zeroShare = series ? series.values.filter((v) => v === 0).length / series.values.length : 0;
  const reality = model && hidden ? compareWithActual(model, hidden) : null;
  const leadActual = hidden ? hidden.slice(0, lead).reduce((s, v) => s + v, 0) : null;

  const chart = useMemo(() => {
    if (!fitSeries || !result || !model) return null;
    const shown = Math.min(fitSeries.values.length, Math.max(3 * result.horizon, 2 * fitSeries.season, 24));
    const start = fitSeries.values.length - shown;
    const history: ChartPoint[] = fitSeries.dates
      .slice(start)
      .map((ds, i) => ({ ds, actual: fitSeries.values[start + i] }));
    const future: ChartPoint[] = result.dates.map((ds, i) => ({
      ds,
      actual: hidden ? hidden[i] : null,
      yhat: model.forecast[i],
      lo80: model.lo80[i],
      hi80: model.hi80[i],
      lo95: model.lo95[i],
      hi95: model.hi95[i],
    }));
    return { points: [...history, ...future], forecastStart: history.length };
  }, [fitSeries, result, model, hidden]);

  function downloadCsv() {
    if (!result || !model) return;
    const lines = ["date,forecast,lower_80,upper_80,lower_95,upper_95"];
    result.dates.forEach((d, i) =>
      lines.push([d, model.forecast[i], model.lo80[i], model.hi80[i], model.lo95[i], model.hi95[i]].map((v) => (typeof v === "number" ? +v.toFixed(3) : v)).join(",")),
    );
    const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `forecast-${(source?.name ?? "data").replace(/\.[^.]+$/, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const [one, many] = PERIOD_WORD[period];
  const dateText = (iso: string) => (period === "month" ? periodLabel(iso, "month") : shortDate(iso, true));

  return (
    <div>
      {/* ---------------- Upload ---------------- */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void loadFile(file);
        }}
        className={`card p-6 transition-colors sm:p-8 ${dragging ? "!bg-lavender" : ""}`}
      >
        <div className="flex flex-col items-center text-center">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden className="rounded-2xl border-2 border-ink bg-sun p-2 text-ink">
            <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="font-display mt-4 text-xl font-bold text-ink">Drop a CSV file here</p>
          <p className="mt-1 text-sm text-ink-2">
            One row per date with a quantity: daily, weekly or monthly. Extra columns such as a product name are fine.
          </p>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="btn btn-primary mt-5"
          >
            Choose a file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,.tsv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
              e.target.value = "";
            }}
          />
        </div>

        <div className="mt-7 border-t-2 border-dashed border-ink/20 pt-5">
          <p className="text-center text-xs font-medium uppercase tracking-wide text-muted">Or try a sample from Walmart data</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {SAMPLES.map((s) => (
              <button
                key={s.file}
                type="button"
                onClick={() => void loadSample(s.file)}
                className={`rounded-2xl border-2 border-ink px-3 py-2.5 text-left text-sm transition-transform hover:-translate-y-0.5 ${
                  source?.name === s.file ? "bg-lavender" : "bg-surface"
                }`}
              >
                <span className="font-medium text-ink">{loading === s.file ? "Loading…" : s.label}</span>
                <span className="block text-xs text-ink-2">{s.detail}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          Your file stays on your computer. Everything runs in your browser; nothing is uploaded.
        </p>
      </div>

      {loadError && <Notice tone="error">{loadError}</Notice>}

      {/* ---------------- Settings ---------------- */}
      <div ref={resultsRef} className="scroll-mt-20">
        {table && cols && (
          <section className="mt-10" aria-label="Data settings">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{source?.name}</h2>
              <span className="text-sm text-ink-2">{table.rows.length.toLocaleString("en-US")} rows</span>
            </div>
            {!cols.dateCols.length || !cols.numericCols.length ? (
              <Notice tone="error">
                The file needs a column of dates and a column of numbers. Found columns:{" "}
                {table.headers.join(", ") || "none"}.
              </Notice>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Label text="Date column">
                  <select className={field} value={dateCol} onChange={(e) => setSel({ ...sel, dateCol: Number(e.target.value) })}>
                    {cols.dateCols.map((c) => (
                      <option key={c} value={c}>
                        {table.headers[c] || `Column ${c + 1}`}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label text="Quantity to forecast">
                  <select className={field} value={valueCol} onChange={(e) => setSel({ ...sel, valueCol: Number(e.target.value) })}>
                    {cols.numericCols.map((c) => (
                      <option key={c} value={c}>
                        {table.headers[c] || `Column ${c + 1}`}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label text="Product or group">
                  <div className="flex gap-2">
                    <select
                      className={field}
                      value={groupCol ?? ""}
                      onChange={(e) =>
                        setSel({ ...sel, groupCol: e.target.value === "" ? null : Number(e.target.value), group: null })
                      }
                    >
                      <option value="">All rows combined</option>
                      {cols.textCols.map((c) => (
                        <option key={c} value={c}>
                          By {table.headers[c] || `column ${c + 1}`}
                        </option>
                      ))}
                    </select>
                    {groupCol != null && (
                      <select
                        className={field}
                        value={group ?? ""}
                        onChange={(e) => setSel({ ...sel, group: e.target.value || null })}
                        aria-label="Which one"
                      >
                        <option value="">All combined</option>
                        {groups.slice(0, 2000).map((g) => (
                          <option key={g.value} value={g.value}>
                            {g.value}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </Label>
                <Label text={`Forecast length${series ? ` (${many})` : ""}`}>
                  <input
                    type="number"
                    min={1}
                    max={series ? Math.max(1, Math.floor(series.values.length / 2)) : 365}
                    className={field}
                    value={horizon || ""}
                    onChange={(e) => setSel({ ...sel, horizon: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
                  />
                </Label>
              </div>
            )}
            {built && !built.ok && <Notice tone="error">{built.error}</Notice>}
            {run && !run.ok && <Notice tone="error">{run.error}</Notice>}
            {series && (
              <p className="mt-3 text-xs leading-relaxed text-ink-2">
                Read as <span className="font-medium text-ink">{plural(series.values.length, period)}</span> of{" "}
                {period === "day" ? "daily" : period === "week" ? "weekly" : "monthly"} data, {dateText(series.dates[0])} to {dateText(series.dates.at(-1)!)}.
                {series.filledGaps > 0 && ` ${plural(series.filledGaps, period)} with no rows were counted as zero.`}
                {series.mergedRows > 0 && ` ${series.mergedRows.toLocaleString("en-US")} rows sharing a ${one} were added together.`}
                {series.trimmed > 0 && ` Only the most recent ${plural(series.values.length, period)} are used.`}
              </p>
            )}
          </section>
        )}

        {/* ---------------- Results ---------------- */}
        {result && model && best && series && chart && plan && (
          <section className="mt-8" aria-label="Forecast results">
            <div className={`card mb-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5 ${checking ? "!bg-mint" : ""}`}>
              <button
                type="button"
                role="switch"
                aria-checked={checking}
                disabled={!canCheck}
                onClick={() => setCheck((c) => !c)}
                className={`relative h-8 w-14 shrink-0 rounded-full border-2 border-ink transition-colors disabled:opacity-40 ${
                  checking ? "bg-series-1" : "bg-surface"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full border-2 border-ink bg-sun transition-all ${checking ? "left-6" : "left-0.5"}`}
                />
                <span className="sr-only">Check against reality</span>
              </button>
              <div className="text-sm">
                <div className="font-display text-base font-bold text-ink">Check against reality</div>
                <div className="text-ink-2">
                  {canCheck
                    ? checking
                      ? `The last ${plural(horizon, period)} of your data are hidden from the methods, then compared with the forecast. Switch off to forecast the real future.`
                      : `Hide the last ${plural(horizon, period)} of your data, forecast them, and see how close the forecast gets.`
                    : `Needs at least ${plural(2 * horizon + 8, period)} of data.`}
                </div>
              </div>
            </div>

            {reality && hidden && (
              <div className="card mb-6 p-5 sm:p-6">
                <h3 className="text-xl font-bold">How close did {model.label} get?</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Verdict
                    tone={Math.abs(reality.totalGap) <= 0.1 ? "good" : Math.abs(reality.totalGap) <= 0.25 ? "ok" : "bad"}
                    value={`${reality.totalGap >= 0 ? "+" : "−"}${pct(Math.abs(reality.totalGap), 0)}`}
                    label={`Total over ${plural(horizon, period)}: forecast ${formatValue(reality.forecastTotal)}, actual ${formatValue(reality.actualTotal)}`}
                  />
                  <Verdict
                    tone={reality.in80 / horizon >= 0.7 ? "good" : reality.in80 / horizon >= 0.5 ? "ok" : "bad"}
                    value={`${reality.in80} of ${horizon}`}
                    label={`${many[0].toUpperCase()}${many.slice(1)} where the actual value fell inside the 80% range`}
                  />
                  <Verdict
                    tone={reality.in95 / horizon >= 0.85 ? "good" : reality.in95 / horizon >= 0.65 ? "ok" : "bad"}
                    value={`${reality.in95} of ${horizon}`}
                    label={`${many[0].toUpperCase()}${many.slice(1)} inside the 95% range`}
                  />
                </div>
                <p className="mt-4 text-sm leading-relaxed text-ink-2">
                  {one[0].toUpperCase() + one.slice(1)}-by-{one} error was {pct(reality.wape, 0)}. Totals over several {many}{" "}
                  are usually much closer than individual {many}, because ups and downs cancel out. That is why stock is planned
                  over the lead time rather than {one} by {one}.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Most accurate method" value={best.label} small />
              <Tile
                label="Error of the best method in testing"
                value={pct(best.wape, 0)}
                note={
                  baseline && baseline.id !== best.id
                    ? `${pct(1 - best.wape / baseline.wape, 0)} lower than repeating the last season`
                    : "Repeating the last season was hardest to beat"
                }
              />
              <Tile
                label={`Total forecast, ${checking ? "hidden" : "next"} ${plural(result.horizon, period)}`}
                value={formatValue(model.forecast.reduce((s, v) => s + v, 0))}
                note={`Sum of the ${many} forecast by ${model.label}`}
              />
              <Tile
                label={`Stock to cover the next ${plural(lead, period)}`}
                value={formatValue(plan.targetStock)}
                note={`${pct(serviceLevel, 0)} chance of not running out`}
              />
            </div>

            <div className="card mt-6 p-4 sm:p-6">
              <div className="mb-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Method shown">
                {result.models.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={m.id === model.id}
                    onClick={() => setChosenModel(m.id)}
                    className={`rounded-full border-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                      m.id === model.id
                        ? "border-ink bg-ink text-white"
                        : "border-ink/20 text-ink-2 hover:border-ink hover:text-ink"
                    }`}
                  >
                    {m.label}
                    {i === 0 && <span className={m.id === model.id ? "ml-1.5 text-sun" : "ml-1.5 text-good"}>★ best</span>}
                  </button>
                ))}
              </div>
              <ForecastChart
                points={chart.points}
                forecastStart={chart.forecastStart}
                forecastLabel={`Forecast: ${model.label}`}
                actualLabel={checking ? "Your data (hidden part shown for comparison)" : "Your data"}
                caption={`${model.description}`}
                period={period}
                description={`Your data with a ${plural(result.horizon, period)} forecast from ${model.label}, with 80% and 95% ranges.`}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={downloadCsv}
                  className="btn btn-secondary text-sm"
                >
                  Download forecast (CSV)
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
              <div className="card min-w-0 p-4 sm:p-6">
                <h3 className="text-lg font-bold">How each method did on your data</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">
                  Each method forecast your last {plural(result.testedPeriods, period)} in {result.windows}{" "}
                  {result.windows === 1 ? "step" : "steps"} of {plural(result.horizon, period)}, using only the data before each
                  step. Error is total miss as a share of the actual total; lower is better.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="tabular w-full text-sm">
                    <thead className="text-left text-ink-2">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Method</th>
                        <th className="px-3 py-2 text-right font-medium">Error</th>
                        <th className="px-3 py-2 text-right font-medium">Bias</th>
                        {hidden && <th className="px-3 py-2 text-right font-medium">On hidden {many}</th>}
                        <th className="hidden w-1/3 py-2 pl-3 font-medium sm:table-cell">
                          <span className="sr-only">Error bar</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.models.map((m, i) => (
                        <tr
                          key={m.id}
                          className={`cursor-pointer border-t border-line hover:bg-wash ${m.id === model.id ? "bg-wash" : ""}`}
                          onClick={() => setChosenModel(m.id)}
                        >
                          <td className={`py-2 pr-3 ${i === 0 ? "font-semibold" : ""}`}>{m.label}</td>
                          <td className="px-3 py-2 text-right">{pct(m.wape)}</td>
                          <td className="px-3 py-2 text-right text-ink-2">{signedPct(m.bias)}</td>
                          {hidden && <td className="px-3 py-2 text-right">{pct(compareWithActual(m, hidden).wape)}</td>}
                          <td className="hidden py-2 pl-3 sm:table-cell">
                            <div className="h-2 rounded-r bg-grid">
                              <div
                                className={`h-2 rounded-r ${i === 0 ? "bg-series-1" : "bg-deemph"}`}
                                style={{ width: `${Math.min(100, (m.wape / Math.max(...result.models.map((x) => x.wape))) * 100)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-2">
                  Bias: positive means the method forecast too much. The ensemble averages the{" "}
                  {result.ensembleMembers.length} best methods. Scores come from the same periods used to rank the methods,
                  so the winner&apos;s score is slightly optimistic.
                  {hidden && ` "On hidden ${many}" is each method's error on the part you hid: a fair, untouched test.`}
                  {zeroShare > 0.3 &&
                    ` ${pct(zeroShare, 0)} of your ${many} have zero sales. Errors above 100% are normal for data like this: no method can predict which ${many} will have a sale.`}
                </p>
              </div>

              <div className="card p-4 sm:p-6">
                <h3 className="text-lg font-bold">Stock recommendation</h3>
                <p className="mt-1 text-sm text-ink-2">How much to have on hand to cover demand until the next delivery.</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Label text={`Lead time (${many})`}>
                    <input
                      type="number"
                      min={1}
                      max={result.horizon}
                      className={field}
                      value={lead}
                      onChange={(e) => setLeadTime(Math.max(1, Math.min(result.horizon, Number(e.target.value) || 1)))}
                    />
                  </Label>
                  <Label text="Service level">
                    <select className={field} value={serviceLevel} onChange={(e) => setServiceLevel(Number(e.target.value))}>
                      {SERVICE_LEVELS.map((s) => (
                        <option key={s} value={s}>
                          {pct(s, 0)}
                        </option>
                      ))}
                    </select>
                  </Label>
                </div>
                <dl className="tabular mt-5 space-y-2 text-sm">
                  <Row label="Expected demand" value={formatValue(plan.expectedDemand)} />
                  <Row label="Safety stock" value={`+ ${formatValue(plan.safetyStock)}`} />
                  <div className="border-t border-line pt-2">
                    <Row label="Recommended stock" value={formatValue(plan.targetStock)} strong />
                  </div>
                  {leadActual != null && <Row label="Actually needed" value={formatValue(leadActual)} />}
                </dl>
                {leadActual != null && (
                  <p
                    className={`mt-3 rounded-xl border-2 border-ink px-3 py-2 text-sm font-medium ${
                      leadActual <= plan.targetStock ? "bg-mint" : "bg-pink"
                    }`}
                  >
                    {leadActual <= plan.targetStock ? "✓ Enough stock: it would have covered real demand." : "✕ Stock would have run out."}
                  </p>
                )}
                <p className="mt-4 text-xs leading-relaxed text-ink-2">
                  Based on {model.label}. Safety stock covers this method&apos;s typical error: {pct(serviceLevel, 0)} of the
                  time, demand over {plural(lead, period)} should not exceed the recommended stock.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-ink-2">
      <span className="mb-1 block">{text}</span>
      {children}
    </label>
  );
}

function Tile({ label, value, note, small = false }: { label: string; value: string; note?: string; small?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`font-display mt-1 font-bold text-ink ${small ? "text-lg leading-snug" : "text-3xl"}`}>{value}</div>
      {note && <div className="mt-1 text-xs text-ink-2">{note}</div>}
    </div>
  );
}

function Verdict({ tone, value, label }: { tone: "good" | "ok" | "bad"; value: string; label: string }) {
  const bg = tone === "good" ? "bg-mint" : tone === "ok" ? "bg-sun" : "bg-pink";
  const word = tone === "good" ? "Close" : tone === "ok" ? "Fair" : "Off";
  return (
    <div className={`rounded-2xl border-2 border-ink p-4 ${bg}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-ink">{word}</div>
      <div className="font-display mt-1 text-3xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-xs leading-snug text-ink-2">{label}</div>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className={strong ? "text-lg font-semibold text-ink" : "text-ink"}>{value}</dd>
    </div>
  );
}

function Notice({ tone, children }: { tone: "error" | "info"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`mt-4 flex gap-2 rounded-lg border px-4 py-3 text-sm ${
        tone === "error" ? "border-[color:var(--status-critical)]/40 text-ink" : "border-line text-ink-2"
      }`}
    >
      {tone === "error" && (
        <span aria-hidden className="font-bold" style={{ color: "var(--status-critical)" }}>
          !
        </span>
      )}
      <span>{children}</span>
    </div>
  );
}
