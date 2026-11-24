/**
 * Read a CSV file and turn one column into a regular time series.
 * Everything runs in the browser; the file is never uploaded.
 */

export type Frequency = "day" | "week" | "month";

export interface Table {
  headers: string[];
  rows: string[][];
}

export interface Columns {
  dateCols: number[];
  numericCols: number[];
  textCols: number[];
}

export interface Series {
  dates: string[]; // ISO date of each period (first day of the month for monthly data)
  values: number[];
  frequency: Frequency;
  season: number; // periods per seasonal cycle: 7 (day), 52 (week), 12 (month)
  filledGaps: number; // missing periods set to 0
  mergedRows: number; // rows added into a period that already had a value
  trimmed: number; // oldest periods dropped to keep the series a manageable length
  integer: boolean;
  nonNegative: boolean;
}

export const MAX_PERIODS = 2000;
const DAY_MS = 86_400_000;

export function parseCsv(text: string): Table {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.slice(0, clean.indexOf("\n") === -1 ? clean.length : clean.indexOf("\n"));
  const delimiter = [",", ";", "\t"].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      record.push(field.trim());
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      record.push(field.trim());
      if (record.some((v) => v !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += c;
    }
  }
  record.push(field.trim());
  if (record.some((v) => v !== "")) records.push(record);

  const [headers = [], ...rows] = records;
  return { headers, rows };
}

export function parseNumber(raw: string): number | null {
  let s = raw.replace(/[\s$€£%]/g, "");
  if (s === "") return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ""); // 1,234.5
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", "."); // 12,5 (decimal comma)
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

type DateFormat = "iso" | "mdy" | "dmy" | "native";

function dateFormatOf(samples: string[]): DateFormat {
  const s = samples.filter(Boolean);
  if (s.length && s.every((v) => /^\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?/.test(v))) return "iso";
  const slashed = s.filter((v) => /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}/.test(v));
  if (slashed.length && slashed.length === s.length) {
    if (s.some((v) => v.includes("."))) return "dmy";
    return slashed.some((v) => Number(v.split(/[/.-]/)[0]) > 12) ? "dmy" : "mdy";
  }
  return "native";
}

