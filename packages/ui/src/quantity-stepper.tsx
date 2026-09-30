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
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  const btn = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? "Quantity"}
      className={cn("inline-flex items-center gap-1 rounded-full border border-line bg-white p-1", className)}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        className={cn(
          "inline-flex items-center justify-center rounded-full text-primary-700 transition-colors hover:bg-primary-surface disabled:opacity-40",
          btn,
        )}
        disabled={value <= min}
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
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
