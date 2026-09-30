import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-xl bg-primary-100", className)} aria-hidden />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent",
        className,
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line bg-white px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="text-primary-300" aria-hidden>
          {icon}
        </div>
      ) : null}
      <p className="text-base font-bold text-ink">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: React.ReactNode;
}) {
  const tones = {
    info: "bg-primary-50 text-primary-800 border-primary-200",
    success: "bg-primary-surface text-primary-700 border-primary-200",
    warning: "bg-accent-surface text-amber-800 border-amber-200",
    danger: "bg-danger-surface text-danger border-red-200",
  } as const;
  return (
    <div role="alert" className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone])}>
      {title ? <p className="font-bold">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}
