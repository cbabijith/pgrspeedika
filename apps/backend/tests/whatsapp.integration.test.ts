import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, schema, type Database } from "@pgrs/db";
import { parseWhatsAppOrderText } from "../src/services/whatsapp-parser";
import {
  findOrCreateCustomerByPhone,
  placeWhatsAppOrder,
  buildWhatsAppOrderMessage,
  waMeLink,
  type WhatsAppOrderContext,
} from "../src/services/whatsapp-orders";
import { istTodayDateString } from "../src/services/slots";

const dbUrl = process.env.DATABASE_URL;
const d = dbUrl ? describe : describe.skip;

let db: Database | null = null;
let connected = false;
const SHOP_WA = "+919999888877";

async function tryConnect(): Promise<boolean> {
  if (!dbUrl) return false;
  db = createDb(dbUrl, { max: 4 });
  try {
    await db.select({ key: schema.settings.key }).from(schema.settings).limit(1);
    return true;
  } catch {
    db = null;
    return false;
  }
}

function ctx(): WhatsAppOrderContext {
  return { db: db!, shopWhatsApp: async () => SHOP_WA };
}

d("whatsapp order lane (integration)", () => {
  let tomatoVariantId = "";
  let riceVariantId = "";
  let tomato5kgVariantId = "";

  beforeAll(async () => {
    connected = await tryConnect();
    if (!connected || !db) return;
    // Clear business tables.
    for (const table of [
      schema.outboxEvents,
      schema.couponRedemptions,
      schema.refunds,
      schema.payments,
      schema.orderStatusHistory,
      schema.orderItems,
      schema.orders,
      schema.cartItems,
      schema.carts,
      schema.inventoryMovements,
      schema.inventory,
      schema.productImages,
      schema.productVariants,
      schema.products,
      schema.categories,
      schema.slotBookings,
      schema.deliverySlots,
      schema.deliveryZones,
      schema.addresses,
      schema.user,
      schema.settings,
    ]) {
      await db.delete(table);
    }

    const [cat] = await db
      .insert(schema.categories)
      .values({ slug: "wa-cat", nameEn: "WA Category", nameMl: "വാ വിഭാഗം" })
      .returning();
    const [tomato] = await db
      .insert(schema.products)
      .values({
        slug: "wa-tomato",
        categoryId: cat!.id,
        nameEn: "Tomato",
        nameMl: "തക്കാളി",
        sellingType: "loose",
        searchKeywords: "thakkali",
      })
      .returning();
    const [rice] = await db
      .insert(schema.products)
      .values({
        slug: "wa-matta-rice",
        categoryId: cat!.id,
        nameEn: "Matta Rice",
        nameMl: "മട്ട അരി",
        sellingType: "packaged",
        gstRate: 5,
      })
      .returning();
    const variants = await db
      .insert(schema.productVariants)
      .values([
        {
          productId: tomato!.id,
          sku: "wa-tom-250",
          unitType: "weight",
          baseQuantity: 250,
          labelEn: "250 g",
          labelMl: "250 ഗ്രാം",
          pricePaise: 1500,
          stepQuantity: 250,
          sortOrder: 0,
        },
        {
          productId: tomato!.id,
          sku: "wa-tom-500",
          unitType: "weight",
          baseQuantity: 500,
          labelEn: "500 g",
          labelMl: "500 ഗ്രാം",
          pricePaise: 3000,
          stepQuantity: 250,
          sortOrder: 1,
        },
        {
          productId: rice!.id,
          sku: "wa-rice-5kg",
          unitType: "weight",
          baseQuantity: 5000,
          labelEn: "5 kg",
          labelMl: "5 കി.ഗ്രാം",
          pricePaise: 32500,
          sortOrder: 0,
        },
      ])
      .returning();
    tomatoVariantId = variants.find((v) => v.sku === "wa-tom-500")!.id;
    tomato5kgVariantId = ""; // not needed; keep 500g + 5kg rice
    riceVariantId = variants.find((v) => v.sku === "wa-rice-5kg")!.id;
    await db.insert(schema.inventory).values([
      { productId: tomato!.id, stockQuantity: 20_000, lowStockThreshold: 2_000 },
      { productId: rice!.id, stockQuantity: 20_000, lowStockThreshold: 2_000 },
    ]);
    await db.insert(schema.deliveryZones).values({
      pincode: "670001",
      areaNameEn: "Kannur Town",
      areaNameMl: "കണ്ണൂർ",
      minOrderPaise: 9900,
      deliveryFeePaise: 2900,
      freeDeliveryThresholdPaise: 49900,
    });
    // Late-evening slot (cutoff 0) so the test runs at any hour.
    await db.insert(schema.deliverySlots).values({
      nameEn: "WA slot 11 PM–12 AM",
      nameMl: "വാ സ്ലോട്ട്",
      startMinutes: 23 * 60,
      endMinutes: 24 * 60,
      cutoffMinutes: 0,
      capacity: 5,
    });
    await db.insert(schema.settings).values({
      key: "shop.profile",
      value: {
        name: "PGRS Peedika",
        whatsapp: SHOP_WA,
        phone: "",
        tagline: "",
        email: "",
        addressLine: "",
        gstin: "",
        openTime: "06:30",
        closeTime: "21:30",
        weeklyClosedDay: "none",
      },
    });
  });

  afterAll(async () => {
    if (!db) return;
    for (const table of [
      schema.outboxEvents,
      schema.couponRedemptions,
      schema.refunds,
      schema.payments,
      schema.orderStatusHistory,
      schema.orderItems,
      schema.orders,
      schema.cartItems,
      schema.carts,
      schema.inventoryMovements,
      schema.inventory,
      schema.productImages,
      schema.productVariants,
      schema.products,
      schema.categories,
      schema.slotBookings,
      schema.deliverySlots,
      schema.deliveryZones,
      schema.addresses,
      schema.user,
      schema.settings,
    ]) {
      await db.delete(table);
    }
  });

  it("parses free-text WhatsApp orders (EN, ML keyword, qty forms)", async () => {
    const parsed = await parseWhatsAppOrderText(
      db!,
      `2 kg tomato
thakkali 500 g
1 matta rice 5 kg
Name: Ravi
Address: Mullakam house, Market road
Pincode: 670001`,
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.pincode).toBe("670001");
    expect(parsed!.name).toBe("Ravi");
    expect(parsed!.address).toBe("Mullakam house, Market road");
    // tomato (2kg → four 500g packs) + thakkali (500g → one 500g pack) merge to 5 × 500 g
    const tomatoLine = parsed!.items.find((i) => i.variantId === tomatoVariantId)!;
    expect(tomatoLine.quantity).toBe(5);
    // "matta rice 5 kg" picks the 5 kg variant
    const riceLine = parsed!.items.find((i) => i.variantId === riceVariantId)!;
    expect(riceLine.quantity).toBe(1);
    void tomato5kgVariantId;
  });

  it("returns null without a pincode or with no matching items", async () => {
    const noPin = await parseWhatsAppOrderText(db!, "2 kg tomato\nName: A");
    expect(noPin).toBeNull();
    const noItems = await parseWhatsAppOrderText(db!, "pizza 2\nPincode: 670001");
    expect(noItems).toBeNull();
  });

  it("places a guest WhatsApp order: real order + saved details + wa.me link", async () => {
    const before = await db!.select().from(schema.user);
    const result = await placeWhatsAppOrder(ctx(), {
      items: [
        { variantId: tomatoVariantId, quantity: 4 },
        { variantId: riceVariantId, quantity: 1 },
      ],
      customer: {
        name: "Guest Customer",
        phone: "+919812345678",
        line1: "WA House, Test Lane",
        landmark: "Near temple",
        pincode: "670001",
        city: "Kannur",
      },
      note: "ring the bell",
    });

    // 4 × ₹30 + ₹325 = ₹445 → free-delivery threshold not met → +₹29 = ₹474
    expect(result.subtotalPaise).toBe(44_500);
    expect(result.grandTotalPaise).toBe(47_400);
    expect(result.isNewCustomer).toBe(before.length === 0 || true);
    expect(result.shopWhatsApp).toBe(SHOP_WA);
    expect(result.whatsappLink).toContain(`wa.me/${SHOP_WA.replace(/\D/g, "")}?text=`);
    expect(decodeURIComponent(result.whatsappLink)).toContain(result.orderNumber);

    const [order] = await db!.select().from(schema.orders).where(eq(schema.orders.id, result.orderId));
    expect(order?.source).toBe("whatsapp");
    expect(order?.status).toBe("confirmed");
    expect(order?.paymentMethod).toBe("cod");
    expect(order?.slotDate).toBe(istTodayDateString());

    // Customer auto-created by phone with the address saved for next time.
    const [customer] = await db!
      .select()
      .from(schema.user)
      .where(eq(schema.user.phoneNumber, "+919812345678"));
    expect(customer).toBeDefined();
    expect(customer!.name).toBe("Guest Customer");
    const savedAddresses = await db!
      .select()
      .from(schema.addresses)
      .where(eq(schema.addresses.userId, customer!.id));
    expect(savedAddresses).toHaveLength(1);
    expect(savedAddresses[0]?.isDefault).toBe(true);
    expect(savedAddresses[0]?.pincode).toBe("670001");

    // Stock reserved.
    const [tomatoProduct] = await db!
      .select()
      .from(schema.products)
      .where(eq(schema.products.slug, "wa-tomato"));
    const [inv] = await db!
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.productId, tomatoProduct!.id));
    expect(inv?.reservedQuantity).toBe(2_000); // 4 × 500 g

    // Outbox carries order.placed.
    const events = await db!.select().from(schema.outboxEvents);
    expect(events.map((e) => e.eventName)).toContain("order.placed");

    // Repeat order from the same phone reuses the customer (no second user).
    await placeWhatsAppOrder(ctx(), {
      items: [{ variantId: riceVariantId, quantity: 1 }],
      customer: {
        name: "Guest Customer",
        phone: "+919812345678",
        line1: "Another line",
        landmark: null,
        pincode: "670001",
        city: "Kannur",
      },
    });
    const usersAfter = await db!.select().from(schema.user);
    expect(usersAfter.filter((u) => u.phoneNumber === "+919812345678")).toHaveLength(1);
  });

  it("rejects unserved pincodes and below-minimum baskets", async () => {
    await expect(
      placeWhatsAppOrder(ctx(), {
        items: [{ variantId: riceVariantId, quantity: 1 }],
        customer: {
          name: "Far",
          phone: "+919899999999",
          line1: "Far house",
          landmark: null,
          pincode: "110001",
          city: "Delhi",
        },
      }),
    ).rejects.toThrowError(/do not deliver/i);
    await expect(
      placeWhatsAppOrder(ctx(), {
        items: [{ variantId: tomatoVariantId, quantity: 1 }],
        customer: {
          name: "Small",
          phone: "+919899999998",
          line1: "Small house",
          landmark: null,
          pincode: "670001",
          city: "Kannur",
        },
      }),
    ).rejects.toThrowError(/minimum/i);
  });

  it("findOrCreateCustomerByPhone is idempotent per phone", async () => {
    const first = await findOrCreateCustomerByPhone(db!, { name: "Dup", phone: "+919899999997" });
    const second = await findOrCreateCustomerByPhone(db!, { name: "Dup", phone: "+919899999997" });
    expect(first.userId).toBe(second.userId);
    expect(second.isNew).toBe(false);
  });

  it("builds a readable order message and wa.me link", () => {
    const message = buildWhatsAppOrderMessage({
      orderNumber: "PGRS-261001-0099",
      customer: { name: "Ravi", phone: "+919812345678" },
      address: {
        contactName: "Ravi",
        contactPhone: "+919812345678",
        line1: "House 1",
        line2: null,
        landmark: "Temple",
        pincode: "670001",
        areaName: "Kannur Town",
        city: "Kannur",
      },
      slotLabel: "Evening 5 PM – 7 PM",
      slotDate: "2026-10-02",
      items: [
        {
          nameEn: "Tomato",
          nameMl: "തക്കാളി",
          quantity: 2,
          unitLabelEn: "500 g",
          orderedQtyGrams: 1000,
          lineTotalPaise: 6000,
        },
      ],
      subtotalPaise: 6000,
      deliveryFeePaise: 2900,
      totalPaise: 8900,
      note: "call first",
    });
    expect(message).toContain("PGRS-261001-0099");
    expect(message).toContain("Tomato (തക്കാളി)");
    expect(message).toContain("1 kg");
    expect(message).toContain("₹89");
    const link = waMeLink(SHOP_WA, message);
    expect(link.startsWith("https://wa.me/919999888877?text=")).toBe(true);
  });
});
