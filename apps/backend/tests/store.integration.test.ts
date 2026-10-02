import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { schema, seedCatalog, applyStorePresentation } from "@pgrs/db";
import { buildApp } from "../src/app";
import { createStaffUser } from "../src/services/staff";
import { placeWhatsAppOrder } from "../src/services/whatsapp-orders";
import {
  packOrder,
  cancelOrder,
  capturePayment,
  getOrderDTO,
  confirmWhatsAppRequest,
} from "../src/services/orders";
import { processBatch } from "../src/worker/processor";
import { istTodayDateString } from "../src/services/slots";
import type { WhatsAppOrderRequest } from "@pgrs/contracts";
import type { AppContext } from "../src/lib/app-context";

const { app, ctx } = buildApp();
const db = ctx.db;
let cookie = "";
let categoryId = "";
let productId = "";
let packagedId = "";
let variantId = "";
let packVariantId = "";
let slotId = "";
const date = istTodayDateString(new Date(Date.now() + 86400000));
const shopPhone = "+919999888877";
const guestContext = () => ({
  db,
  guestTokenSecret: ctx.env.BETTER_AUTH_SECRET,
  shopWhatsApp: async () => shopPhone,
});
const input = (overrides: Partial<WhatsAppOrderRequest> = {}): WhatsAppOrderRequest => ({
  items: [{ variantId, quantity: 2 }],
  customer: {
    name: "Store guest",
    phone: "+919800000090",
    line1: "Guest house, Market road",
    pincode: "686001",
    city: "Kottayam",
  },
  slotId,
  slotDate: date,
  idempotencyKey: `test-${randomUUID()}`,
  ...overrides,
});
async function request(path: string, method = "GET", data?: unknown, staff = true) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json", origin: ctx.env.ADMIN_URL, ...(staff ? { cookie } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function inv(id = productId) {
  return (await db.select().from(schema.inventory).where(eq(schema.inventory.productId, id)))[0]!;
}
async function countOrders() {
  return (await db.select().from(schema.orders)).length;
}

