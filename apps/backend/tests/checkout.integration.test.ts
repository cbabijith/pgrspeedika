import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, schema, type Database } from "@pgrs/db";
import type { AppContext } from "../src/lib/app-context";
import { createAppContext } from "../src/lib/app-context";
import { placeOrder, packOrder, cancelOrder, getOrderDTO, ALLOWED_TRANSITIONS } from "../src/services/orders";
import { istTodayDateString } from "../src/services/slots";

/**
 * Checkout integration test: exercises the real order pipeline — cart, zone
 * validation, coupon, atomic slot booking, stock reservation, server-side
 * totals, outbox events, idempotent replay, packing with weight adjustment
 * and cancellation with release — against the test database in .env.test.
 */
const dbUrl = process.env.DATABASE_URL;
const d = dbUrl ? describe : describe.skip;

let db: Database | null = null;
let ctx: AppContext | null = null;
let connected = false;

async function tryConnect(): Promise<boolean> {
  if (!dbUrl) return false;
  db = createDb(dbUrl, { max: 4 });
  try {
    await db.select({ key: schema.settings.key }).from(schema.settings).limit(1);
    ctx = createAppContext(
      {
        NODE_ENV: "test",
        PORT: 4000,
        DATABASE_URL: dbUrl,
        BETTER_AUTH_SECRET: "integration-test-secret-integration-32",
        BETTER_AUTH_URL: "http://localhost:4000",
        WEB_URL: "http://localhost:3000",
        ADMIN_URL: "http://localhost:3001",
        CORS_ORIGINS: [],
        LOG_LEVEL: "error",
        RAZORPAY_KEY_ID: "",
        RAZORPAY_KEY_SECRET: "",
        RAZORPAY_WEBHOOK_SECRET: "",
        STORAGE_DRIVER: "local",
        S3_ENDPOINT: "",
        S3_REGION: "auto",
        S3_BUCKET: "",
        S3_ACCESS_KEY_ID: "",
        S3_SECRET_ACCESS_KEY: "",
        S3_PUBLIC_URL: "",
        NOTIFY_PROVIDER: "console",
        NOTIFY_WEBHOOK_URL: "",
      } as AppContext["env"],
      db,
    );
    return true;
  } catch {
    db = null;
    return false;
  }
}

async function clearAll() {
  if (!db) return;
  await db.delete(schema.outboxEvents);
  await db.delete(schema.couponRedemptions);
  await db.delete(schema.refunds);
  await db.delete(schema.payments);
  await db.delete(schema.orderStatusHistory);
  await db.delete(schema.orderItems);
  await db.delete(schema.orders);
  await db.delete(schema.cartItems);
  await db.delete(schema.carts);
  await db.delete(schema.inventoryMovements);
  await db.delete(schema.inventory);
  await db.delete(schema.productImages);
  await db.delete(schema.productVariants);
  await db.delete(schema.products);
  await db.delete(schema.categories);
  await db.delete(schema.slotBookings);
  await db.delete(schema.deliverySlots);
  await db.delete(schema.deliveryZones);
  await db.delete(schema.coupons);
  await db.delete(schema.user);
}

