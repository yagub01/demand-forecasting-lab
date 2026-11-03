import { shortDate } from "@/lib/format";

export interface Stage {
  name: string;
  start: string;
  end: string;
  days: number;
  purpose: string;
}

/**
 * The backtest timeline as one bar split into its stages, in time order.
 * Stages are ordered, so they use steps of one hue rather than different colors.
 */
export function Timeline({ stages }: { stages: Stage[] }) {
  const total = stages.reduce((s, x) => s + x.days, 0);
  const fills = ["var(--stage-1)", "var(--stage-2)", "var(--stage-3)"];
  const inks = ["var(--stage-1-ink)", "var(--stage-2-ink)", "var(--stage-3-ink)"];
  return (
    <figure className="m-0">
      <div className="flex gap-0.5" role="img" aria-label={stages.map((s) => `${s.name}: ${s.days} days`).join(", ")}>
        {stages.map((s, i) => (
          <div
            key={s.name}
            className="flex h-7 items-center overflow-hidden rounded px-2 text-xs font-medium"
            style={{ width: `${(s.days / total) * 100}%`, background: fills[i], color: inks[i] }}
          >
            <span className="truncate">{s.name}</span>
          </div>
        ))}
      </div>
      <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        {stages.map((s, i) => (
          <li key={s.name} className="flex gap-2">
            <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: fills[i] }} aria-hidden />
            <div>
              <div className="font-medium text-ink">{s.name}</div>
              <div className="tabular text-xs text-ink-2">
                {shortDate(s.start, true)} – {shortDate(s.end, true)} · {s.days} days
              </div>
              <div className="mt-1 text-xs text-ink-2">{s.purpose}</div>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}
