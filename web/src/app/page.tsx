import Link from "next/link";
import { HeroIllustration } from "@/components/HeroIllustration";
import { pct } from "@/lib/format";
import { BASELINE, BEST, inventoryFor, metricFor } from "@/lib/retail";
import { METHODOLOGY_URL } from "@/lib/site";

const STEPS = [
  {
    bg: "bg-lavender",
    icon: "📂",
    title: "Drop in your sales",
    body: "Any CSV with a date and a number: daily, weekly or monthly. Extra columns are fine.",
  },
  {
    bg: "bg-mint",
    icon: "🧪",
    title: "Methods compete",
    body: "Five forecasting methods are tested on your own recent history. The most accurate one wins.",
  },
  {
    bg: "bg-peach",
    icon: "📦",
    title: "Plan with confidence",
    body: "Get a forecast with likely ranges, and how much stock to keep so you don't run out.",
  },
];

const TOPICS = [
  { name: "Ice cream", page: "Ice_cream", note: "peaks every summer" },
  { name: "Halloween", page: "Halloween", note: "spikes each October" },
  { name: "Influenza", page: "Influenza", note: "rises every winter" },
  { name: "Pumpkin pie", page: "Pumpkin_pie", note: "loves November" },
];

const FAQ = [
  {
    q: "Is my data uploaded anywhere?",
    a: "No. The file is read and forecast entirely in your browser. Nothing is sent to a server, and nothing is stored.",
  },
  {
    q: "What should my file look like?",
    a: "One row per date with a quantity, for example: date,units / 2024-01-01,12 / 2024-01-02,9. Comma, semicolon or tab separated; most date formats work. If there is a product column, you can forecast one product or all combined.",
  },
  {
    q: "How accurate will it be?",
    a: "It depends on your data, and the tool tells you honestly: every method is scored on your own recent history, and you can hide the latest weeks to see how the forecast compares with what really happened.",
  },
  {
    q: "Which methods does it use?",
    a: "Seasonal naive (the baseline), seasonal average, Holt-Winters exponential smoothing, simple exponential smoothing, Croston's method for slow sellers, and an average of the best three.",
  },
];

