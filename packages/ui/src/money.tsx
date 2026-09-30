import { formatINR } from "@pgrs/contracts";
import { cn } from "./cn";

/** Indian-rupee money display for integer paise amounts. */
export function Money({
  paise,
  className,
  strike = false,
  withDecimals = "auto",
}: {
  paise: number;
  className?: string;
  strike?: boolean;
  withDecimals?: "always" | "auto" | "never";
}) {
  const value = formatINR(paise);
  const text =
    withDecimals === "always" && !value.includes(".")
      ? `${value}.00`
      : withDecimals === "never"
        ? value.replace(/\.00$/, "")
        : value;
  return <span className={cn("tabular-nums", strike && "text-muted line-through", className)}>{text}</span>;
}