/** Days since 1970-01-01 (UTC), or null. */
function parseDay(raw: string, format: DateFormat): number | null {
  const v = raw.trim();
  let y: number, m: number, d: number;
  if (format === "iso") {
    const p = v.split(/[-/.T ]/).map(Number);
    [y, m, d] = [p[0], p[1], p[2] || 1];
  } else if (format === "mdy" || format === "dmy") {
    const p = v.split(/[/.\- ]/).map(Number);
    [y, m, d] = format === "mdy" ? [p[2], p[0], p[1]] : [p[2], p[1], p[0]];
  } else {
    const t = Date.parse(v);
    if (Number.isNaN(t)) return null;
    const dt = new Date(t);
    [y, m, d] = [dt.getFullYear(), dt.getMonth() + 1, dt.getDate()];
  }
  if (!y || !m || !d || m > 12 || d > 31) return null;
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function detectColumns(table: Table): Columns {
  const sample = table.rows.slice(0, 300);
  const out: Columns = { dateCols: [], numericCols: [], textCols: [] };
  table.headers.forEach((_, c) => {
    const values = sample.map((r) => r[c] ?? "").filter((v) => v !== "");
    if (!values.length) return;
    const share = (ok: (v: string) => boolean) => values.filter(ok).length / values.length;
    const format = dateFormatOf(values);
    const looksLikeDate = format !== "native" || values.some((v) => /[a-z]/i.test(v));
    if (looksLikeDate && share((v) => parseDay(v, format) != null) >= 0.9) out.dateCols.push(c);
    else if (share((v) => parseNumber(v) != null) >= 0.9) out.numericCols.push(c);
    else out.textCols.push(c);
  });
  return out;
}

export function distinctValues(table: Table, col: number): { value: string; total: number }[] {
  const counts = new Map<string, number>();
  for (const r of table.rows) counts.set(r[col], (counts.get(r[col]) ?? 0) + 1);
  return [...counts.entries()].map(([value, total]) => ({ value, total })).sort((a, b) => b.total - a.total);
}

export type BuildResult = { ok: true; series: Series } | { ok: false; error: string };

export function buildSeries(
  table: Table,
  dateCol: number,
  valueCol: number,
  filter?: { col: number; value: string },
): BuildResult {
  const format = dateFormatOf(table.rows.slice(0, 300).map((r) => r[dateCol] ?? ""));
  const points: { day: number; value: number }[] = [];
  for (const r of table.rows) {
    if (filter && r[filter.col] !== filter.value) continue;
    const day = parseDay(r[dateCol] ?? "", format);
    const value = parseNumber(r[valueCol] ?? "");
    if (day != null && value != null) points.push({ day, value });
  }
  if (points.length < 2) return { ok: false, error: "Fewer than two rows have both a readable date and a number." };
  points.sort((a, b) => a.day - b.day);

  // Frequency comes from every row in the file, so one sparse product doesn't look irregular.
  const days = [...new Set(table.rows.map((r) => parseDay(r[dateCol] ?? "", format)))]
    .filter((d): d is number => d != null)
    .sort((a, b) => a - b);
  // The smallest gap between dates sets the frequency: exports often skip periods with no sales.
  const gap = Math.min(...days.slice(1).map((d, i) => d - days[i]));
  let frequency: Frequency;
  if (gap <= 1) frequency = "day";
  else if (gap >= 6 && gap <= 8) frequency = "week";
  else if (gap >= 27 && gap <= 32) frequency = "month";
  else
    return {
      ok: false,
      error: `Dates are usually ${gap} days apart. The tool works with daily, weekly or monthly data.`,
    };

  // Map every date to a period number counted from the first date.
  const first = points[0].day;
  const firstDate = new Date(first * DAY_MS);
  const monthIndex = (day: number) => {
    const d = new Date(day * DAY_MS);
    return (d.getUTCFullYear() - firstDate.getUTCFullYear()) * 12 + d.getUTCMonth() - firstDate.getUTCMonth();
  };
  const periodOf = (day: number) =>
    frequency === "day" ? day - first : frequency === "week" ? Math.round((day - first) / 7) : monthIndex(day);

  const n = periodOf(points[points.length - 1].day) + 1;
  const sums = new Array<number>(n).fill(0);
  const seen = new Array<boolean>(n).fill(false);
  let mergedRows = 0;
  for (const p of points) {
    const k = periodOf(p.day);
    if (seen[k]) mergedRows++;
    sums[k] += p.value;
    seen[k] = true;
  }
  const filledGaps = seen.filter((s) => !s).length;

  const dateOf = (k: number) => {
    if (frequency === "month")
      return new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + k, 1)).toISOString().slice(0, 10);
    return new Date((first + k * (frequency === "week" ? 7 : 1)) * DAY_MS).toISOString().slice(0, 10);
  };

  const start = Math.max(0, n - MAX_PERIODS);
  const values = sums.slice(start);
  const dates = values.map((_, i) => dateOf(start + i));
  return {
    ok: true,
    series: {
      dates,
      values,
      frequency,
      season: frequency === "day" ? 7 : frequency === "week" ? 52 : 12,
      filledGaps,
      mergedRows,
      trimmed: start,
      integer: values.every((v) => Number.isInteger(v)),
      nonNegative: values.every((v) => v >= 0),
    },
  };
}

/** Next `h` period dates after the last one in the series. */
export function futureDates(series: Series, h: number): string[] {
  const last = series.dates[series.dates.length - 1];
  const d = new Date(`${last}T00:00:00Z`);
  return Array.from({ length: h }, (_, i) => {
    const next = new Date(d);
    if (series.frequency === "month") next.setUTCMonth(d.getUTCMonth() + i + 1);
    else next.setUTCDate(d.getUTCDate() + (i + 1) * (series.frequency === "week" ? 7 : 1));
    return next.toISOString().slice(0, 10);
  });
}
