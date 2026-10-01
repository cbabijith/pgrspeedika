import { describe, expect, it } from "vitest";
import { computeAdjustedBill, computeBill, couponDiscount, gstBreakdown } from "../services/pricing";
import { validateCoupon, type CouponRow } from "../services/coupons";
import { formatINR, parseRupeesToPaise, gstFromInclusive } from "@pgrs/contracts";

const zone = { minOrderPaise: 9900, deliveryFeePaise: 2900, freeDeliveryThresholdPaise: 49900 };

describe("money utilities", () => {
  it("formats INR with Indian digit grouping", () => {
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(123456789)).toBe("₹12,34,567.89");
    expect(formatINR(5000)).toBe("₹50");
    expect(formatINR(5050)).toBe("₹50.50");
  });

  it("parses rupee input into integer paise", () => {
    expect(parseRupeesToPaise("99")).toBe(9900);
    expect(parseRupeesToPaise("₹1,299.50")).toBe(129950);
    expect(parseRupeesToPaise("12.345")).toBeNull();
  });

  it("extracts GST from an inclusive price", () => {
    expect(gstFromInclusive(10500, 5)).toBe(500);
    expect(gstFromInclusive(11800, 18)).toBe(1800);
    expect(gstFromInclusive(3000, 0)).toBe(0);
  });
});

describe("bill computation", () => {
  const tomato = {
    unitPricePaise: 3000, // ₹30 per 500g pack
    quantity: 2,
    baseQuantity: 500,
    unitType: "weight" as const,
    gstRate: 0,
  };
  const ghee = {
    unitPricePaise: 34900, // ₹349, 12% GST inclusive
    quantity: 1,
    baseQuantity: 1,
    unitType: "unit" as const,
    gstRate: 12,
  };

  it("computes subtotal, delivery fee and grand total without a coupon", () => {
    const bill = computeBill([tomato], null, zone);
    expect(bill.subtotalPaise).toBe(6000);
    expect(bill.discountPaise).toBe(0);
    expect(bill.deliveryFeePaise).toBe(2900);
    expect(bill.grandTotalPaise).toBe(8900);
  });

  it("gives free delivery above the zone threshold", () => {
    const bill = computeBill([tomato, ghee], null, zone);
    expect(bill.subtotalPaise).toBe(40900);
    // Below ₹499 → fee applies
    expect(bill.deliveryFeePaise).toBe(2900);
    const big = computeBill([tomato, ghee, { ...ghee, quantity: 1 }], null, zone);
    expect(big.subtotalPaise).toBe(75800);
    expect(big.deliveryFeePaise).toBe(0);
    expect(big.grandTotalPaise).toBe(75800);
  });

  it("applies percent coupons with a cap and counts GST correctly", () => {
    const coupon = { couponType: "percent" as const, value: 10, maxDiscountPaise: 5000 };
    const bill = computeBill([tomato, ghee], coupon, zone);
    expect(bill.subtotalPaise).toBe(40900);
    expect(bill.discountPaise).toBe(4090); // 10% under the ₹50 cap
    expect(bill.gstTotalPaise).toBe(gstFromInclusive(34900, 12));
    expect(bill.gstBreakdown).toHaveLength(1);
    expect(bill.gstBreakdown[0]?.rate).toBe(12);
    expect(bill.grandTotalPaise).toBe(40900 - 4090 + 2900);
  });

  it("caps percent coupons at maxDiscountPaise", () => {
    const coupon = { couponType: "percent" as const, value: 10, maxDiscountPaise: 2000 };
    expect(couponDiscount(coupon, 40900)).toBe(2000);
  });

  it("never discounts more than the subtotal", () => {
    const coupon = { couponType: "flat" as const, value: 100000, maxDiscountPaise: null };
    expect(couponDiscount(coupon, 5000)).toBe(5000);
  });

  it("groups GST by rate across lines", () => {
    const breakdown = gstBreakdown([
      { subtotalPaise: 11800, gstRate: 18 },
      { subtotalPaise: 10500, gstRate: 5 },
      { subtotalPaise: 23600, gstRate: 18 },
    ]);
    expect(breakdown).toHaveLength(2);
    expect(breakdown[0]?.rate).toBe(5);
    expect(breakdown[1]?.rate).toBe(18);
    expect(breakdown[1]?.taxPaise).toBe(gstFromInclusive(11800, 18) + gstFromInclusive(23600, 18));
  });
});

