import type { Metadata } from "next";
import { ModelBars } from "@/components/ModelBars";
import { ProductExplorer } from "@/components/ProductExplorer";
import { StatTile } from "@/components/StatTile";
import { Timeline } from "@/components/Timeline";
import { num, pct, shortDate, signedPct, usd } from "@/lib/format";
import {
  BASELINE,
  BEST,
  MODEL_LABELS,
  MODEL_NOTES,
  MODEL_ORDER,
  eventFeatures,
  inventoryFor,
  metricFor,
  products,
  summary,
  timeline,
} from "@/lib/retail";
import { METHODOLOGY_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Retail",
  description:
    "Forecasts for 500 Walmart products compared across seven models, with prediction ranges and stock recommendations checked against actual sales.",
};

const th = "px-3 py-2 font-medium";
const td = "px-3 py-2";

export default function RetailPage() {
  const best = metricFor(BEST);
  const base = metricFor(BASELINE);
  const bestStock = inventoryFor(BEST);
  const baseStock = inventoryFor(BASELINE);
  const { config, dataset } = summary;
  const stages = timeline();
  const defaultProduct = [...products].sort((a, b) => b.avg_daily_units - a.avg_daily_units)[0].id;
  const members = summary.ensemble.members.map((m) => MODEL_LABELS[m]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="max-w-3xl">
        <p className="text-sm text-ink-2">Industry 1 of 3</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Retail demand forecasting</h1>
        <p className="mt-3 leading-relaxed text-ink-2">
          {dataset.n_products} randomly selected products from one Walmart store in California, forecast{" "}
          {config.horizon} days ahead by seven models. All results come from four test periods (
          {shortDate(stages.test.start, true)} to {shortDate(stages.test.end, true)}) that played no part in building
          or choosing the models.
        </p>
      </header>

      <section aria-label="Headline results" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`Forecast error, ${MODEL_LABELS[BEST].toLowerCase()} (WAPE)`}
          value={pct(best.wape)}
          delta={{ text: `${pct(1 - best.wape / base.wape)} lower than repeating last week`, good: true }}
        />
        <StatTile
          label="Safety stock needed, 500 products"
          value={usd(bestStock.safety_stock_value_per_cutoff)}
          delta={{
            text: `${pct(1 - bestStock.safety_stock_value_per_cutoff / baseStock.safety_stock_value_per_cutoff, 0)} less than the baseline`,
            good: true,
          }}
        />
        <StatTile
          label="Service level achieved"
          value={pct(bestStock.achieved_service_level)}
          note={`Target ${pct(config.service_level, 0)}: share of weeks with no stockout`}
        />
        <StatTile
          label="95% range coverage"
          value={pct(best.coverage_95)}
          note="Target 95%: share of actual sales inside the range"
        />
      </section>

      <Section
        title="How the models compare"
        intro={`Error (WAPE) is total forecast error as a share of units sold, across all products and test periods. Lower is better. The ensemble averages the three models that were most accurate on the earlier calibration periods: ${members.join(", ")}.`}
      >
        <div className="rounded-lg border border-line bg-surface p-4">
          <ModelBars
            ariaLabel="Forecast error (WAPE) by model, lower is better"
            rows={MODEL_ORDER.map((m) => {
              const metric = metricFor(m);
              return {
                id: m,
                label: MODEL_LABELS[m],
                value: metric.wape,
                valueLabel: pct(metric.wape),
                detail: MODEL_NOTES[m],
                emphasized: m === BEST,
              };
            })}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <TableCard title="Accuracy" caption="Test periods, 500 products">
            <thead className="text-ink-2">
              <tr>
                <th className={`${th} text-left`}>Model</th>
                <th className={`${th} text-right`}>WAPE</th>
                <th className={`${th} text-right`}>MASE</th>
                <th className={`${th} text-right`}>RMSE</th>
                <th className={`${th} text-right`}>Bias</th>
                <th className={`${th} text-right`}>80% range</th>
                <th className={`${th} text-right`}>95% range</th>
              </tr>
            </thead>
            <tbody>
              {MODEL_ORDER.map((m) => {
                const r = metricFor(m);
                return (
                  <tr key={m} className="border-t border-line">
                    <td className={`${td} ${m === BEST ? "font-semibold" : ""}`}>{MODEL_LABELS[m]}</td>
                    <td className={`${td} text-right`}>{pct(r.wape)}</td>
                    <td className={`${td} text-right`}>{num(r.mase, 3)}</td>
                    <td className={`${td} text-right`}>{num(r.rmse, 2)}</td>
                    <td className={`${td} text-right`}>{signedPct(r.bias)}</td>
                    <td className={`${td} text-right`}>{pct(r.coverage_80)}</td>
                    <td className={`${td} text-right`}>{pct(r.coverage_95)}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>

          <TableCard
            title={`Inventory: ${config.lead_time_days}-day lead time, ${pct(config.service_level, 0)} target service level`}
            caption="Safety stock value is for all 500 products at shelf prices"
          >
            <thead className="text-ink-2">
              <tr>
                <th className={`${th} text-left`}>Model</th>
                <th className={`${th} text-right`}>Service level</th>
                <th className={`${th} text-right`}>Safety stock per product</th>
                <th className={`${th} text-right`}>Safety stock value</th>
              </tr>
            </thead>
            <tbody>
              {MODEL_ORDER.map((m) => {
                const r = inventoryFor(m);
                return (
                  <tr key={m} className="border-t border-line">
                    <td className={`${td} ${m === BEST ? "font-semibold" : ""}`}>{MODEL_LABELS[m]}</td>
                    <td className={`${td} text-right`}>{pct(r.achieved_service_level)}</td>
                    <td className={`${td} text-right`}>{num(r.avg_safety_stock_units, 1)} units</td>
                    <td className={`${td} text-right`}>{usd(r.safety_stock_value_per_cutoff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        </div>

        <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Definition term="MASE">
            Error relative to repeating last week, averaged over products. Below 1 beats it.
          </Definition>
          <Definition term="RMSE">Penalizes large misses more heavily than WAPE.</Definition>
          <Definition term="Bias">Total forecast minus total sales. Positive means the model forecast too much.</Definition>
          <Definition term="Range coverage">
            Share of actual daily sales inside the 80% or 95% range. Ranges move in whole units, so for slow sellers the
            80% range cannot sit at exactly 80%.
          </Definition>
          <Definition term="Service level">
            Share of product-weeks in which the recommended stock covered actual sales.
          </Definition>
          <Definition term="Safety stock">Extra units held above expected demand to absorb forecast errors.</Definition>
        </dl>
      </Section>

      <Section
        title="Explore a product"
        intro="Pick a product and a model to see the forecast for the last test period against actual sales, and the stock it would have recommended."
      >
        <ProductExplorer
          products={products}
          models={MODEL_ORDER}
          baseline={BASELINE}
          defaultProduct={defaultProduct}
          leadTimeDays={config.lead_time_days}
          serviceLevel={config.service_level}
        />
      </Section>

      <Section
        title="Real-world events"
        intro="The models know about 30 calendar events (national holidays, cultural and religious events, and major sporting events), including how many days away the next one is and how long ago the last one was. Weather is not included because the dataset does not disclose where its stores are; economic data was not available to this project."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <TableCard
            title="Error around events"
            caption={`Event days and the ${config.event_lead_days} days before them, compared with all other days`}
          >
            <thead className="text-ink-2">
              <tr>
                <th className={`${th} text-left`}>Model</th>
                <th className={`${th} text-right`}>Event days</th>
                <th className={`${th} text-right`}>Other days</th>
              </tr>
            </thead>
            <tbody>
              {MODEL_ORDER.map((m) => {
                const r = metricFor(m);
                return (
                  <tr key={m} className="border-t border-line">
                    <td className={`${td} ${m === BEST ? "font-semibold" : ""}`}>{MODEL_LABELS[m]}</td>
                    <td className={`${td} text-right`}>{pct(r.wape_event_days)}</td>
                    <td className={`${td} text-right`}>{pct(r.wape_other_days)}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>

          <div>
            <TableCard
              title={`Do the event features help? ${MODEL_LABELS[eventFeatures.model]}, refitted without them`}
              caption="Error (WAPE) on the test periods"
            >
              <thead className="text-ink-2">
                <tr>
                  <th className={`${th} text-left`}>Days</th>
                  <th className={`${th} text-right`}>With events</th>
                  <th className={`${th} text-right`}>Without</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["All days", "wape"],
                    ["Event days", "wape_event_days"],
                    ["Other days", "wape_other_days"],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key} className="border-t border-line">
                    <td className={td}>{label}</td>
                    <td className={`${td} text-right font-semibold`}>{pct(eventFeatures.with_event_features[key])}</td>
                    <td className={`${td} text-right`}>{pct(eventFeatures.without_event_features[key])}</td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              Every model is less accurate around events. The event features reduce the error, but only slightly: at the
              level of one product on one day, most variation around events is still unpredictable.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="How it works"
        intro="The last 280 days of data are split into three stages. Each choice is made on an earlier stage than the one used to report results."
      >
        <div className="rounded-lg border border-line bg-surface p-4">
          <Timeline
            stages={[
              { name: "Tuning", ...stages.tuning, purpose: "Choose the machine-learning model's settings." },
              {
                name: "Calibration",
                ...stages.calibration,
                purpose: "Choose the ensemble members and supply the first past errors for prediction ranges.",
              },
              { name: "Test", ...stages.test, purpose: "Report results. No choices are made here." },
            ]}
          />
        </div>

        <ol className="mt-6 grid list-decimal gap-x-10 gap-y-2 pl-5 text-sm leading-relaxed text-ink-2 sm:grid-cols-2">
          <li>
            <span className="text-ink">Data.</span> Daily sales of {summary.dataset.n_products} sampled products, plus
            prices, discounts, events and food-assistance (SNAP) days, which are known in advance.
          </li>
          <li>
            <span className="text-ink">Models.</span> A seasonal naive baseline, exponential smoothing, two methods for
            slow sellers, and two LightGBM variants trained on all 2,872 products in the store.
          </li>
          <li>
            <span className="text-ink">Backtesting.</span> Every model is refitted at each of eight cutoffs and only sees
            data up to that date.
          </li>
          <li>
            <span className="text-ink">Prediction ranges.</span> Built from each model&apos;s own errors over the
            previous 16 weeks, rounded to whole units.
          </li>
          <li>
            <span className="text-ink">Stock recommendation.</span> Expected demand over the {config.lead_time_days}-day
            lead time plus safety stock, checked against what actually sold.
          </li>
          <li>
            <span className="text-ink">One disclosed exception.</span> Rounding the range bounds to whole units was
            added after seeing the test results. It changes only range coverage.
          </li>
        </ol>
        <p className="mt-6 text-sm">
          <a href={METHODOLOGY_URL} className="text-ink underline underline-offset-2 hover:text-series-1">
            Read the full methodology
          </a>{" "}
          <span className="text-ink-2">— every step, metric and limitation, in plain language.</span>
        </p>
      </Section>
    </div>
  );
}

function Section({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">{intro}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function TableCard({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface">
      <div className="px-4 pt-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-ink-2">{caption}</p>
      </div>
      <div className="mt-2 overflow-x-auto pb-2">
        <table className="tabular w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-ink">{term}</dt>
      <dd className="text-ink-2">{children}</dd>
    </div>
  );
}