describe("vegetable store operations against PostgreSQL", () => {
  beforeAll(async () => {
    await seedCatalog(db);
    await createStaffUser(db, {
      name: "Test owner",
      email: "store-owner@test.example",
      password: "store-test-only-password",
      role: "owner",
    });
    const login = await request(
      "/api/auth/sign-in/email",
      "POST",
      { email: "store-owner@test.example", password: "store-test-only-password" },
      false,
    );
    expect(login.status).toBe(200);
    cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const [cat] = await db
      .insert(schema.categories)
      .values({ slug: "store-test", nameEn: "Store Test", nameMl: "ടെസ്റ്റ്" })
      .returning();
    categoryId = cat!.id;
    const [product] = await db
      .insert(schema.products)
      .values({
        slug: "store-test-tomato",
        categoryId,
        nameEn: "Store Tomato",
        nameMl: "തക്കാളി",
        hsnCode: "0702",
        sellingType: "loose",
      })
      .returning();
    productId = product!.id;
    const [packed] = await db
      .insert(schema.products)
      .values({
        slug: "store-test-rice",
        categoryId,
        nameEn: "Store Rice",
        nameMl: "അരി",
        hsnCode: "1006",
        sellingType: "packaged",
        gstRate: 5,
      })
      .returning();
    packagedId = packed!.id;
    const [v] = await db
      .insert(schema.productVariants)
      .values({
        productId,
        sku: "store-test-500",
        unitType: "weight",
        baseQuantity: 500,
        labelEn: "500 g",
        labelMl: "500 ഗ്രാം",
        pricePaise: 6000,
      })
      .returning();
    variantId = v!.id;
    const [pv] = await db
      .insert(schema.productVariants)
      .values({
        productId: packagedId,
        sku: "store-test-rice",
        unitType: "weight",
        baseQuantity: 5000,
        labelEn: "5 kg",
        labelMl: "5 കിലോ",
        pricePaise: 32500,
      })
      .returning();
    packVariantId = pv!.id;
    await db.insert(schema.inventory).values([
      { productId, stockQuantity: 10000 },
      { productId: packagedId, stockQuantity: 20 },
    ]);
    const [slot] = await db
      .insert(schema.deliverySlots)
      .values({
        nameEn: "Store Test Evening",
        nameMl: "വൈകുന്നേരം",
        startMinutes: 1200,
        endMinutes: 1260,
        capacity: 50,
        cutoffMinutes: 0,
      })
      .returning();
    slotId = slot!.id;
    await db
      .update(schema.deliveryZones)
      .set({ minOrderPaise: 10000, deliveryFeePaise: 2000, freeDeliveryThresholdPaise: 30000 })
      .where(eq(schema.deliveryZones.pincode, "686001"));
    await db.insert(schema.productImages).values({ productId, url: "/media/test.svg" });
  });

  it("presentation upgrade preserves orders, prices, stock and uploaded photos, and leaves later owner contact changes intact", async () => {
    await placeWhatsAppOrder({ ...guestContext(), requestConfirmation: true }, input());
    const snapshot = await inv();
    const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, "tomato"));
    await db
      .update(schema.productImages)
      .set({ url: "/media/produce/tomato.svg" })
      .where(eq(schema.productImages.productId, product!.id));
    const [variant] = await db
      .select()
      .from(schema.productVariants)
      .where(eq(schema.productVariants.id, variantId));
    await applyStorePresentation(db, "https://shop.test");
    expect(await countOrders()).toBe(1);
    expect((await inv()).stockQuantity).toBe(snapshot.stockQuantity);
    expect((await inv()).reservedQuantity).toBe(snapshot.reservedQuantity);
    expect(
      (await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)))[0]!
        .pricePaise,
    ).toBe(variant!.pricePaise);
    expect(
      (
        await db.select().from(schema.productImages).where(eq(schema.productImages.productId, product!.id))
      )[0]!.url,
    ).toBe("https://shop.test/catalog/photos/tomato.webp");
    await db
      .update(schema.productImages)
      .set({ url: "https://owner.test/my-tomato.webp" })
      .where(eq(schema.productImages.productId, product!.id));
    await db
      .update(schema.settings)
      .set({ value: sql`${schema.settings.value} || '{"whatsapp":"+919800000094"}'::jsonb` })
      .where(eq(schema.settings.key, "shop.profile"));
    await applyStorePresentation(db, "https://shop.test");
    expect(
      (
        await db.select().from(schema.productImages).where(eq(schema.productImages.productId, product!.id))
      )[0]!.url,
    ).toBe("https://owner.test/my-tomato.webp");
    expect(
      (
        (await db.select().from(schema.settings).where(eq(schema.settings.key, "shop.profile")))[0]!
          .value as { whatsapp: string }
      ).whatsapp,
    ).toBe("+919800000094");
    await db
      .update(schema.settings)
      .set({ value: sql`${schema.settings.value} || '{"whatsapp":"+919447114449"}'::jsonb` })
      .where(eq(schema.settings.key, "shop.profile"));
  });

  it("accepts a Kottayam WhatsApp request without enabled zones or slots, with no reservation", async () => {
    await db.update(schema.deliveryZones).set({ isActive: false });
    await db.update(schema.deliverySlots).set({ isActive: false });
    const payload = input({ slotId: undefined, slotDate: undefined });
    const response = await request("/api/whatsapp/request", "POST", payload, false);
    expect(response.status).toBe(201);
    const result = (await response.json()).data;
    expect(result.awaitingConfirmation).toBe(true);
    expect(result.subtotalPaise).toBe(12000);
    expect((await inv()).reservedQuantity).toBe(0);
    expect(await db.select().from(schema.slotBookings)).toHaveLength(0);
    const message = new URL(result.whatsappLink).searchParams.get("text")!;
    expect(message).toContain("To be confirmed by the shop");
    expect(message).not.toContain("Delivery: FREE");
    const replay = await request("/api/whatsapp/request", "POST", payload, false);
    expect((await replay.json()).data.orderId).toBe(result.orderId);
    expect(await countOrders()).toBe(1);
    const tracked = await request(
      `/api/checkout/guest/${result.orderId}?token=${result.guestToken}`,
      "GET",
      undefined,
      false,
    );
    expect((await tracked.json()).data.status).toBe("awaiting_confirmation");
    const processed = await processBatch(ctx);
    expect(processed).toBeGreaterThan(0);
    expect((await db.select().from(schema.outboxEvents)).every((e) => e.status === "processed")).toBe(true);
    await db.update(schema.deliveryZones).set({ isActive: true });
    await db.update(schema.deliverySlots).set({ isActive: true });
  });

  it("rejects WhatsApp requests outside Kottayam without writing an order", async () => {
    const payload = input();
    payload.customer.pincode = "686691";
    const response = await request("/api/whatsapp/request", "POST", payload, false);
    expect(response.status).toBe(400);
    expect(await countOrders()).toBe(0);
  });

  it("owner confirmation adds agreed delivery charges and reserves stock exactly once", async () => {
    const result = await placeWhatsAppOrder({ ...guestContext(), requestConfirmation: true }, input());
    const params = { deliveryFeePaise: 3500, deliveryDate: date, deliveryNote: "5 PM to 7 PM" };
    expect((await request(`/api/admin/orders/${result.orderId}/confirm`, "POST", params, false)).status).toBe(
      401,
    );
    const response = await request(`/api/admin/orders/${result.orderId}/confirm`, "POST", params);
    expect(response.status).toBe(200);
    const order = (await response.json()).data;
    expect(order.status).toBe("confirmed");
    expect(order.grandTotalPaise).toBe(15500);
    expect(order.deliveryFeePaise).toBe(3500);
    expect((await inv()).reservedQuantity).toBe(1000);
    expect((await request(`/api/admin/orders/${result.orderId}/confirm`, "POST", params)).status).toBe(409);
    expect((await inv()).reservedQuantity).toBe(1000);
    await cancelOrder(ctx, {
      orderId: result.orderId,
      reason: "Customer cancelled",
      actor: null,
      customerInitiated: false,
    });
    expect((await inv()).reservedQuantity).toBe(0);
  });

  it("cancelling an unconfirmed request leaves another order's reservation intact", async () => {
    await placeWhatsAppOrder(guestContext(), input());
    const result = await placeWhatsAppOrder({ ...guestContext(), requestConfirmation: true }, input());
    await cancelOrder(ctx, {
      orderId: result.orderId,
      reason: "Duplicate request",
      actor: null,
      customerInitiated: false,
    });
    expect((await inv()).reservedQuantity).toBe(1000);
  });

  it("confirmation fails atomically if stock has sold out since the request", async () => {
    const result = await placeWhatsAppOrder({ ...guestContext(), requestConfirmation: true }, input());
    await db
      .update(schema.inventory)
      .set({ stockQuantity: 500 })
      .where(eq(schema.inventory.productId, productId));
    await expect(
      confirmWhatsAppRequest(ctx, {
        orderId: result.orderId,
        deliveryFeePaise: 3500,
        deliveryDate: date,
        deliveryNote: "Evening",
        actor: null,
      }),
    ).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    const order = await getOrderDTO(db, result.orderId);
    expect(order.status).toBe("awaiting_confirmation");
    expect(order.deliveryFeePaise).toBe(0);
    expect((await inv()).reservedQuantity).toBe(0);
  });

  beforeEach(async () => {
    await db.delete(schema.orders);
    await db.delete(schema.carts);
    await db.delete(schema.outboxEvents);
    await db.delete(schema.notifications);
    await db.delete(schema.slotBookings);
    await db.delete(schema.inventoryMovements);
    await db.delete(schema.settings).where(eq(schema.settings.key, "analytics.counters"));
    await db
      .update(schema.inventory)
      .set({ stockQuantity: 10000, reservedQuantity: 0, trackStock: true })
      .where(eq(schema.inventory.productId, productId));
    await db
      .update(schema.inventory)
      .set({ stockQuantity: 20, reservedQuantity: 0, trackStock: true })
      .where(eq(schema.inventory.productId, packagedId));
    await db.update(schema.products).set({ isActive: true }).where(eq(schema.products.id, productId));
    await db.update(schema.categories).set({ isActive: true }).where(eq(schema.categories.id, categoryId));
    await db
      .update(schema.productVariants)
      .set({ isActive: true, pricePaise: 6000 })
      .where(eq(schema.productVariants.id, variantId));
    await db.update(schema.deliverySlots).set({ capacity: 50 }).where(eq(schema.deliverySlots.id, slotId));
    await db
      .update(schema.settings)
      .set({ value: { whatsapp: shopPhone } })
      .where(eq(schema.settings.key, "shop.profile"));
  });

  it("guest checkout saves server totals, an address snapshot and a private receipt without claiming a phone account", async () => {
    await db
      .insert(schema.user)
      .values({
        id: "claimed-guest-phone",
        name: "Real phone owner",
        email: "",
        phoneNumber: "+919800000090",
      })
      .onConflictDoNothing();
    const res = await request("/api/checkout/guest", "POST", input(), false);
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.grandTotalPaise).toBe(14000);
    expect(data.guestToken).toMatch(/^[a-f0-9]{64}$/);
    const order = await getOrderDTO(db, data.orderId);
    expect(order.source).toBe("web");
    expect(order.items[0]?.hsnCode).toBe("0702");
    const [saved] = await db.select().from(schema.orders).where(eq(schema.orders.id, data.orderId));
    expect(saved?.userId).toBeNull();
    expect(
      (await db.select().from(schema.addresses).where(eq(schema.addresses.userId, "claimed-guest-phone")))
        .length,
    ).toBe(0);
    expect(
      (await request(`/api/checkout/guest/${data.orderId}?token=${data.guestToken}`, "GET", undefined, false))
        .status,
    ).toBe(200);
    expect(
      (await request(`/api/checkout/guest/${data.orderId}?token=${"0".repeat(64)}`, "GET", undefined, false))
        .status,
    ).toBe(401);
    expect((await request(`/api/checkout/guest/${data.orderId}`, "GET", undefined, false)).status).toBe(401);
    expect((await request("/api/whatsapp/customer?phone=9800000090", "GET", undefined, false)).status).toBe(
      404,
    );
  });

  it.each(["670001", "686691", "110001"])(
    "rejects outside-district pincode %s even if a legacy zone is active",
    async (pincode) => {
      const [legacy] = await db
        .insert(schema.deliveryZones)
        .values({
          pincode,
          areaNameEn: "Legacy outside zone",
          isActive: true,
        })
        .onConflictDoUpdate({ target: schema.deliveryZones.pincode, set: { isActive: true } })
        .returning();
      const listed = (await (await request("/api/delivery/zones", "GET", undefined, false)).json()).data;
      expect(listed.some((z: { pincode: string }) => z.pincode === pincode)).toBe(false);
      const check = await request("/api/delivery/check-pincode", "POST", { pincode }, false);
      expect((await check.json()).data.served).toBe(false);
      const preview = await request(
        `/api/cart/preview?pincode=${pincode}`,
        "POST",
        { items: input().items },
        false,
      );
      expect((await preview.json()).data.totals.deliveryFeePaise).toBeNull();
      const orderInput = input();
      orderInput.customer.pincode = pincode;
      for (const path of ["/api/checkout/guest", "/api/whatsapp/order"]) {
        const response = await request(path, "POST", orderInput, false);
        expect(response.status).toBe(422);
        expect((await response.json()).code).toBe("ZONE_NOT_SERVED");
      }
      expect((await request("/api/cart/items", "POST", { items: input().items })).status).toBe(200);
      expect(
        (await (await request(`/api/cart?pincode=${pincode}`)).json()).data.totals.deliveryFeePaise,
      ).toBeNull();
      const address = {
        label: "Home",
        contactName: "Customer",
        contactPhone: "+919800000090",
        line1: "Legacy customer house",
        pincode,
        city: "Outside district",
        isDefault: false,
      };
      const [owner] = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.email, "store-owner@test.example"));
      const [saved] = await db
        .insert(schema.addresses)
        .values({ ...address, userId: owner!.id })
        .returning();
      for (const location of [{ address }, { addressId: saved!.id }]) {
        const response = await request("/api/checkout/order", "POST", {
          ...location,
          slotId,
          slotDate: date,
          paymentMethod: "cod",
          idempotencyKey: `test-${randomUUID()}`,
        });
        expect(response.status).toBe(422);
        expect((await response.json()).code).toBe("ZONE_NOT_SERVED");
      }
      const enable = await request(`/api/admin/zones/${legacy!.id}`, "PATCH", { isActive: true });
      expect(enable.status).toBe(400);
      expect((await enable.json()).message).toContain("Kottayam");
      expect(await countOrders()).toBe(0);
      expect((await inv()).reservedQuantity).toBe(0);
      expect(await db.select().from(schema.slotBookings)).toHaveLength(0);
    },
  );

  it("admin accepts a Kottayam zone, rejects another district, and pausing blocks new orders", async () => {
    expect(
      (
        await request("/api/admin/zones", "POST", {
          pincode: "686691",
          areaNameEn: "Outside district",
          minOrderPaise: 9900,
          deliveryFeePaise: 2900,
        })
      ).status,
    ).toBe(400);
    const created = await request("/api/admin/zones", "POST", {
      pincode: "686002",
      areaNameEn: "Kottayam Collectorate",
      minOrderPaise: 9900,
      deliveryFeePaise: 2900,
    });
    expect(created.status).toBe(201);
    const zone = (await created.json()).data;
    expect((await request(`/api/admin/zones/${zone.id}`, "PATCH", { pincode: "686691" })).status).toBe(400);
    expect((await request(`/api/admin/zones/${zone.id}`, "PATCH", { isActive: false })).status).toBe(200);
    const orderInput = input();
    orderInput.customer.pincode = "686002";
    expect((await request("/api/checkout/guest", "POST", orderInput, false)).status).toBe(422);
    expect((await request(`/api/admin/zones/${zone.id}`, "PATCH", { isActive: true })).status).toBe(200);
    expect((await request("/api/checkout/guest", "POST", orderInput, false)).status).toBe(201);
  });

  it("publishes configured shop contacts without requiring login or exposing admin settings", async () => {
    await db
      .update(schema.settings)
      .set({
        value: {
          name: "PGRS Peedika",
          phone: shopPhone,
          whatsapp: shopPhone,
          email: "shop@test.example",
          addressLine: "Shop house, Kottayam district, Kerala",
          openTime: "07:00",
          closeTime: "20:00",
          weeklyClosedDay: "sunday",
          gstin: "32ABCDE1234F1Z5",
          internalSecret: "private-setting",
        },
      })
      .where(eq(schema.settings.key, "shop.profile"));
    const response = await request("/api/shop", "GET", undefined, false);
    expect(response.status).toBe(200);
    const profile = (await response.json()).data;
    expect(profile.addressLine).toContain("Kottayam");
    expect(profile.whatsapp).toBe(shopPhone);
    expect(profile).not.toHaveProperty("gstin");
    expect(profile).not.toHaveProperty("internalSecret");
    expect((await request("/api/admin/settings", "GET", undefined, false)).status).toBe(401);
  });

  it("the district migration pauses outside zones without replacing shop coverage, prices or historical orders", async () => {
    const order = await placeWhatsAppOrder(guestContext(), input());
    await db
      .insert(schema.deliveryZones)
      .values({ pincode: "670001", areaNameEn: "Legacy outside zone", isActive: true })
      .onConflictDoUpdate({ target: schema.deliveryZones.pincode, set: { isActive: true } });
    const migration = await readFile(
      new URL("../../../packages/db/migrations/0004_kottayam_delivery.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) await db.execute(sql.raw(statement));
    expect(
      (await db.select().from(schema.deliveryZones).where(eq(schema.deliveryZones.pincode, "670001")))[0]
        ?.isActive,
    ).toBe(false);
    const zone = (
      await db.select().from(schema.deliveryZones).where(eq(schema.deliveryZones.pincode, "686001"))
    )[0]!;
    expect(zone.isActive).toBe(true);
    expect(zone.minOrderPaise).toBe(10000);
    expect(zone.deliveryFeePaise).toBe(2000);
    expect((await getOrderDTO(db, order.orderId)).address.pincode).toBe("686001");
    expect(await countOrders()).toBe(1);
  });

  it("concurrent requests with the same checkout key reserve stock and book a slot only once", async () => {
    const orderInput = input();
    const results = await Promise.all([
      placeWhatsAppOrder(guestContext(), orderInput),
      placeWhatsAppOrder(guestContext(), orderInput),
    ]);
    expect(results[0]?.orderId).toBe(results[1]?.orderId);
    expect(results.filter((r) => r.replay)).toHaveLength(1);
    expect(await countOrders()).toBe(1);
    expect((await inv()).reservedQuantity).toBe(1000);
    const bookings = await db
      .select()
      .from(schema.slotBookings)
      .where(eq(schema.slotBookings.slotId, slotId));
    expect(bookings[0]?.bookedCount).toBe(1);
    expect(
      (await db.select().from(schema.outboxEvents)).filter((e) => e.eventName === "order.placed"),
    ).toHaveLength(1);
  });

  it("different concurrent orders receive distinct order numbers", async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () => placeWhatsAppOrder(guestContext(), input())),
    );
    expect(new Set(results.map((r) => r.orderNumber)).size).toBe(4);
  });

  it("competing orders cannot oversell product stock", async () => {
    await db
      .update(schema.inventory)
      .set({ stockQuantity: 1000 })
      .where(eq(schema.inventory.productId, productId));
    const results = await Promise.allSettled([
      placeWhatsAppOrder(guestContext(), input()),
      placeWhatsAppOrder(guestContext(), input()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await inv()).reservedQuantity).toBe(1000);
    expect(await countOrders()).toBe(1);
  });

  it("slot capacity failure rolls back stock and the order", async () => {
    await db.update(schema.deliverySlots).set({ capacity: 1 }).where(eq(schema.deliverySlots.id, slotId));
    await placeWhatsAppOrder(guestContext(), input());
    await expect(placeWhatsAppOrder(guestContext(), input())).rejects.toThrow(/full/i);
    expect((await inv()).reservedQuantity).toBe(1000);
    expect(await countOrders()).toBe(1);
  });

  it("weekly closure and invalid calendar dates reject delivery without reserving stock", async () => {
    const weeklyClosedDay = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" })
      .format(new Date(`${date}T00:00:00Z`))
      .toLowerCase();
    await db
      .update(schema.settings)
      .set({ value: { whatsapp: shopPhone, weeklyClosedDay } })
      .where(eq(schema.settings.key, "shop.profile"));
    const slots = await request(`/api/delivery/slots?date=${date}`, "GET", undefined, false);
    expect(
      (await slots.json()).data.every((s: { closed: boolean; bookable: boolean }) => s.closed && !s.bookable),
    ).toBe(true);
    await expect(placeWhatsAppOrder(guestContext(), input())).rejects.toThrow(/closed/i);
    await expect(placeWhatsAppOrder(guestContext(), input({ slotDate: "2099-02-30" }))).rejects.toThrow(
      /date/i,
    );
    expect((await inv()).reservedQuantity).toBe(0);
    expect(await countOrders()).toBe(0);
  });

  it("a malformed optional WhatsApp number cannot fail a saved website checkout", async () => {
    const result = await placeWhatsAppOrder(
      { ...guestContext(), source: "web", shopWhatsApp: async () => "wrong" },
      input(),
    );
    expect(result.whatsappLink).toBe("");
    expect(await countOrders()).toBe(1);
    expect(
      (await request(`/api/checkout/guest/not-a-uuid?token=${result.guestToken}`, "GET", undefined, false))
        .status,
    ).toBe(404);
  });

  it("simultaneous payment notifications capture once and publish one confirmation", async () => {
    const result = await placeWhatsAppOrder(guestContext(), input());
    await db
      .update(schema.orders)
      .set({ paymentMethod: "razorpay", status: "pending_payment" })
      .where(eq(schema.orders.id, result.orderId));
    await db.insert(schema.payments).values({
      orderId: result.orderId,
      provider: "razorpay",
      method: "upi",
      amountPaise: result.grandTotalPaise,
      status: "created",
      providerOrderId: "store-capture-once",
    });
    const captures = await Promise.all(
      Array.from({ length: 2 }, () =>
        capturePayment(ctx, {
          providerOrderId: "store-capture-once",
          providerPaymentId: "paid-once",
          amountPaise: result.grandTotalPaise,
        }),
      ),
    );
    expect(captures.map((r) => r.alreadyCaptured).sort()).toEqual([false, true]);
    const events = await db.select().from(schema.outboxEvents);
    expect(events.filter((e) => e.eventName === "payment.captured")).toHaveLength(1);
    expect(events.filter((e) => e.eventName === "order.confirmed")).toHaveLength(1);
  });

  it("WhatsApp configuration failures leave no order or reservation", async () => {
    await expect(
      placeWhatsAppOrder(
        {
          ...guestContext(),
          shopWhatsApp: async () => {
            throw new Error("not configured");
          },
        },
        input(),
      ),
    ).rejects.toThrow(/configured/);
    expect(await countOrders()).toBe(0);
    expect((await inv()).reservedQuantity).toBe(0);
  });

  it("web guest checkout works without a WhatsApp number", async () => {
    await db
      .update(schema.settings)
      .set({ value: { whatsapp: "" } })
      .where(eq(schema.settings.key, "shop.profile"));
    const res = await request("/api/checkout/guest", "POST", input(), false);
    expect(res.status).toBe(201);
    expect((await res.json()).data.whatsappLink).toBe("");
  });

  it("rejects hidden categories, products, invalid quantities and missing retry keys", async () => {
    await db.update(schema.categories).set({ isActive: false }).where(eq(schema.categories.id, categoryId));
    const preview = await request(
      "/api/cart/preview",
      "POST",
      { items: [{ variantId, quantity: 2 }] },
      false,
    );
    expect((await preview.json()).data.items).toEqual([]);
    expect((await request(`/api/catalog/products/store-test-tomato`, "GET", undefined, false)).status).toBe(
      404,
    );
    await expect(placeWhatsAppOrder(guestContext(), input())).rejects.toThrow(/available/);
    await db.update(schema.categories).set({ isActive: true }).where(eq(schema.categories.id, categoryId));
    await db.update(schema.products).set({ isActive: false }).where(eq(schema.products.id, productId));
    await expect(placeWhatsAppOrder(guestContext(), input())).rejects.toThrow(/available/);
    expect(
      (await request("/api/checkout/guest", "POST", input({ items: [{ variantId, quantity: -1 }] }), false))
        .status,
    ).toBe(400);
    expect(
      (await request("/api/checkout/guest", "POST", input({ idempotencyKey: undefined }), false)).status,
    ).toBe(400);
    expect(await countOrders()).toBe(0);
  });

  it("packaged weight labels reserve and consume packs and cannot have their weight-adjusted bill changed", async () => {
    const r = await placeWhatsAppOrder(
      guestContext(),
      input({ items: [{ variantId: packVariantId, quantity: 2 }] }),
    );
    expect((await inv(packagedId)).reservedQuantity).toBe(2);
    const order = await getOrderDTO(db, r.orderId);
    expect(order.items[0]?.unitType).toBe("unit");
    const packed = await packOrder(ctx, {
      orderId: r.orderId,
      weights: [{ itemId: order.items[0]!.id, finalQtyGrams: 9000 }],
      actor: null,
    });
    expect(packed.finalGrandTotalPaise).toBe(r.grandTotalPaise);
    expect((await inv(packagedId)).stockQuantity).toBe(18);
    expect((await inv(packagedId)).reservedQuantity).toBe(0);
  });

  it("double packing consumes stock once and preserves the final weighed bill", async () => {
    const r = await placeWhatsAppOrder(guestContext(), input());
    const order = await getOrderDTO(db, r.orderId);
    const packInput = {
      orderId: r.orderId,
      weights: [{ itemId: order.items[0]!.id, finalQtyGrams: 900 }],
      actor: null,
    };
    const results = await Promise.allSettled([packOrder(ctx, packInput), packOrder(ctx, packInput)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await inv()).stockQuantity).toBe(9100);
    expect((await inv()).reservedQuantity).toBe(0);
    expect((await getOrderDTO(db, r.orderId)).finalGrandTotalPaise).toBe(12800);
  });

  it("double cancellation releases stock and capacity once", async () => {
    const r = await placeWhatsAppOrder(guestContext(), input());
    const cancel = {
      orderId: r.orderId,
      reason: "Customer changed plan",
      actor: null,
      customerInitiated: false,
    };
    const results = await Promise.allSettled([cancelOrder(ctx, cancel), cancelOrder(ctx, cancel)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await inv()).reservedQuantity).toBe(0);
    expect((await inv()).stockQuantity).toBe(10000);
    expect((await db.select().from(schema.slotBookings))[0]?.bookedCount).toBe(0);
  });

  it("untracked products can be ordered and packed without negative stock", async () => {
    await db
      .update(schema.inventory)
      .set({ trackStock: false, stockQuantity: 0 })
      .where(eq(schema.inventory.productId, productId));
    const r = await placeWhatsAppOrder(guestContext(), input());
    await packOrder(ctx, { orderId: r.orderId, weights: [], actor: null });
    expect((await inv()).stockQuantity).toBe(0);
    expect((await inv()).reservedQuantity).toBe(0);
  });

  it("price and image edits preserve variant IDs, image-only edits preserve variants", async () => {
    const patch = await request(`/api/admin/products/${productId}`, "PATCH", {
      variants: [
        {
          id: variantId,
          unitType: "weight",
          baseQuantity: 500,
          labelEn: "500 g",
          labelMl: "500 ഗ്രാം",
          pricePaise: 7000,
        },
      ],
    });
    expect(patch.status).toBe(200);
    expect(
      (await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)))[0]
        ?.pricePaise,
    ).toBe(7000);
    expect(
      (await db.select().from(schema.productImages).where(eq(schema.productImages.productId, productId)))[0]
        ?.url,
    ).toBe("/media/test.svg");
    expect(
      (await request(`/api/admin/products/${productId}`, "PATCH", { images: [{ url: "/media/new.svg" }] }))
        .status,
    ).toBe(200);
    expect(
      (await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)))[0]
        ?.isActive,
    ).toBe(true);
    // Restore image for independent tests.
    await db
      .update(schema.productImages)
      .set({ url: "/media/test.svg" })
      .where(eq(schema.productImages.productId, productId));
  });

  it("admin stock corrections cannot go below reserved stock, and concurrent additions do not get lost", async () => {
    await placeWhatsAppOrder(guestContext(), input());
    expect(
      (
        await request("/api/admin/inventory/adjust", "POST", {
          productId,
          quantityDelta: -9500,
          reason: "Stock correction",
        })
      ).status,
    ).toBe(409);
    const add = { productId, quantityDelta: 1000, reason: "Morning purchase", movementType: "purchase" };
    const results = await Promise.all([
      request("/api/admin/inventory/adjust", "POST", add),
      request("/api/admin/inventory/adjust", "POST", add),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((await inv()).stockQuantity).toBe(12000);
    expect((await request(`/api/admin/products/${productId}`, "DELETE")).status).toBe(409);
  });

  it("catalog and threshold edits can run alongside incoming orders without deadlocking", async () => {
    await db
      .update(schema.inventory)
      .set({ stockQuantity: 100000 })
      .where(eq(schema.inventory.productId, productId));
    const results = await Promise.all(
      Array.from({ length: 5 }, async (_, n) => {
        const [order, edit, stock] = await Promise.all([
          placeWhatsAppOrder(guestContext(), input()),
          request(`/api/admin/products/${productId}`, "PATCH", {
            nameEn: "Store Tomato",
            lowStockThreshold: 5000 + n,
          }),
          request("/api/admin/inventory/adjust", "POST", {
            productId,
            quantityDelta: 1000,
            reason: "Market purchase",
          }),
        ]);
        expect(edit.status).toBe(200);
        expect(stock.status).toBe(200);
        return order;
      }),
    );
    expect(results).toHaveLength(5);
    expect((await inv()).reservedQuantity).toBe(5000);
    expect((await inv()).stockQuantity).toBe(105000);
  });

  it("unauthenticated visitors cannot edit products, stock or prices", async () => {
    expect(
      (await request(`/api/admin/products/${productId}`, "PATCH", { nameEn: "Hacked" }, false)).status,
    ).toBe(401);
    expect(
      (
        await request(
          "/api/admin/inventory/adjust",
          "POST",
          { productId, quantityDelta: 1, reason: "Hacked" },
          false,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          "/api/admin/catalog/quick-price",
          "POST",
          { updates: [{ variantId, pricePaise: 1 }] },
          false,
        )
      ).status,
    ).toBe(401);
  });

  it("failed cart merges keep the whole server basket unchanged", async () => {
    const result = await request("/api/cart/merge", "POST", {
      items: [
        { variantId, quantity: 1 },
        { variantId: randomUUID(), quantity: 1 },
      ],
    });
    expect(result.status).toBe(404);
    expect((await (await request("/api/cart")).json()).data.items).toEqual([]);
    await db.update(schema.categories).set({ isActive: false }).where(eq(schema.categories.id, categoryId));
    expect((await request("/api/cart/items", "POST", { items: [{ variantId, quantity: 1 }] })).status).toBe(
      404,
    );
  });

  it("category creation, edit, duplicate slug and delete constraints return clear responses", async () => {
    const res = await request("/api/admin/categories", "POST", {
      slug: "store-category-crud",
      nameEn: "New vegetables",
      nameMl: "പച്ചക്കറികൾ",
    });
    expect(res.status).toBe(201);
    const id = (await res.json()).data.id;
    expect(
      (await request(`/api/admin/categories/${id}`, "PATCH", { nameEn: "Changed vegetables" })).status,
    ).toBe(200);
    expect((await request(`/api/admin/categories/${id}`, "PATCH", { slug: "store-test" })).status).toBe(409);
    expect((await request(`/api/admin/categories/${categoryId}`, "DELETE")).status).toBe(409);
    expect((await request(`/api/admin/categories/${id}`, "DELETE")).status).toBe(200);
  });

  it("daily price changes are reflected in the guest's server-priced order", async () => {
    await db
      .update(schema.productVariants)
      .set({ mrpPaise: 7500 })
      .where(eq(schema.productVariants.id, variantId));
    expect(
      (
        await request("/api/admin/catalog/quick-price", "POST", {
          updates: [{ variantId, pricePaise: 6500 }],
        })
      ).status,
    ).toBe(200);
    const result = await placeWhatsAppOrder(guestContext(), input());
    expect(result.subtotalPaise).toBe(13000);
    expect((await getOrderDTO(db, result.orderId)).items[0]?.unitPricePaise).toBe(6500);
    expect(
      (await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)))[0]
        ?.mrpPaise,
    ).toBe(7500);
    const mrpChange = await request("/api/admin/catalog/quick-price", "POST", {
      updates: [{ variantId, pricePaise: 6500, mrpPaise: 8000 }],
    });
    expect((await mrpChange.json()).data.updated).toBe(1);
    expect(
      (await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)))[0]
        ?.mrpPaise,
    ).toBe(8000);
  });

  it("worker failures roll back notifications and counters, retry successfully, and do not resend processed events", async () => {
    await placeWhatsAppOrder(guestContext(), input());
    let failSms = true;
    const send = vi.fn(async (message: { channel: string }) => {
      if (message.channel === "sms" && failSms) throw new Error("Provider unavailable");
      return { providerMessageId: "test-provider-id" };
    });
    const workerCtx: AppContext = { ...ctx, notifier: { name: "test", send } };
    await processBatch(workerCtx);
    const [event] = await db.select().from(schema.outboxEvents);
    expect(event?.status).toBe("pending");
    expect(event?.attempts).toBe(1);
    expect(await db.select().from(schema.notifications)).toHaveLength(0);
    expect(
      await db.select().from(schema.settings).where(eq(schema.settings.key, "analytics.counters")),
    ).toHaveLength(0);
    const firstKey = (send.mock.calls[0]?.[0] as { idempotencyKey?: string }).idempotencyKey;
    expect(firstKey).toContain(event!.id);
    failSms = false;
    await db
      .update(schema.outboxEvents)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(schema.outboxEvents.id, event!.id));
    await processBatch(workerCtx);
    expect((await db.select().from(schema.outboxEvents))[0]?.status).toBe("processed");
    const [counters] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "analytics.counters"));
    expect((counters?.value as { ordersPlaced: number }).ordersPlaced).toBe(1);
    const sends = send.mock.calls.length;
    expect(await processBatch(workerCtx)).toBe(0);
    expect(send.mock.calls.length).toBe(sends);
  });

  it("worker dead-letters invalid payloads without poisoning the batch", async () => {
    await db.insert(schema.outboxEvents).values({ eventName: "order.placed", payload: {}, maxAttempts: 1 });
    await processBatch({
      ...ctx,
      notifier: { name: "test", send: async () => ({ providerMessageId: null }) },
    });
    expect((await db.select().from(schema.outboxEvents))[0]?.status).toBe("dead");
  });

  it("inbound WhatsApp signatures, repeat message IDs and website receipts are handled safely", async () => {
    const secretBefore = ctx.env.WHATSAPP_APP_SECRET;
    ctx.env.WHATSAPP_APP_SECRET = "test-whatsapp-signature-secret";
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: "Inbound customer" } }],
                messages: [
                  {
                    id: "wamid.store-test",
                    from: "919800000091",
                    type: "text",
                    text: {
                      body: "1 kg Store Tomato\nName: Inbound guest\nAddress: Inbound house, Market road\nPincode: 686001",
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const signature = `sha256=${createHmac("sha256", ctx.env.WHATSAPP_APP_SECRET).update(body).digest("hex")}`;
    expect(
      (
        await app.request("/api/whatsapp/webhook", {
          method: "POST",
          body,
          headers: { "x-hub-signature-256": "wrong" },
        })
      ).status,
    ).toBe(401);
    const result = await app.request("/api/whatsapp/webhook", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": signature },
    });
    expect(result.status).toBe(200);
    expect((await result.json()).data.ordersCreated).toBe(1);
    await app.request("/api/whatsapp/webhook", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": signature },
    });
    expect(await countOrders()).toBe(1);
    payload.entry[0]!.changes[0]!.value.messages[0]!.id = "wamid.website-receipt";
    payload.entry[0]!.changes[0]!.value.messages[0]!.text.body =
      "🥬 *New order PGRS-261002-0001* (via WhatsApp)\nStore Tomato\nPincode: 686001";
    const receipt = JSON.stringify(payload);
    await app.request("/api/whatsapp/webhook", {
      method: "POST",
      body: receipt,
      headers: {
        "x-hub-signature-256": `sha256=${createHmac("sha256", ctx.env.WHATSAPP_APP_SECRET).update(receipt).digest("hex")}`,
      },
    });
    expect(await countOrders()).toBe(1);
    ctx.env.WHATSAPP_APP_SECRET = secretBefore;
  });
});
