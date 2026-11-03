"use client";

import { useState } from "react";

export interface BarRow {
  id: string;
  label: string;
  value: number;
  valueLabel: string;
  detail: string;
  emphasized: boolean;
}

/**
 * Ranked horizontal bars on a 0-100% scale. The emphasized row uses the accent color;
 * the others are shown in gray for context.
 */
export function ModelBars({ rows, ariaLabel }: { rows: BarRow[]; ariaLabel: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div role="list" aria-label={ariaLabel} className="text-sm">
      {rows.map((r) => (
        <div
          key={r.id}
          role="listitem"
          tabIndex={0}
          aria-label={`${r.label}: ${r.valueLabel}. ${r.detail}`}
          onPointerEnter={() => setHover(r.id)}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(r.id)}
          onBlur={() => setHover(null)}
          className="relative grid grid-cols-[8.5rem_1fr] items-center gap-3 rounded py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-series-1 sm:grid-cols-[10rem_1fr]"
        >
          <span className={r.emphasized ? "font-semibold text-ink" : "text-ink-2"}>{r.label}</span>
          {/* Right padding leaves room for the value label at the end of the longest bar. */}
          <div className="pr-14">
            <div className="relative h-6">
              {ticks.map((t) => (
                <span key={t} className="absolute inset-y-0 w-px bg-grid" style={{ left: `${t * 100}%` }} aria-hidden />
              ))}
              <span
                className={`absolute left-0 top-1 h-4 rounded-r ${r.emphasized ? "bg-series-1" : "bg-deemph"} ${hover === r.id ? "opacity-80" : ""}`}
                style={{ width: `${Math.min(1, r.value) * 100}%` }}
                aria-hidden
              />
              <span
                className="tabular absolute top-0 text-xs leading-6 text-ink"
                style={{ left: `calc(${Math.min(1, r.value) * 100}% + 8px)` }}
              >
                {r.valueLabel}
              </span>
            </div>
          </div>
          {hover === r.id && (
            <div className="pointer-events-none absolute left-0 top-full z-10 -mt-1 w-64 max-w-full rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink-2 shadow-sm sm:left-40">
              <span className="tabular font-semibold text-ink">{r.valueLabel}</span> {r.label}
              <div className="mt-1">{r.detail}</div>
            </div>
          )}
        </div>
      ))}
      <div className="grid grid-cols-[8.5rem_1fr] gap-3 sm:grid-cols-[10rem_1fr]" aria-hidden>
        <span />
        <div className="pr-14">
          <div className="tabular relative h-4 text-[11px] text-muted">
            {ticks.map((t) => (
              <span
                key={t}
                // On narrow screens only 0%, 50% and 100% are labeled so the labels don't collide.
                className={`absolute -translate-x-1/2 ${t === 0.25 || t === 0.75 ? "hidden sm:inline" : ""}`}
                style={{ left: `${t * 100}%` }}
              >
                {t * 100}%
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
