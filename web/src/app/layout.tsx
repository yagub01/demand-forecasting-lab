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
    "Demand forecasting for supply chain: statistical and machine-learning models tested on past data, with prediction ranges and stock recommendations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm sm:px-6">
            <Link href="/" className="font-semibold text-ink">
              Demand Forecasting Lab
            </Link>
            <div className="ml-auto flex items-center gap-5 text-ink-2">
              <Link href="/retail" className="hover:text-ink">
                Retail
              </Link>
              <a href={GITHUB_URL} className="hover:text-ink">
                GitHub
              </a>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-ink-2 sm:px-6">
            Retail data: M5 forecasting competition (University of Nicosia and Walmart), via a public mirror by
            Nixtla. Code and methodology on{" "}
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