d("checkout integration (order pipeline)", () => {
  let userId = "";
  let zoneId = "";
  let slotId = "";
  let tomatoVariantId = "";
  let riceVariantId = "";
  let couponId = "";
  const slotDate = istTodayDateString();

  beforeAll(async () => {
    connected = await tryConnect();
    if (!connected || !db || !ctx) return;
    await clearAll();

    // Customer
    const [customer] = await db
      .insert(schema.user)
      .values({
        id: "it-customer-1",
        name: "Integration Customer",
        email: "it-customer-1@phone.pgrspeedika.local",
        phoneNumber: "+919812345678",
        phoneNumberVerified: true,
        role: "customer",
      })
      .returning();
    userId = customer!.id;

    // Zone (Kottayam town: min ₹99, fee ₹29, free above ₹499)
    const [zone] = await db
      .insert(schema.deliveryZones)
      .values({
        pincode: "686001",
        areaNameEn: "Kottayam Town",
        areaNameMl: "കണ്ണൂർ ടൗൺ",
        minOrderPaise: 9900,
        deliveryFeePaise: 2900,
        freeDeliveryThresholdPaise: 49900,
      })
      .returning();
    zoneId = zone!.id;

    // Slot with a strict cutoff of 0 so today's late hours never block the test
    const [slot] = await db
      .insert(schema.deliverySlots)
      .values({
        nameEn: "Integration slot 11 PM–12 AM",
        nameMl: "ഇന്റഗ്രേഷൻ സ്ലോട്ട്",
        startMinutes: 23 * 60,
        endMinutes: 24 * 60,
        cutoffMinutes: 0,
        capacity: 2,
      })
      .returning();
    slotId = slot!.id;

    // Catalog: loose tomato (₹60/kg, 250g steps) + packaged matta rice 5kg (₹325, 5% GST)
    const [cat] = await db
      .insert(schema.categories)
      .values({ slug: "it-cat", nameEn: "IT Category", nameMl: "ഐടി വിഭാഗം" })
      .returning();
    const [tomato] = await db
      .insert(schema.products)
      .values({
        slug: "it-tomato",
        categoryId: cat!.id,
        nameEn: "IT Tomato",
        nameMl: "ഐടി തക്കാളി",
        sellingType: "loose",
        gstRate: 0,
        hsnCode: "0702",
      })
      .returning();
    const [rice] = await db
      .insert(schema.products)
      .values({
        slug: "it-rice",
        categoryId: cat!.id,
        nameEn: "IT Matta Rice",
        nameMl: "ഐടി മട്ട അരി",
        sellingType: "packaged",
        gstRate: 5,
        hsnCode: "1006",
      })
      .returning();
    const [tv] = await db
      .insert(schema.productVariants)
      .values({
        productId: tomato!.id,
        sku: "it-tomato-500g",
        unitType: "weight",
        baseQuantity: 500,
        labelEn: "500 g",
        labelMl: "500 ഗ്രാം",
        pricePaise: 3000,
        stepQuantity: 250,
      })
      .returning();
    tomatoVariantId = tv!.id;
    const [rv] = await db
      .insert(schema.productVariants)
      .values({
        productId: rice!.id,
        sku: "it-rice-5kg",
        unitType: "weight",
        baseQuantity: 5000,
        labelEn: "5 kg",
        labelMl: "5 കി.ഗ്രാം",
        pricePaise: 32500,
      })
      .returning();
    riceVariantId = rv!.id;
    await db.insert(schema.inventory).values([
      { productId: tomato!.id, stockQuantity: 10_000, lowStockThreshold: 2_000 },
      { productId: rice!.id, stockQuantity: 20_000, lowStockThreshold: 5_000 },
    ]);

    // Coupon: 10% up to ₹50
    const [coupon] = await db
      .insert(schema.coupons)
      .values({
        code: "IT10",
        couponType: "percent",
        value: 10,
        minOrderPaise: 19900,
        maxDiscountPaise: 5000,
        perUserLimit: 5,
        isActive: true,
      })
      .returning();
    couponId = coupon!.id;
  });

  afterAll(async () => {
    await clearAll();
  });

  async function seedCart(items: Array<{ variantId: string; quantity: number }>, couponCode?: string | null) {
    if (!db) return;
    // One cart per user (unique constraint) — reuse it and reset its contents.
    const [existing] = await db.select().from(schema.carts).where(eq(schema.carts.userId, userId));
    const cart = existing ?? (await db.insert(schema.carts).values({ userId }).returning())[0]!;
    await db.delete(schema.cartItems).where(eq(schema.cartItems.cartId, cart.id));
    for (const item of items) {
      const [variant] = await db
        .select()
        .from(schema.productVariants)
        .where(eq(schema.productVariants.id, item.variantId));
      await db.insert(schema.cartItems).values({
        cartId: cart.id,
        productId: variant!.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      });
    }
    await db
      .update(schema.carts)
      .set({ couponId: couponCode ? couponId : null })
      .where(eq(schema.carts.id, cart.id));
    return cart;
  }

  it("places a COD order with server-verified totals, coupon, reservation and outbox", async () => {
    // Cart: 2 × tomato 500g (₹60) + 1 × rice 5kg (₹325) = ₹385 subtotal
    await seedCart([
      { variantId: tomatoVariantId, quantity: 2 },
      { variantId: riceVariantId, quantity: 1 },
    ]);

    const result = await placeOrder(ctx!, {
      userId,
      address: {
        label: "Home",
        contactName: "IT Customer",
        contactPhone: "+919812345678",
        line1: "IT House, Test Lane",
        line2: null,
        landmark: null,
        pincode: "686001",
        city: "Kottayam",
        isDefault: true,
      },
      slotId,
      slotDate,
      paymentMethod: "cod",
      couponCode: "IT10",
      customerNote: "ring the bell",
      idempotencyKey: "it-order-key-1",
    });

    expect(result.replay).toBe(false);
    expect(result.status).toBe("confirmed"); // COD skips pending_payment
    // Subtotal 38500 − 3850 (10% ≤ ₹50 cap) = 34650 < 49900 → fee 2900 → 37550
    expect(result.grandTotalPaise).toBe(37_550);

    const dto = await getOrderDTO(db!, result.orderId);
    expect(dto.couponCode).toBe("IT10");
    expect(dto.discountPaise).toBe(3_850);
    expect(dto.deliveryFeePaise).toBe(2_900);
    expect(dto.gstTotalPaise).toBeGreaterThan(0); // rice carries 5% inclusive
    expect(dto.items).toHaveLength(2);
    expect(dto.items.map((i) => i.orderedQtyGrams).sort()).toEqual([1, 1_000]);

    // Stock reserved, not sold
    const [tomatoInv] = await db!
      .select()
      .from(schema.inventory)
      .where(
        eq(
          schema.inventory.productId,
          (
            await db!
              .select({ id: schema.products.id })
              .from(schema.products)
              .where(eq(schema.products.slug, "it-tomato"))
          )[0]!.id,
        ),
      );
    expect(tomatoInv?.reservedQuantity).toBe(1_000);
    expect(tomatoInv?.stockQuantity).toBe(10_000);

    // Slot booked once
    const [booking] = await db!
      .select()
      .from(schema.slotBookings)
      .where(eq(schema.slotBookings.slotId, slotId));
    expect(booking?.bookedCount).toBe(1);

    // Outbox rows written in the same transaction (order.placed + order.confirmed)
    const events = await db!.select().from(schema.outboxEvents);
    const names = events.map((e) => e.eventName).sort();
    expect(names).toContain("order.placed");
    expect(names).toContain("order.confirmed");

    // Coupon redemption recorded + used count bumped
    const redemptions = await db!.select().from(schema.couponRedemptions);
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0]?.discountPaise).toBe(3_850);
    const [couponAfter] = await db!.select().from(schema.coupons).where(eq(schema.coupons.id, couponId));
    expect(couponAfter?.usedCount).toBe(1);

    // Cart consumed
    const items = await db!.select().from(schema.cartItems);
    expect(items).toHaveLength(0);

    // Address persisted for the customer
    const addresses = await db!.select().from(schema.addresses);
    expect(addresses).toHaveLength(1);
    expect(addresses[0]?.pincode).toBe("686001");
  });

  it("replays idempotently for the same key", async () => {
    await seedCart([{ variantId: riceVariantId, quantity: 1 }]);
    const first = await placeOrder(ctx!, {
      userId,
      addressId: undefined,
      address: {
        label: "Home",
        contactName: "IT Customer",
        contactPhone: "+919812345678",
        line1: "IT House, Test Lane",
        line2: null,
        landmark: null,
        pincode: "686001",
        city: "Kottayam",
        isDefault: false,
      },
      slotId,
      slotDate,
      paymentMethod: "cod",
      couponCode: null,
      customerNote: null,
      idempotencyKey: "it-order-key-2",
    });
    expect(first.replay).toBe(false);

    const second = await placeOrder(ctx!, {
      userId,
      address: {
        label: "Home",
        contactName: "IT Customer",
        contactPhone: "+919812345678",
        line1: "Different text — must be ignored on replay",
        line2: null,
        landmark: null,
        pincode: "686001",
        city: "Kottayam",
        isDefault: false,
      },
      slotId,
      slotDate,
      paymentMethod: "cod",
      couponCode: null,
      customerNote: null,
      idempotencyKey: "it-order-key-2",
    });
    expect(second.replay).toBe(true);
    expect(second.orderId).toBe(first.orderId);

    // Only two orders exist (key-1 and key-2); the replay created none.
    const allOrders = await db!.select({ id: schema.orders.id }).from(schema.orders);
    expect(allOrders).toHaveLength(2);
  });

  it("rejects unserved pincodes and below-minimum carts", async () => {
    await seedCart([{ variantId: riceVariantId, quantity: 1 }]);
    await expect(
      placeOrder(ctx!, {
        userId,
        address: {
          label: "Home",
          contactName: "IT Customer",
          contactPhone: "+919812345678",
          line1: "Far away",
          line2: null,
          landmark: null,
          pincode: "110001",
          city: "Delhi",
          isDefault: false,
        },
        slotId,
        slotDate,
        paymentMethod: "cod",
        couponCode: null,
        customerNote: null,
        idempotencyKey: "it-order-key-3",
      }),
    ).rejects.toThrowError(/Kottayam district/i);

    // Tomato only (₹30) is below the ₹99 zone minimum.
    await seedCart([{ variantId: tomatoVariantId, quantity: 1 }]);
    await expect(
      placeOrder(ctx!, {
        userId,
        address: {
          label: "Home",
          contactName: "IT Customer",
          contactPhone: "+919812345678",
          line1: "IT House",
          line2: null,
          landmark: null,
          pincode: "686001",
          city: "Kottayam",
          isDefault: false,
        },
        slotId,
        slotDate,
        paymentMethod: "cod",
        couponCode: null,
        customerNote: null,
        idempotencyKey: "it-order-key-4",
      }),
    ).rejects.toThrowError(/minimum/i);
  });

  it("packs with actual weights: bill recomputed, stock committed, refund-free COD", async () => {
    const [order] = await db!
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.idempotencyKey, "it-order-key-1"));
    const items = await db!.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order!.id));
    const tomatoItem = items.find((i) => i.nameEn === "IT Tomato")!;
    const riceItem = items.find((i) => i.nameEn === "IT Matta Rice")!;

    const packed = await packOrder(ctx!, {
      orderId: order!.id,
      // Tomato packed 940g instead of 1000g → ₹56.40 instead of ₹60.
      weights: [
        { itemId: tomatoItem.id, finalQtyGrams: 940 },
        { itemId: riceItem.id, finalQtyGrams: 5000 },
      ],
      actor: null,
    });

    expect(packed.status).toBe("packed");
    expect(packed.weightAdjusted).toBe(true);
    // New subtotal: 5640 + 32500 = 38140 − 3850 + 2900 = 37190
    expect(packed.finalSubtotalPaise).toBe(38_140);
    expect(packed.finalGrandTotalPaise).toBe(37_190);

    // Stock committed at actual weight; reservation cleared.
    const [tomatoInv] = await db!
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.productId, tomatoItem.productId!));
    expect(tomatoInv?.stockQuantity).toBe(10_000 - 940);
    expect(tomatoInv?.reservedQuantity).toBe(0);

    // order.packed event queued.
    const packedEvents = await db!
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventName, "order.packed"));
    expect(packedEvents).toHaveLength(1);
  });

  it("cancels a confirmed order, releasing stock and the slot", async () => {
    const [order] = await db!
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.idempotencyKey, "it-order-key-2"));
    expect(ALLOWED_TRANSITIONS[order!.status]).toContain("cancelled");

    const dto = await cancelOrder(ctx!, {
      orderId: order!.id,
      reason: "Integration cancellation",
      actor: null,
      customerInitiated: true,
    });
    expect(dto.status).toBe("cancelled");

    // Rice stock released back.
    const [riceInv] = await db!
      .select()
      .from(schema.inventory)
      .where(
        eq(
          schema.inventory.productId,
          (
            await db!
              .select({ id: schema.products.id })
              .from(schema.products)
              .where(eq(schema.products.slug, "it-rice"))
          )[0]!.id,
        ),
      );
    expect(riceInv?.reservedQuantity).toBe(0);
    expect(riceInv?.stockQuantity).toBe(20_000 - 1); // key-1 rice committed at pack

    // Slot released for this order (back to 1 booking from key-1).
    const [booking] = await db!
      .select()
      .from(schema.slotBookings)
      .where(eq(schema.slotBookings.slotId, slotId));
    expect(booking?.bookedCount).toBe(1);

    // order.cancelled event queued; packed orders can no longer be cancelled.
    const cancelledEvents = await db!
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventName, "order.cancelled"));
    expect(cancelledEvents).toHaveLength(1);

    const [packedOrder] = await db!
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.idempotencyKey, "it-order-key-1"));
    await expect(
      cancelOrder(ctx!, {
        orderId: packedOrder!.id,
        reason: "too late",
        actor: null,
        customerInitiated: false,
      }),
    ).rejects.toThrowError(/before packing/i);
  });

  void zoneId;
});
