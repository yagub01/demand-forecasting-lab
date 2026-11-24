/** The site mark: a small rising chart. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="var(--sun)" stroke="var(--ink)" strokeWidth="2.5" />
      <path d="M7 20l5-5 4 3 7-8" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="10" r="2.2" fill="var(--coral)" stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  );
}
