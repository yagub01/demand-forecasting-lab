import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_URL } from "@/lib/site";
import "./globals.css";

// Every page is generated at build time from the pipeline's JSON files. This makes the
// build fail if a future change would need a server at request time.
export const ensureStatic = "navigation";

export const metadata: Metadata = {
  title: {
    default: "Demand Forecasting Lab",
    template: "%s · Demand Forecasting Lab",
  },
  description:
    "Upload your sales history and get a demand forecast with ranges and a recommended stock level. Free, and it runs in your browser.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-page/80 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm sm:px-6">
            <Link href="/" className="flex items-center gap-2 whitespace-nowrap font-semibold text-ink">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect width="24" height="24" rx="6" fill="var(--series-1)" />
                <path d="M5 15l4-4 3 3 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Demand Forecasting Lab
            </Link>
            <div className="ml-auto flex items-center gap-4 whitespace-nowrap text-ink-2 sm:gap-5">
              <Link href="/" className="hover:text-ink">
                Forecast
              </Link>
              <Link href="/retail" className="hover:text-ink">
                Case study
              </Link>
              <a href={GITHUB_URL} className="hidden hover:text-ink sm:inline">
                GitHub
              </a>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-5xl px-4 py-8 text-xs leading-relaxed text-ink-2 sm:px-6">
            Sample and case-study data: M5 forecasting competition (University of Nicosia and Walmart), via a public
            mirror by Nixtla. Code and methodology on{" "}
            <a href={GITHUB_URL} className="underline underline-offset-2 hover:text-ink">
              GitHub
            </a>
            .
          </div>
        </footer>
      </body>
    </html>
  );
}
