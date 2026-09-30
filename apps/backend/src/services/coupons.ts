import type { coupons } from "@pgrs/db";
import { couponInvalid } from "../lib/errors";
import { couponDiscount, type CouponLike } from "./pricing";

export type CouponRow = typeof coupons.$inferSelect;

export interface CouponValidationInput {
  coupon: CouponRow;
  subtotalPaise: number;
  now: Date;
  isActive: boolean;
  /** Times this user already redeemed this coupon. */
  userRedemptionCount: number;
  /** True when the customer has zero delivered/placed orders. */
  isFirstOrder: boolean;
}

export interface CouponValidationResult {
  discountPaise: number;
}

/** Pure validation of a coupon against a cart; throws couponInvalid on failure. */
export function validateCoupon(input: CouponValidationInput): CouponValidationResult {
  const { coupon, subtotalPaise, now, userRedemptionCount, isFirstOrder } = input;
  if (!input.isActive || !coupon.isActive) {
    throw couponInvalid("This coupon is not active");
  }
  if (coupon.validFrom && coupon.validFrom.getTime() > now.getTime()) {
    throw couponInvalid("This coupon is not active yet");
  }
  if (coupon.validUntil && coupon.validUntil.getTime() < now.getTime()) {
    throw couponInvalid("This coupon has expired");
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    throw couponInvalid("This coupon has been fully redeemed");
  }
  if (userRedemptionCount >= coupon.perUserLimit) {
    throw couponInvalid("You have already used this coupon the maximum number of times");
  }
  if (coupon.firstOrderOnly && !isFirstOrder) {
    throw couponInvalid("This coupon is only valid on your first order");
  }
  if (subtotalPaise < coupon.minOrderPaise) {
    const minRupees = Math.ceil(coupon.minOrderPaise / 100);
    throw couponInvalid(`Add items worth ₹${minRupees} to use this coupon`);
  }
  const like: CouponLike = {
    couponType: coupon.couponType,
    value: coupon.value,
    maxDiscountPaise: coupon.maxDiscountPaise,
  };
  return { discountPaise: couponDiscount(like, subtotalPaise) };
}