export default function Landing() {
  const best = metricFor(BEST);
  const base = metricFor(BASELINE);
  const stockSaving =
    1 - inventoryFor(BEST).safety_stock_value_per_cutoff / inventoryFor(BASELINE).safety_stock_value_per_cutoff;

  return (
    <div className="overflow-x-hidden">
      {/* ---------------- Hero ---------------- */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div>
          <span className="sticker inline-flex rotate-[-2deg] items-center gap-2 bg-surface px-3 py-1 text-xs font-semibold">
            🍋 Free · No sign-up · Private
          </span>
          <h1 className="mt-6 text-5xl font-extrabold leading-[0.98] sm:text-6xl lg:text-7xl">
            Know what you&apos;ll sell{" "}
            <span className="relative isolate inline-block">
              <span className="absolute inset-x-[-4px] bottom-1 top-[45%] -z-10 -rotate-1 rounded-lg bg-sun" aria-hidden />
              before
            </span>{" "}
            you sell it.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
            Drop in your sales history and get a demand forecast you can actually plan with: tested on your own data, with
            honest ranges and a stock recommendation. All in your browser, in seconds.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/forecast" className="btn btn-primary text-base">
              Try it free →
            </Link>
            <Link href="/retail" className="btn btn-secondary text-base">
              See the Walmart test
            </Link>
          </div>
          <p className="mt-5 text-sm text-ink-2">No file handy? The tool has samples ready to try.</p>
        </div>
        <HeroIllustration />
      </section>

      {/* ---------------- Steps ---------------- */}
      <section className="border-y-2 border-ink bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-4xl font-extrabold sm:text-5xl">Three steps. No spreadsheets.</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className={`card ${s.bg} p-6 ${i === 1 ? "md:translate-y-4" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-4xl" aria-hidden>
                    {s.icon}
                  </span>
                  <span className="font-display flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink bg-surface font-bold">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-2xl font-bold">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- Reality check ---------------- */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <div>
          <span className="sticker inline-block rotate-[2deg] bg-mint px-3 py-1 text-xs font-semibold">New</span>
          <h2 className="mt-4 text-4xl font-extrabold sm:text-5xl">Don&apos;t trust it. Check it.</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">
            Flip on <strong className="text-ink">Check against reality</strong> and the tool hides the last few weeks of
            your data, forecasts them blind, then shows you how close it got. No black box, no &ldquo;trust me&rdquo;.
          </p>
          <Link href="/forecast" className="btn btn-primary mt-8">
            Put it to the test →
          </Link>
        </div>
        <div className="card rotate-[1deg] p-6" aria-hidden>
          <div className="font-display text-xl font-bold">How close did it get?</div>
          <div className="mt-1 text-xs text-ink-2">Real result: whole-store sample, last 13 weeks hidden</div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              ["bg-mint", "Close", "−4%", "total vs actual"],
              ["bg-sun", "Fair", "8 of 13", "weeks in 80% range"],
              ["bg-mint", "Close", "11 of 13", "weeks in 95% range"],
            ].map(([bg, word, value, label]) => (
              <div key={label} className={`rounded-2xl border-2 border-ink p-3 ${bg}`}>
                <div className="text-[10px] font-semibold uppercase tracking-wide">{word}</div>
                <div className="font-display mt-1 text-xl font-bold sm:text-2xl">{value}</div>
                <div className="text-[11px] leading-snug text-ink-2">{label}</div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ---------------- Fun data ---------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="card bg-sky p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <h2 className="text-3xl font-extrabold sm:text-4xl">No sales data? Forecast the internet.</h2>
              <p className="mt-4 leading-relaxed text-ink-2">
                Wikipedia publishes how many people read each article, every day. Pick a topic, download the CSV, drop it in,
                and see if the forecast catches the next peak.
              </p>
              <ol className="mt-5 space-y-1.5 text-sm text-ink">
                <li>1. Open a topic below (last 2 years is pre-selected).</li>
                <li>2. Click <strong>Download</strong> → <strong>CSV</strong>.</li>
                <li>3. Drop the file into the forecast tool.</li>
              </ol>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {TOPICS.map((t, i) => (
                <a
                  key={t.page}
                  href={`https://pageviews.wmcloud.org/?project=en.wikipedia.org&platform=all-access&agent=user&range=latest-730&pages=${t.page}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`sticker block bg-surface p-4 transition-transform hover:-translate-y-1 ${i % 2 ? "rotate-[1.5deg]" : "rotate-[-1.5deg]"}`}
                >
                  <div className="font-display text-lg font-bold">{t.name} ↗</div>
                  <div className="text-xs text-ink-2">{t.note}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Proof ---------------- */}
      <section className="border-y-2 border-ink bg-lavender">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <h2 className="text-4xl font-extrabold sm:text-5xl">Tested on 500 Walmart products.</h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-2">
              The same approach, plus machine-learning models, forecast four months the models had never seen. Here is what
              the best one achieved compared with simply repeating last week.
            </p>
            <Link href="/retail" className="btn btn-secondary mt-8">
              Read the case study →
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="card rotate-[-2deg] bg-sun p-6">
              <div className="font-display text-6xl font-extrabold">{pct(1 - best.wape / base.wape, 0)}</div>
              <div className="mt-2 font-medium">lower forecast error</div>
            </div>
            <div className="card rotate-[2deg] bg-mint p-6 sm:mt-10">
              <div className="font-display text-6xl font-extrabold">{pct(stockSaving, 0)}</div>
              <div className="mt-2 font-medium">less safety stock for the same service level</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
        <h2 className="text-center text-4xl font-extrabold">Questions</h2>
        <div className="mt-10 space-y-4">
          {FAQ.map((f) => (
            <details key={f.q} className="card group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="font-display flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold">
                {f.q}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-sun transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 leading-relaxed text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-ink-2">
          Curious about the details?{" "}
          <a href={METHODOLOGY_URL} className="font-medium text-ink underline underline-offset-2">
            Read the methodology
          </a>
          .
        </p>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="card bg-peach px-6 py-14 text-center">
          <h2 className="text-4xl font-extrabold sm:text-5xl">Your next forecast is one file away.</h2>
          <Link href="/forecast" className="btn btn-primary mt-8 text-base">
            Try it free →
          </Link>
        </div>
      </section>
    </div>
  );
}
