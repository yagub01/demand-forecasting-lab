type Maybe = number | null | undefined;

const DASH = "–";

/** 0.7544 -> "75.4%" */
export function pct(v: Maybe, digits = 1): string {
  return v == null ? DASH : `${(v * 100).toFixed(digits)}%`;
}

/** -0.024 -> "−2.4%", 0.065 -> "+6.5%" */
export function signedPct(v: Maybe, digits = 1): string {
  if (v == null) return DASH;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v * 100).toFixed(digits)}%`;
}

export function usd(v: Maybe): string {
  return v == null ? DASH : `$${Math.round(v).toLocaleString("en-US")}`;
}

export function num(v: Maybe, digits = 1): string {
  return v == null
    ? DASH
    : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "2016-05-22" -> "May 22" (or "May 22, 2016" with year) */
export function shortDate(iso: string, withYear = false): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export function weekday(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type Period = "day" | "week" | "month";

/** Values under 100 get one decimal (unless whole), larger ones none: 3.4, 12, 1,250. */
export function formatValue(v: number): string {
  const digits = Math.abs(v) >= 100 || Number.isInteger(v) ? 0 : 1;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Axis label for a period start date. */
export function tickDate(iso: string, period: Period): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (period === "month") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(" ", " '");
  }
  return shortDate(iso);
}

/** Tooltip heading for a period. */
export function periodLabel(iso: string, period: Period): string {
  if (period === "month")
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  if (period === "week") return `Week of ${shortDate(iso, true)}`;
  return `${weekday(iso)}, ${shortDate(iso, true)}`;
}

export const PERIOD_WORD: Record<Period, [string, string]> = {
  day: ["day", "days"],
  week: ["week", "weeks"],
  month: ["month", "months"],
};

export function plural(n: number, period: Period): string {
  return `${n.toLocaleString("en-US")} ${PERIOD_WORD[period][n === 1 ? 0 : 1]}`;
}
