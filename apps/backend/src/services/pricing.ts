import { divRoundHalfUp, gstFromInclusive } from "@pgrs/contracts";
import type { GstLine } from "@pgrs/db";

export interface PricedLine {
  /** Price of one variant pack, GST inclusive, in paise. */
  unitPricePaise: number;
  quantity: number;
  /** grams per pack for weight items; units per pack (usually 1) otherwise. */
  baseQuantity: number;
  unitType: "weight" | "unit";
  gstRate: number;
}

export interface CouponLike {
  couponType: "percent" | "flat";
  value: number;
  maxDiscountPaise: number | null;
}

export interface ZoneLike {
  minOrderPaise: number;
  deliveryFeePaise: number;
  freeDeliveryThresholdPaise: number | null;
}

export interface LineResult {
  lineSubtotalPaise: number;
  lineGstPaise: number;
}

export interface Bill {
  subtotalPaise: number;
  discountPaise: number;
  deliveryFeePaise: number;
  gstTotalPaise: number;
  gstBreakdown: GstLine[];
  grandTotalPaise: number;
}

/** Line totals for the ordered quantities. Prices are GST inclusive. */
export function computeLine(line: PricedLine): LineResult {
  const lineSubtotalPaise = line.unitPricePaise * line.quantity;
  return {
    lineSubtotalPaise,
    lineGstPaise: gstFromInclusive(lineSubtotalPaise, line.gstRate),
  };
}

/** Coupon discount on a GST-inclusive subtotal, capped by the subtotal itself. */
export function couponDiscount(coupon: CouponLike, subtotalPaise: number): number {
  if (coupon.couponType === "percent") {
    const raw = divRoundHalfUp(subtotalPaise * coupon.value, 100);
    const capped = coupon.maxDiscountPaise != null ? Math.min(raw, coupon.maxDiscountPaise) : raw;
    return Math.min(capped, subtotalPaise);
  }
  return Math.min(coupon.value, subtotalPaise);
}

/** Group per-line GST into a rate-sorted breakdown. */
export function gstBreakdown(lines: Array<{ subtotalPaise: number; gstRate: number }>): GstLine[] {
  const byRate = new Map<number, GstLine>();
  for (const l of lines) {
    if (l.gstRate <= 0) continue;
    const taxPaise = gstFromInclusive(l.subtotalPaise, l.gstRate);
    const taxable = l.subtotalPaise - taxPaise;
    const existing = byRate.get(l.gstRate);
    if (existing) {
      existing.taxableValuePaise += taxable;
      existing.taxPaise += taxPaise;
    } else {
      byRate.set(l.gstRate, { rate: l.gstRate, taxableValuePaise: taxable, taxPaise });
    }
  }
  return [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

/**
 * Compute the full bill. Delivery fee applies to the discounted subtotal:
 * free delivery once (subtotal - discount) reaches the zone threshold.
 */
export function computeBill(lines: PricedLine[], coupon: CouponLike | null, zone: ZoneLike | null): Bill {
  const lineResults = lines.map(computeLine);
  const subtotalPaise = lineResults.reduce((s, l) => s + l.lineSubtotalPaise, 0);
  const gstTotalPaise = lineResults.reduce((s, l) => s + l.lineGstPaise, 0);
  const discountPaise = coupon ? couponDiscount(coupon, subtotalPaise) : 0;
  const payable = subtotalPaise - discountPaise;

  let deliveryFeePaise = 0;
  if (zone) {
    const freeAt = zone.freeDeliveryThresholdPaise;
    deliveryFeePaise = freeAt != null && payable >= freeAt ? 0 : zone.deliveryFeePaise;
  }

  return {
    subtotalPaise,
    discountPaise,
    deliveryFeePaise,
    gstTotalPaise,
    gstBreakdown: gstBreakdown(
      lines.map((l, i) => ({ subtotalPaise: lineResults[i]!.lineSubtotalPaise, gstRate: l.gstRate })),
    ),
    grandTotalPaise: payable + deliveryFeePaise,
  };
}

/**
 * Recompute a weight-adjusted line: the pack price is proportional to the
 * actual grams packed (rounded half-up to the paisa).
 */
export function adjustedLineTotal(line: PricedLine, finalQtyGrams: number): number {
  if (line.unitType !== "weight") return line.unitPricePaise * line.quantity;
  const perGram = line.unitPricePaise / line.baseQuantity;
  return Math.round(perGram * finalQtyGrams);
}

/**
 * Final bill after packing weights. The coupon discount is honoured (never
 * increased) but capped to the adjusted subtotal; delivery fee is unchanged.
 */
export function computeAdjustedBill(
  lines: Array<PricedLine & { finalQtyGrams: number }>,
  originalDiscountPaise: number,
  deliveryFeePaise: number,
): Bill {
  const lineSubtotals = lines.map((l) => adjustedLineTotal(l, l.finalQtyGrams));
  const subtotalPaise = lineSubtotals.reduce((s, v) => s + v, 0);
  const discountPaise = Math.min(originalDiscountPaise, subtotalPaise);
  const gst = gstBreakdown(lines.map((l, i) => ({ subtotalPaise: lineSubtotals[i]!, gstRate: l.gstRate })));
  return {
    subtotalPaise,
    discountPaise,
    deliveryFeePaise,
    gstTotalPaise: gst.reduce((s, g) => s + g.taxPaise, 0),
    gstBreakdown: gst,
    grandTotalPaise: subtotalPaise - discountPaise + deliveryFeePaise,
  };
}
