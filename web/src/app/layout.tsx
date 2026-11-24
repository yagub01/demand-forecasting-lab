import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { GITHUB_URL } from "@/lib/site";
import "./globals.css";

// Every page is generated at build time. This makes the build fail if a future change
// would need a server at request time.
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
        <header className="sticky top-0 z-30 border-b-2 border-ink bg-page/90 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm sm:px-6">
            <Link href="/" className="font-display flex items-center gap-2 whitespace-nowrap text-base font-bold text-ink">
              <Logo size={30} />
              <span className="hidden sm:inline">Demand Forecasting Lab</span>
              <span className="sm:hidden">Forecasting Lab</span>
            </Link>
            <div className="ml-auto flex items-center gap-1 whitespace-nowrap font-medium text-ink-2 sm:gap-2">
              <Link href="/retail" className="hidden rounded-full px-3 py-1.5 hover:bg-lavender hover:text-ink sm:inline">
                Case study
              </Link>
              <a href={GITHUB_URL} className="hidden rounded-full px-3 py-1.5 hover:bg-lavender hover:text-ink md:inline">
                GitHub
              </a>
              <Link href="/forecast" className="btn btn-primary !px-4 !py-1.5 text-sm">
                Try it
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t-2 border-ink bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="font-display flex items-center gap-2 font-bold text-ink">
              <Logo size={24} /> Demand Forecasting Lab
            </div>
            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/forecast" className="hover:text-ink">
                Forecast tool
              </Link>
              <Link href="/retail" className="hover:text-ink">
                Walmart case study
              </Link>
              <a href={GITHUB_URL} className="hover:text-ink">
                Source code
              </a>
            </nav>
          </div>
          <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-ink-2 sm:px-6">
            Sample and case-study data: M5 forecasting competition (University of Nicosia and Walmart), via a public mirror
            by Nixtla.
          </p>
        </footer>
      </body>
    </html>
  );
}
