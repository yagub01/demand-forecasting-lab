/** Decorative hero art: a little forecast chart with floating stickers. Not real data. */

const HISTORY = 42;
const FUTURE = 14;
const W = 420;
const H = 220;
const PAD = 18;

function value(t: number) {
  const week = [0.9, 1.0, 0.95, 1.05, 1.25, 1.45, 1.2][t % 7];
  const wiggle = Math.sin(t * 1.7) * 0.08 + Math.cos(t * 0.6) * 0.06;
  return (40 + t * 0.35) * (week + wiggle);
}

export function HeroIllustration() {
  const total = HISTORY + FUTURE;
  const x = (i: number) => PAD + (i / (total - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - 20) / 70) * (H - 2 * PAD);
  const hist = Array.from({ length: HISTORY }, (_, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(value(i)).toFixed(1)}`).join("");
  const fc = Array.from({ length: FUTURE + 1 }, (_, k) => HISTORY - 1 + k);
  const fcLine = fc.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(value(i)).toFixed(1)}`).join("");
  const spread = (i: number) => 4 + (i - HISTORY + 1) * 0.9;
  const band =
    fc.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(value(i) + spread(i)).toFixed(1)}`).join("") +
    [...fc].reverse().map((i) => `L${x(i).toFixed(1)},${y(value(i) - spread(i)).toFixed(1)}`).join("") +
    "Z";
  const split = x(HISTORY - 1);

  return (
    <div className="relative mx-auto w-full max-w-[520px] select-none" aria-hidden>
      <div className="absolute -left-6 -top-8 h-40 w-40 rounded-full bg-mint blur-2xl" />
      <div className="absolute -bottom-10 -right-4 h-48 w-48 rounded-full bg-peach blur-2xl" />
      <div className="absolute right-16 top-4 h-28 w-28 rounded-full bg-lavender blur-2xl" />

      <div className="card relative rotate-[-1.5deg] p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border-2 border-ink bg-coral" />
          <span className="h-3 w-3 rounded-full border-2 border-ink bg-sun" />
          <span className="h-3 w-3 rounded-full border-2 border-ink bg-mint" />
          <span className="ml-2 text-xs font-medium text-ink-2">lemonade-sales.csv</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={PAD} x2={W - PAD} y1={PAD + f * (H - 2 * PAD)} y2={PAD + f * (H - 2 * PAD)} stroke="var(--grid)" strokeWidth={1.5} />
          ))}
          <rect x={split} y={PAD - 6} width={W - PAD - split} height={H - 2 * PAD + 12} rx={10} fill="var(--sun)" opacity={0.35} />
          <path d={band} fill="var(--series-2)" opacity={0.18} />
          <path d={hist} fill="none" stroke="var(--series-1)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          <path d={fcLine} fill="none" stroke="var(--series-2)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={split} cy={y(value(HISTORY - 1))} r={6} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2.5} />
        </svg>
      </div>

      <div className="sticker float absolute -right-3 -top-6 bg-sun px-3 py-2 text-sm [--tilt:4deg] sm:-right-8">
        <div className="text-[11px] font-medium text-ink-2">Next 2 weeks</div>
        <div className="font-display text-lg font-bold">+18% 📈</div>
      </div>
      <div className="sticker float-slow absolute -bottom-6 -left-3 bg-mint px-3 py-2 text-sm [--tilt:-5deg] sm:-left-8">
        <div className="text-[11px] font-medium text-ink-2">Order this week</div>
        <div className="font-display text-lg font-bold">147 units</div>
      </div>
      <div className="sticker float absolute -bottom-4 right-6 hidden bg-surface px-3 py-1.5 text-xs font-semibold [--tilt:3deg] sm:block">
        ✓ 95% sure you won&apos;t run out
      </div>
    </div>
  );
}
