import { cn } from "./cn";

/**
 * PGRS Peedika wordmark — a leaf + shop-front mark in brand greens.
 * Replace this file's SVG with the final artwork when available.
 */
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 40 40" className="h-9 w-9" role="img" aria-label="PGRS Peedika logo">
        <circle cx="20" cy="20" r="19" fill="#1B7A3E" />
        <path
          d="M20 7c-6 3.2-9.5 8-9.5 13.4 0 6 4.3 10.6 9.5 12.6 5.2-2 9.5-6.6 9.5-12.6C29.5 15 26 10.2 20 7Z"
          fill="#E8F5E9"
        />
        <path d="M20 10.5c-4 2.6-6.6 6.6-6.6 10.9 0 4 2.5 7.4 6.6 9.2V10.5Z" fill="#14532D" />
        <path
          d="M20 33c.6-7.4 3.4-13.6 8-18.4"
          stroke="#1B7A3E"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      {withWordmark ? (
        <span className="flex flex-col leading-none">
          <span className="text-lg font-extrabold tracking-tight text-primary-700">PGRS</span>
          <span className="text-xs font-semibold tracking-[0.22em] text-muted">PEEDIKA</span>
        </span>
      ) : null}
    </span>
  );
}
