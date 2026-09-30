/**
 * Money helpers. All amounts in the system are integer paise (₹1 = 100 paise).
 * Never use floating point arithmetic on money.
 */

/** Round-half-up integer division of a by b (b > 0). */
export function divRoundHalfUp(a: number, b: number): number {
  return Math.floor((a + Math.floor(b / 2)) / b);
}

/** Round-half-up a paise value that may have come from a ratio (e.g. GST 875 * 0.05 → 44). */
export function roundPaise(ratio: number): number {
  return Math.round(ratio);
}

/** "1234567" (paise) → "₹12,345.67" with Indian digit grouping. */
export function formatINR(paise: number, options: { withSymbol?: boolean } = {}): string {
  const withSymbol = options.withSymbol ?? true;
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const grouped = rupees.toLocaleString("en-IN");
  const body = p === 0 ? grouped : `${grouped}.${p.toString().padStart(2, "0")}`;
  const symbol = withSymbol ? "₹" : "Rs ";
  return `${negative ? "-" : ""}${symbol}${body}`;
}

/**
 * Parse a human rupee input ("99", "99.50", "₹ 1,299") into paise.
 * Returns null when the input is not a valid amount.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const paise = Number(whole ?? 0) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isFinite(paise) ? paise : null;
}

/** GST tax for a tax-inclusive line: total = taxable * (1 + rate/100). */
export function gstFromInclusive(totalPaise: number, gstRatePercent: number): number {
  if (gstRatePercent <= 0) return 0;
  // tax = total * rate / (100 + rate), rounded half-up to the paisa
  return roundPaise((totalPaise * gstRatePercent) / (100 + gstRatePercent));
}
