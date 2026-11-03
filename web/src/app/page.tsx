import Link from "next/link";
import { pct } from "@/lib/format";
import { BASELINE, BEST, MODEL_LABELS, inventoryFor, metricFor, summary } from "@/lib/retail";
import { GITHUB_URL, METHODOLOGY_URL } from "@/lib/site";

export default function Home() {
  const best = metricFor(BEST);
  const base = metricFor(BASELINE);
  const stockSaving =
    1 - inventoryFor(BEST).safety_stock_value_per_cutoff / inventoryFor(BASELINE).safety_stock_value_per_cutoff;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight">Demand Forecasting Lab</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          Forecasting how much of each product will sell, tested the way it would be used in practice. Every model is
          scored on past periods it never saw, every forecast includes a range of likely outcomes, and every forecast is
          turned into a stock recommendation that is checked against actual sales.
        </p>
      </header>

      <section aria-label="Industries" className="mt-10 grid gap-4 md:grid-cols-3">
        <Link
          href="/retail"
          className="group rounded-lg border border-line bg-surface p-5 transition-colors hover:border-series-1"
        >
          <div className="text-xs font-medium text-good">Available</div>
          <h2 className="mt-1 text-lg font-semibold">Retail</h2>
          <p className="mt-1 text-sm text-ink-2">
            Daily unit sales of {summary.dataset.n_products} Walmart products, seven models compared.
          </p>
          <dl className="tabular mt-4 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Error, {MODEL_LABELS[BEST].toLowerCase()}</dt>
              <dd>{pct(best.wape)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Error vs. baseline</dt>
              <dd>{pct(1 - best.wape / base.wape)} lower</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Safety stock vs. baseline</dt>
              <dd>{pct(stockSaving, 0)} less</dd>
            </div>
          </dl>
          <div className="mt-4 text-sm font-medium text-ink group-hover:text-series-1">Open the dashboard →</div>
        </Link>

        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="text-xs font-medium text-ink-2">In progress</div>
          <h2 className="mt-1 text-lg font-semibold">Electricity</h2>
          <p className="mt-1 text-sm text-ink-2">
            Hourly electricity demand, where weather is the main driver. Forecasts will use temperature data.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="text-xs font-medium text-ink-2">Planned</div>
          <h2 className="mt-1 text-lg font-semibold">Third industry</h2>
          <p className="mt-1 text-sm text-ink-2">To be chosen once the first two are complete.</p>
        </div>
      </section>

      <section className="mt-14 max-w-3xl">
        <h2 className="text-xl font-semibold tracking-tight">Approach</h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-2">
          <li>
            <span className="font-medium text-ink">Tested on unseen periods.</span> Models are refitted at each cutoff
            and scored on what happened next. Settings are chosen on earlier periods than the ones used to report
            results.
          </li>
          <li>
            <span className="font-medium text-ink">Simple baselines first.</span> A complex model is only useful if it
            clearly beats simple methods, so every comparison includes them.
          </li>
          <li>
            <span className="font-medium text-ink">Ranges, not just numbers.</span> Each forecast comes with 80% and 95%
            ranges, and the site reports how often actual sales fell inside them.
          </li>
          <li>
            <span className="font-medium text-ink">Decisions, not just accuracy.</span> Forecasts are converted into
            stock levels, so accuracy can be read in units and dollars.
          </li>
        </ul>
        <p className="mt-6 text-sm">
          <a href={METHODOLOGY_URL} className="text-ink underline underline-offset-2 hover:text-series-1">
            Methodology
          </a>
          <span className="text-ink-2"> · </span>
          <a href={GITHUB_URL} className="text-ink underline underline-offset-2 hover:text-series-1">
            Source code
          </a>
        </p>
      </section>
    </div>
  );
}
