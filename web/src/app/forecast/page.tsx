import type { Metadata } from "next";
import { ForecastTool } from "@/components/ForecastTool";

export const metadata: Metadata = {
  title: "Forecast",
  description:
    "Upload a CSV of past sales and get a forecast with ranges and a stock recommendation. Runs in your browser; nothing is uploaded.",
};

export default function ForecastPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-12 sm:px-6">
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold sm:text-5xl">Forecast your demand</h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-2">
          Drop in a CSV or pick a sample. Results appear below in a few seconds.
        </p>
      </header>
      <ForecastTool />
    </div>
  );
}
