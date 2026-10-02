import { and, eq, isNull, or, sql } from "drizzle-orm";
import { categories, products, productImages, settings, banners } from "./schema";
import type { Database } from "./index";
import { catalogPhotoSlugs, categoryPhotoSlugs } from "./catalog-photos";

/** Upgrade catalogue presentation in place, preserving orders, IDs, prices, stock and owner uploads. */
export async function applyStorePresentation(db: Database, webUrl: string): Promise<void> {
  const origin = new URL(webUrl).origin;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('store.presentation.v1'))`);
    const [applied] = await tx.select().from(settings).where(eq(settings.key, "store.presentation.v1"));
    if (!applied) {
      await tx
        .insert(categories)
        .values({
          slug: "groceries",
          nameEn: "Groceries",
          nameMl: "പലചരക്ക്",
          description: "Tea, coffee, sugar, salt and everyday essentials",
          sortOrder: 3,
        })
        .onConflictDoNothing({ target: categories.slug });
      const [groceries] = await tx.select().from(categories).where(eq(categories.slug, "groceries"));
      if (groceries)
        await tx
          .update(products)
          .set({ categoryId: groceries.id })
          .where(
            sql`${products.slug} in ('tea-dust', 'coffee-powder', 'sugar', 'salt', 'jaggery') and ${products.categoryId} in (select id from categories where slug = 'snacks-and-bakery')`,
          );
      await tx
        .update(settings)
        .set({
          value: sql`coalesce(${settings.value}, '{}'::jsonb) || '{"phone":"+919447114449","whatsapp":"+919447114449","addressLine":"PGRS Peedika, Kottayam district, Kerala"}'::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(settings.key, "shop.profile"));
      await tx.insert(settings).values({ key: "store.presentation.v1", value: { applied: true } });
    }
    const defaultBanners = [
      {
        number: 1,
        photo: "tomato",
        titleEn: "Fresh vegetables, fruits & groceries",
        titleMl: "പച്ചക്കറികളും പഴങ്ങളും പലചരക്കും",
        subtitleEn: "Choose your items. Order directly on WhatsApp.",
        subtitleMl: "സാധനങ്ങൾ തിരഞ്ഞെടുത്ത് WhatsApp-ൽ ഓർഡർ ചെയ്യാം.",
        linkUrl: "/shop",
        badge: "Kottayam district",
      },
      {
        number: 2,
        photo: "matta-rice",
        titleEn: "Your everyday essentials",
        titleMl: "ദിവസേന വേണ്ട സാധനങ്ങൾ",
        subtitleEn: "Rice, grains and groceries from your local shop.",
        subtitleMl: "അരിയും ധാന്യങ്ങളും പലചരക്കും.",
        linkUrl: "/category/groceries",
        badge: "Groceries",
      },
      {
        number: 3,
        photo: "mango",
        titleEn: "A fresh basket in a few taps",
        titleMl: "സാധനങ്ങൾ എളുപ്പത്തിൽ വാങ്ങാം",
        subtitleEn: "Guest checkout. Delivery agreed with the shop on WhatsApp.",
        subtitleMl: "ഡെലിവറി സമയം WhatsApp-ൽ സ്ഥിരീകരിക്കും.",
        linkUrl: "/shop",
        badge: "No login needed",
      },
    ];
    for (const banner of defaultBanners) {
      const { number, photo, ...copy } = banner;
      await tx
        .update(banners)
        .set({ ...copy, imageUrl: `${origin}/catalog/photos/${photo}.webp` })
        .where(sql`${banners.imageUrl} like ${`/media/banner/${number}.svg%`}`);
    }
    for (const slug of catalogPhotoSlugs) {
      const [product] = await tx
        .select({ id: products.id, nameEn: products.nameEn })
        .from(products)
        .where(eq(products.slug, slug));
      if (!product) continue;
      const url = `${origin}/catalog/photos/${slug}.webp`;
      await tx
        .update(productImages)
        .set({ url, alt: product.nameEn })
        .where(
          and(
            eq(productImages.productId, product.id),
            or(eq(productImages.url, ""), sql`${productImages.url} like '/media/produce/%'`),
          ),
        );
      const existing = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(eq(productImages.productId, product.id))
        .limit(1);
      if (!existing.length)
        await tx
          .insert(productImages)
          .values({ productId: product.id, url, alt: product.nameEn, sortOrder: 0 });
    }
    for (const [slug, photo] of Object.entries(categoryPhotoSlugs)) {
      await tx
        .update(categories)
        .set({ imageUrl: `${origin}/catalog/photos/${photo}.webp` })
        .where(
          and(
            eq(categories.slug, slug),
            or(
              isNull(categories.imageUrl),
              eq(categories.imageUrl, ""),
              sql`${categories.imageUrl} like '/media/category/%'`,
            ),
          ),
        );
    }
  });
}
