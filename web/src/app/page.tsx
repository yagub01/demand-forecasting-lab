import Link from "next/link";
import { ForecastTool } from "@/components/ForecastTool";
import { pct } from "@/lib/format";
import { BASELINE, BEST, inventoryFor, metricFor } from "@/lib/retail";
import { METHODOLOGY_URL } from "@/lib/site";

const STEPS = [
  {
    title: "Upload your history",
    body: "A CSV with a date and a quantity per row: daily, weekly or monthly. Missing dates count as zero, and rows on the same date are added up.",
  },
  {
    title: "Methods are tested on your data",
    body: "Each method forecasts your most recent periods using only the data before them. The one with the smallest error is recommended.",
  },
  {
    title: "Plan with ranges, not guesses",
    body: "Every forecast comes with 80% and 95% ranges, and a stock level for the lead time and service level you choose.",
  },
];

export default function Home() {
  const best = metricFor(BEST);
  const base = metricFor(BASELINE);
  const stockSaving =
    1 - inventoryFor(BEST).safety_stock_value_per_cutoff / inventoryFor(BASELINE).safety_stock_value_per_cutoff;

  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-[560px]" />
        <div className="relative mx-auto max-w-5xl px-4 pb-8 pt-14 sm:px-6 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 shadow-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-series-1" aria-hidden />
            Free · No sign-up · Runs in your browser
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Forecast demand from your own sales history.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
            Upload past sales and get a forecast you can plan with: five methods tested on your data, the most accurate one
            chosen, ranges for every period, and a recommended stock level.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <ForecastTool />

        <section className="mt-24" aria-labelledby="how">
          <h2 id="how" className="text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <span className="tabular inline-flex h-7 w-7 items-center justify-center rounded-full bg-series-1/10 text-sm font-semibold text-series-1">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16" aria-labelledby="proof">
          <h2 id="proof" className="text-2xl font-semibold tracking-tight">
            Does it work?
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
            The same approach, plus machine-learning models, was tested on 500 Walmart products over four months that the
            models never saw.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr]">
            <Link
              href="/retail"
              className="group rounded-2xl border border-line bg-surface p-6 shadow-sm transition-colors hover:border-series-1"
            >
              <div className="text-xs font-medium text-good">Case study</div>
              <h3 className="mt-1 text-lg font-semibold">Walmart: 500 products, 7 models</h3>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-3xl font-semibold tracking-tight">{pct(1 - best.wape / base.wape, 0)}</div>
                  <div className="text-xs text-ink-2">lower forecast error than repeating last week</div>
                </div>
                <div>
                  <div className="text-3xl font-semibold tracking-tight">{pct(stockSaving, 0)}</div>
                  <div className="text-xs text-ink-2">less safety stock for the same service level</div>
                </div>
              </div>
              <div className="mt-5 text-sm font-medium text-ink group-hover:text-series-1">See the results →</div>
            </Link>
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <div className="text-xs font-medium text-ink-2">In progress</div>
              <h3 className="mt-1 text-lg font-semibold">Electricity demand</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                Hourly demand, where temperature is the main driver. Forecasts will combine past demand with weather data.
              </p>
              <a href={METHODOLOGY_URL} className="mt-5 inline-block text-sm font-medium text-ink hover:text-series-1">
                Read the methodology →
              </a>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