describe("weight adjustment", () => {
  const tomato = {
    unitPricePaise: 3000, // ₹30 / 500g pack → ₹60/kg
    quantity: 2,
    baseQuantity: 500,
    unitType: "weight" as const,
    gstRate: 0,
  };
  const rice = {
    unitPricePaise: 32500, // ₹325 / 5kg
    quantity: 1,
    baseQuantity: 5000,
    unitType: "weight" as const,
    gstRate: 5,
  };

  it("recomputes the bill proportionally to packed grams", () => {
    // Ordered 1000g tomato (₹60), packed 940g → ₹56.40
    const bill = computeAdjustedBill(
      [
        { ...tomato, finalQtyGrams: 940 },
        { ...rice, finalQtyGrams: 5000 },
      ],
      0,
      2900,
    );
    expect(bill.subtotalPaise).toBe(5640 + 32500);
    expect(bill.grandTotalPaise).toBe(5640 + 32500 + 2900);
  });

  it("keeps the coupon discount but caps it to the adjusted subtotal", () => {
    const bill = computeAdjustedBill([{ ...tomato, finalQtyGrams: 250 }], 6000, 0);
    expect(bill.subtotalPaise).toBe(1500);
    expect(bill.discountPaise).toBe(1500);
    expect(bill.grandTotalPaise).toBe(0);
  });
});

function makeCoupon(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    id: "c1",
    code: "WELCOME10",
    couponType: "percent",
    value: 10,
    minOrderPaise: 19900,
    maxDiscountPaise: 5000,
    usageLimit: null,
    perUserLimit: 1,
    usedCount: 0,
    validFrom: null,
    validUntil: null,
    firstOrderOnly: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CouponRow;
}

describe("coupon validation", () => {
  const base = {
    subtotalPaise: 40000,
    now: new Date("2026-06-01T10:00:00Z"),
    isActive: true,
    userRedemptionCount: 0,
    isFirstOrder: true,
  };

  it("accepts a valid coupon", () => {
    const result = validateCoupon({ ...base, coupon: makeCoupon() });
    expect(result.discountPaise).toBe(4000);
  });

  it("rejects carts below the minimum order", () => {
    expect(() => validateCoupon({ ...base, coupon: makeCoupon({ minOrderPaise: 50000 }) })).toThrowError(
      /minimum|Add items/i,
    );
  });

  it("rejects expired coupons", () => {
    expect(() =>
      validateCoupon({
        ...base,
        coupon: makeCoupon({ validUntil: new Date("2026-01-01T00:00:00Z") }),
      }),
    ).toThrowError(/expired/i);
  });

  it("rejects per-user limit breaches", () => {
    expect(() => validateCoupon({ ...base, coupon: makeCoupon(), userRedemptionCount: 1 })).toThrowError(
      /maximum number of times/i,
    );
  });

  it("rejects first-order-only coupons for returning customers", () => {
    expect(() =>
      validateCoupon({ ...base, coupon: makeCoupon({ firstOrderOnly: true }), isFirstOrder: false }),
    ).toThrowError(/first order/i);
  });

  it("rejects fully redeemed global limits", () => {
    expect(() =>
      validateCoupon({
        ...base,
        coupon: makeCoupon({ usageLimit: 100, usedCount: 100 }),
      }),
    ).toThrowError(/fully redeemed/i);
  });
});
