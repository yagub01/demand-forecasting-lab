interface Props {
  label: string;
  value: string;
  /** Optional comparison line; `good` shows it as an improvement with a down arrow. */
  delta?: { text: string; good: boolean };
  note?: string;
}

export function StatTile({ label, value, delta, note }: Props) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-ink">{value}</div>
      {delta && (
        <div className={`mt-1 text-xs ${delta.good ? "text-good" : "text-ink-2"}`}>
          <span aria-hidden>{delta.good ? "▼ " : ""}</span>
          {delta.text}
        </div>
      )}
      {note && <div className="mt-1 text-xs text-ink-2">{note}</div>}
    </div>
  );
}
