"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "./cn";

/** Quantity stepper used in carts and product cards. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "md",
  className,
  ariaLabel,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const btn =
    size === "sm" ? "h-11 w-11 shrink-0 text-xs md:h-7 md:w-7" : "h-11 w-11 shrink-0 text-sm md:h-9 md:w-9";
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? "Quantity"}
      className={cn(
        "inline-flex shrink-0 items-center rounded-xl border border-line bg-white md:gap-1 md:p-1",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        className={cn(
          "inline-flex items-center justify-center rounded-full text-primary-700 transition-colors hover:bg-primary-surface disabled:opacity-40",
          btn,
        )}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span
        className={cn("min-w-6 text-center font-bold tabular-nums", size === "sm" ? "text-xs" : "text-sm")}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-600 disabled:opacity-40",
          btn,
        )}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
