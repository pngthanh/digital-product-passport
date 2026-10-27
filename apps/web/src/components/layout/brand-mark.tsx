/** Biểu tượng: bìa hộ chiếu với dải MRZ ở chân trang. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <rect x="3.5" y="2" width="17" height="20" rx="3" className="fill-primary" />
      <circle cx="12" cy="9.5" r="3.5" className="stroke-primary-ink" strokeWidth="1.5" />
      <path
        d="M7 16.5h10M7 19h10"
        className="stroke-primary-ink"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
