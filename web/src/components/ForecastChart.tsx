"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { num, shortDate, weekday } from "@/lib/format";

export interface ChartPoint {
  ds: string;
  actual: number | null;
  yhat?: number;
  lo80?: number;
  hi80?: number;
  lo95?: number;
  hi95?: number;
}

interface Props {
  points: ChartPoint[];
  /** Index of the first forecast day in `points`. */
  forecastStart: number;
  forecastLabel: string;
  description: string;
}

const HEIGHT = 300; // includes the x-axis band
const MARGIN = { top: 16, right: 12, bottom: 28, left: 36 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A tick step of 1, 2 or 5 x 10^k giving about `count` ticks; at least 1 (sales are whole units). */
function niceStep(max: number, count = 4): number {
  const raw = Math.max(max, 1) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const n = raw / power;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power;
  return Math.max(1, step);
}

function linePath(values: (number | null | undefined)[], x: (i: number) => number, y: (v: number) => number) {
  let d = "";
  let drawing = false;
  values.forEach((v, i) => {
    if (v == null) {
      drawing = false;
      return;
    }
    d += `${drawing ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    drawing = true;
  });
  return d;
}

function bandPath(lo: number[], hi: number[], start: number, x: (i: number) => number, y: (v: number) => number) {
  if (!lo.length) return "";
  const upper = hi.map((v, i) => `${x(start + i).toFixed(1)},${y(v).toFixed(1)}`);
  const lower = lo.map((v, i) => `${x(start + i).toFixed(1)},${y(v).toFixed(1)}`).reverse();
  return `M${upper.join("L")}L${lower.join("L")}Z`;
}

export function ForecastChart({ points, forecastStart, forecastLabel, description }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const n = points.length;

  const { yMax, step } = useMemo(() => {
    const max = Math.max(1, ...points.map((p) => Math.max(p.actual ?? 0, p.hi95 ?? 0)));
    const s = niceStep(max);
    return { yMax: Math.ceil(max / s) * s, step: s };
  }, [points]);

  const x = (i: number) => MARGIN.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (v: number) => MARGIN.top + plotH - (v / yMax) * plotH;

  const yTicks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, k) => k * step);
  // Date ticks counted from the forecast start, so the start date always gets a label.
  const dayStep = (n > 120 ? 28 : 14) * (width < 520 ? 2 : 1);
  const xTicks: number[] = [];
  for (let i = forecastStart; i >= 0; i -= dayStep) xTicks.unshift(i);
  for (let i = forecastStart + dayStep; i < n; i += dayStep) xTicks.push(i);

  const fc = points.slice(forecastStart);
  const band95 = bandPath(fc.map((p) => p.lo95 ?? 0), fc.map((p) => p.hi95 ?? 0), forecastStart, x, y);
  const band80 = bandPath(fc.map((p) => p.lo80 ?? 0), fc.map((p) => p.hi80 ?? 0), forecastStart, x, y);
  const actualPath = linePath(points.map((p) => p.actual), x, y);
  const forecastPath = linePath(points.map((p, i) => (i >= forecastStart ? p.yhat : null)), x, y);
  const boundaryX = (x(forecastStart - 1) + x(forecastStart)) / 2;

  function indexFromPointer(clientX: number, target: Element) {
    const rect = target.getBoundingClientRect();
    const rel = ((clientX - rect.left) * (width / rect.width) - MARGIN.left) / plotW;
    return Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1))));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1;
      setActive((cur) => Math.min(n - 1, Math.max(0, (cur ?? forecastStart) + delta)));
    } else if (e.key === "Escape") {
      setActive(null);
    }
  }

  const p = active != null ? points[active] : null;
  const tooltipLeft = active != null ? x(active) : 0;
  const flip = tooltipLeft > width - 200;

  return (
    <figure className="m-0">
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 rounded bg-series-1" aria-hidden /> Actual sales
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 rounded bg-series-2" aria-hidden /> {forecastLabel} forecast
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm bg-series-2/25" aria-hidden /> 80% range
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm bg-series-2/10" aria-hidden /> 95% range
        </li>
      </ul>

      <div ref={ref} className="relative" style={{ height: HEIGHT }}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={description}
          tabIndex={0}
          className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-series-1"
          onPointerMove={(e) => setActive(indexFromPointer(e.clientX, e.currentTarget))}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
              <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-muted text-[11px]">
                {t.toLocaleString("en-US")}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className="tabular fill-muted text-[11px]">
              {shortDate(points[i].ds)}
            </text>
          ))}

          {/* Forecast period: shaded ranges, boundary line and label */}
          <path d={band95} fill="var(--series-2)" fillOpacity={0.1} />
          <path d={band80} fill="var(--series-2)" fillOpacity={0.16} />
          <line x1={boundaryX} x2={boundaryX} y1={MARGIN.top} y2={MARGIN.top + plotH} stroke="var(--axis)" strokeWidth={1} />
          <text x={boundaryX + 6} y={MARGIN.top + 2} dy="0.7em" className="fill-ink-2 text-[11px]">
            Forecast →
          </text>

          <path d={actualPath} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={forecastPath} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {p && active != null && (
            <g pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={MARGIN.top + plotH} stroke="var(--ink-muted)" strokeWidth={1} />
              {p.actual != null && (
                <circle cx={x(active)} cy={y(p.actual)} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
              )}
              {p.yhat != null && (
                <circle cx={x(active)} cy={y(p.yhat)} r={4} fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2} />
              )}
            </g>
          )}
        </svg>

        {p && active != null && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-44 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-sm"
            style={flip ? { right: width - tooltipLeft + 12 } : { left: tooltipLeft + 12 }}
            role="status"
          >
            <div className="mb-1.5 text-ink-2">
              {weekday(p.ds)}, {shortDate(p.ds, true)}
            </div>
            <TooltipRow color="var(--series-1)" value={p.actual == null ? "–" : num(p.actual, 0)} label="Actual" />
            {p.yhat != null && (
              <>
                <TooltipRow color="var(--series-2)" value={num(p.yhat, 1)} label="Forecast" />
                <div className="mt-1 text-ink-2">
                  80% range <span className="tabular font-semibold text-ink">{p.lo80}–{p.hi80}</span>
                </div>
                <div className="text-ink-2">
                  95% range <span className="tabular font-semibold text-ink">{p.lo95}–{p.hi95}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
        <span>Units sold per day. Hover or use the arrow keys to read values.</span>
        <button
          type="button"
          onClick={() => setShowTable((s) => !s)}
          className="rounded border border-line px-2 py-1 text-ink hover:bg-wash"
          aria-expanded={showTable}
        >
          {showTable ? "Hide" : "Show"} forecast table
        </button>
      </figcaption>

      {showTable && (
        <div className="mt-3 max-h-80 overflow-auto rounded border border-line">
          <table className="tabular w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface text-ink-2">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Actual</th>
                <th className="px-3 py-2 text-right font-medium">Forecast</th>
                <th className="px-3 py-2 text-right font-medium">80% range</th>
                <th className="px-3 py-2 text-right font-medium">95% range</th>
              </tr>
            </thead>
            <tbody>
              {fc.map((r) => (
                <tr key={r.ds} className="border-t border-line">
                  <td className="px-3 py-1.5">
                    {weekday(r.ds)} {shortDate(r.ds)}
                  </td>
                  <td className="px-3 py-1.5 text-right">{r.actual ?? "–"}</td>
                  <td className="px-3 py-1.5 text-right">{num(r.yhat, 1)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {r.lo80}–{r.hi80}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {r.lo95}–{r.hi95}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

function TooltipRow({ color, value, label }: { color: string; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} aria-hidden />
      <span className="tabular font-semibold text-ink">{value}</span>
      <span className="text-ink-2">{label}</span>
    </div>
  );
}
