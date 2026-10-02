import { categoryPhotoSlugs } from "./catalog-photos";
import { schema, type Database } from "./index";
import {
  seedCategories,
  seedCoupons,
  seedLooseProducts,
  seedPackedProducts,
  seedSlots,
  seedZones,
} from "../scripts/seed-data";

function produceImageUrl(slug: string, _emoji: string, _nameEn: string): string {
  return new URL(`/catalog/photos/${slug}.webp`, process.env.WEB_URL ?? "http://localhost:3000").toString();
}

function categoryImageUrl(slug: string, _emoji: string, _nameEn: string): string {
  return new URL(
    `/catalog/photos/${categoryPhotoSlugs[slug] ?? "tomato"}.webp`,
    process.env.WEB_URL ?? "http://localhost:3000",
  ).toString();
}

function bannerImageUrl(n: number, titleEn: string): string {
  const params = new URLSearchParams({ n: titleEn });
  return `/media/banner/${n}.svg?${params.toString()}`;
}

function variantLabel(grams: number): { labelEn: string; labelMl: string } {
  if (grams < 1000) return { labelEn: `${grams} g`, labelMl: `${grams} ഗ്രാം` };
  const kg = grams / 1000;
  const nice = Number.isInteger(kg) ? kg.toString() : kg.toFixed(1);
  return { labelEn: `${nice} kg`, labelMl: `${nice} കി.ഗ്രാം` };
}

/** Delete all rows, children before parents (FK-safe order). */
async function clearAll(db: Database) {
  const tables = [
    schema.couponRedemptions,
    schema.coupons,
    schema.refunds,
    schema.payments,
    schema.orderStatusHistory,
    schema.orderItems,
    schema.orders,
    schema.cartItems,
    schema.carts,
    schema.wishlists,
    schema.reviews,
    schema.notifications,
    schema.banners,
    schema.outboxEvents,
    schema.auditLogs,
    schema.settings,
    schema.slotBookings,
    schema.deliverySlots,
    schema.deliveryZones,
    schema.inventoryMovements,
    schema.inventory,
    schema.productImages,
    schema.productVariants,
    schema.products,
    schema.categories,
    schema.verification,
    schema.account,
    schema.session,
    schema.user,
  ];
  for (const table of tables) {
    await db.delete(table);
  }
}

/**
 * Importable catalog seed: clears business tables and loads categories,
 * products (86 Kerala items), zones, slots, coupons, banners and shop
 * settings. The owner account is created by apps/backend's seedAll (it needs
 * Better Auth for the correct account-row shape).
 */
export async function seedCatalog(db: Database): Promise<void> {
  console.log("Clearing existing data …");
  await clearAll(db);

  // ── Catalog ────────────────────────────────────────────────────────────────
  console.log("Seeding categories …");
  const categoryIds = new Map<string, string>();
  for (const cat of seedCategories) {
    const [row] = await db
      .insert(schema.categories)
      .values({
        slug: cat.slug,
        nameEn: cat.nameEn,
        nameMl: cat.nameMl,
        description: cat.description,
        imageUrl: categoryImageUrl(cat.slug, cat.emoji, cat.nameEn),
        sortOrder: cat.sortOrder,
      })
      .returning({ id: schema.categories.id });
    if (row) categoryIds.set(cat.slug, row.id);
  }

  console.log("Seeding products (loose produce) …");
  for (const p of seedLooseProducts) {
    const categoryId = categoryIds.get(p.cat);
    if (!categoryId) throw new Error(`Unknown category ${p.cat} for product ${p.slug}`);
    const [product] = await db
      .insert(schema.products)
      .values({
        slug: p.slug,
        categoryId,
        nameEn: p.nameEn,
        nameMl: p.nameMl,
        description:
          p.description ??
          `Farm-fresh ${p.nameEn.toLowerCase()} bought from local vendors every morning and quality-checked at our shop.`,
        hsnCode: p.hsn,
        gstRate: 0,
        sellingType: "loose",
        isFreshToday: p.freshToday ?? false,
        searchKeywords: p.keywords ?? "",
      })
      .returning({ id: schema.products.id });
    if (!product) throw new Error(`Failed to insert product ${p.slug}`);

    const steps = p.steps ?? [250, 500, 1000, 2000];
    const step = p.step ?? 250;
    await db.insert(schema.productVariants).values(
      steps.map((grams, i) => {
        const label = variantLabel(grams);
        return {
          productId: product.id,
          sku: `${p.slug}-${grams}g`,
          unitType: "weight" as const,
          baseQuantity: grams,
          labelEn: label.labelEn,
          labelMl: label.labelMl,
          pricePaise: Math.round((p.perKgPaise * grams) / 1000),
          stepQuantity: step,
          sortOrder: i,
        };
      }),
    );
    await db.insert(schema.productImages).values({
      productId: product.id,
      url: produceImageUrl(p.slug, p.emoji, p.nameEn),
      alt: `${p.nameEn} (${p.nameMl})`,
      sortOrder: 0,
    });
    await db.insert(schema.inventory).values({
      productId: product.id,
      stockQuantity: p.stockGrams ?? 25000,
      lowStockThreshold: p.lowStockGrams ?? 5000,
    });
  }

  console.log("Seeding products (packaged goods) …");
  for (const p of seedPackedProducts) {
    const categoryId = categoryIds.get(p.cat);
    if (!categoryId) throw new Error(`Unknown category ${p.cat} for product ${p.slug}`);
    const [product] = await db
      .insert(schema.products)
      .values({
        slug: p.slug,
        categoryId,
        nameEn: p.nameEn,
        nameMl: p.nameMl,
        description:
          p.description ?? `${p.nameEn}${p.brand ? ` by ${p.brand}` : ""}, always in date at PGRS Peedika.`,
        brand: p.brand ?? null,
        hsnCode: p.hsn,
        gstRate: p.gstRate,
        sellingType: "packaged",
        searchKeywords: p.keywords ?? "",
      })
      .returning({ id: schema.products.id });
    if (!product) throw new Error(`Failed to insert product ${p.slug}`);

    await db.insert(schema.productVariants).values(
      p.variants.map((v, i) => ({
        productId: product.id,
        sku: `${p.slug}-${v.labelEn.toLowerCase().replace(/[\s()]/g, "-")}`,
        unitType: v.unitType,
        baseQuantity: v.quantity,
        labelEn: v.labelEn,
        labelMl: v.labelMl,
        pricePaise: v.pricePaise,
        mrpPaise: v.mrpPaise ?? null,
        stepQuantity: v.unitType === "unit" ? 1 : 250,
        sortOrder: i,
      })),
    );
    await db.insert(schema.productImages).values({
      productId: product.id,
      url: produceImageUrl(p.slug, p.emoji, p.nameEn),
      alt: `${p.nameEn} (${p.nameMl})`,
      sortOrder: 0,
    });
    await db.insert(schema.inventory).values({
      productId: product.id,
      stockQuantity: p.stockUnits ?? 40,
      lowStockThreshold: p.lowStockUnits ?? 10,
    });
  }

  // ── Delivery ───────────────────────────────────────────────────────────────
  console.log("Seeding delivery zones and slots …");
  for (const z of seedZones) {
    await db.insert(schema.deliveryZones).values(z);
  }
  for (const s of seedSlots) {
    await db.insert(schema.deliverySlots).values(s);
  }

  // ── Coupons ────────────────────────────────────────────────────────────────
  console.log("Seeding coupons …");
  const now = new Date();
  for (const c of seedCoupons) {
    await db.insert(schema.coupons).values({
      code: c.code,
      couponType: c.couponType,
      value: c.value,
      minOrderPaise: c.minOrderPaise,
      maxDiscountPaise: c.maxDiscountPaise,
      perUserLimit: c.perUserLimit,
      firstOrderOnly: c.firstOrderOnly,
      validFrom: now,
      validUntil: new Date(now.getTime() + c.validDays * 24 * 3600 * 1000),
    });
  }

  // ── Banners ────────────────────────────────────────────────────────────────
  console.log("Seeding banners …");
  await db.insert(schema.banners).values([
    {
      titleEn: "Fresh vegetables, delivered by 9 AM",
      titleMl: "പച്ചക്കറികൾ രാവിലെ 9 മണിക്ക് വീട്ടിൽ",
      subtitleEn: "Order tonight, wake up to farm-fresh produce.",
      subtitleMl: "ഇന്ന് രാത്രി ഓർഡർ ചെയ്യൂ, രാവിലെ പുതുമയുള്ള പച്ചക്കറികൾ.",
      imageUrl: bannerImageUrl(1, "Fresh Daily"),
      linkUrl: "/category/vegetables",
      badge: "Free delivery over ₹499",
      sortOrder: 1,
    },
    {
      titleEn: "Kerala's own Matta rice & puttu podi",
      titleMl: "കേരളത്തിന്റെ മട്ട അരിയും പുട്ടുപ്പൊടിയും",
      subtitleEn: "Rice, grains and dals at wholesale prices.",
      subtitleMl: "അരി, ധാന്യങ്ങൾ, പരിപ്പ് വിലക്കെടുക്കാം.",
      imageUrl: bannerImageUrl(2, "Rice & Grains"),
      linkUrl: "/category/rice-and-grains",
      sortOrder: 2,
    },
    {
      titleEn: "First order? Use WELCOME10 for 10% off",
      titleMl: "ആദ്യ ഓർഡറിന് WELCOME10 ഉപയോഗിച്ച് 10% ആനുകൂല്യം",
      subtitleEn: "Up to ₹50 off on your first order above ₹199.",
      subtitleMl: "₹199-ൽ മുകളിൽ ഓർഡറിൽ ₹50 വരെ കുറവ്.",
      imageUrl: bannerImageUrl(3, "Welcome Offer"),
      linkUrl: "/offers",
      badge: "New customers",
      sortOrder: 3,
    },
  ]);

  // ── Settings ───────────────────────────────────────────────────────────────
  console.log("Seeding shop settings …");
  await db.insert(schema.settings).values([
    {
      key: "shop.profile",
      value: {
        name: "PGRS Peedika",
        tagline: "Fresh from our village to your kitchen",
        phone: "+919447114449",
        whatsapp: "+919447114449",
        email: "hello@pgrspeedika.example",
        addressLine: "PGRS Peedika, Kottayam district, Kerala",
        gstin: "",
        openTime: "06:30",
        closeTime: "21:30",
        weeklyClosedDay: "none",
      },
    },
    {
      key: "notification.templates",
      value: {
        orderPlaced: "Order {{orderNumber}} received. We will pack your items fresh. Total ₹{{total}}.",
        orderConfirmed: "Order {{orderNumber}} confirmed for {{slot}}. See you soon!",
        outForDelivery: "Order {{orderNumber}} is out for delivery. Please keep ₹{{total}} ready (if COD).",
        delivered: "Order {{orderNumber}} delivered. Thank you for shopping at PGRS Peedika!",
      },
    },
  ]);

  console.log("");
  console.log("Catalog seed complete (owner account is created by apps/backend).");
}
