import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@pgrs/db";
import {
  banners,
  categories,
  deliveryZones,
  inventory,
  productImages,
  productVariants,
  products,
  reviews,
} from "@pgrs/db";
import type {
  Category,
  ListProductsQuery,
  Paginated,
  ProductCard,
  ProductDetail,
  ZoneDTO,
} from "@pgrs/contracts";
import { paginated } from "@pgrs/contracts";

const imageUrlSub = sql<string | null>`(
  select pi.url from product_images pi
  where pi.product_id = ${products.id}
  order by pi.sort_order asc limit 1
)`;

const ratingAvgSub = sql<number>`coalesce((
  select round(avg(r.rating)::numeric, 1) from reviews r
  where r.product_id = ${products.id} and r.status = 'approved'
), 0)::float8`;

const ratingCountSub = sql<number>`(
  select count(*)::int from reviews r
  where r.product_id = ${products.id} and r.status = 'approved'
)`;

const soldCountSub = sql<number>`(
  select coalesce(sum(oi.quantity), 0)::int from order_items oi
  join orders o on o.id = oi.order_id
  where oi.product_id = ${products.id} and o.status in ('packed', 'out_for_delivery', 'delivered')
)`;

export async function listCategories(db: Database, includeInactive = false): Promise<Category[]> {
  const rows = await db
    .select({
      category: categories,
      productCount: sql<number>`(
        select count(*)::int from products p
        where p.category_id = ${categories.id} and p.is_active = true
      )`,
    })
    .from(categories)
    .where(includeInactive ? undefined : eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder));

  return rows.map(({ category, productCount }) => ({
    id: category.id,
    slug: category.slug,
    nameEn: category.nameEn,
    nameMl: category.nameMl,
    description: category.description,
    imageUrl: category.imageUrl,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    productCount,
  }));
}

interface ProductRow {
  product: typeof products.$inferSelect;
  categorySlug: string;
  imageUrl: string | null;
  availableQuantity: number | null;
  reserved: number | null;
  trackStock: boolean;
  lowStockThreshold: number;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
}

async function fetchProductRows(
  db: Database,
  where: SQL | undefined,
  orderBy: SQL[],
  limit: number,
  offset: number,
): Promise<ProductRow[]> {
  return db
    .select({
      product: products,
      categorySlug: categories.slug,
      imageUrl: imageUrlSub,
      availableQuantity: inventory.stockQuantity,
      reserved: inventory.reservedQuantity,
      trackStock: sql<boolean>`coalesce(${inventory.trackStock}, true)`,
      lowStockThreshold: sql<number>`coalesce(${inventory.lowStockThreshold}, 0)`,
      ratingAvg: ratingAvgSub,
      ratingCount: ratingCountSub,
      soldCount: soldCountSub,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(inventory, eq(inventory.productId, products.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);
}

function toCard(row: ProductRow, variants: (typeof productVariants.$inferSelect)[]): ProductCard {
  const available = row.trackStock ? Math.max(0, (row.availableQuantity ?? 0) - (row.reserved ?? 0)) : null;
  return {
    id: row.product.id,
    slug: row.product.slug,
    nameEn: row.product.nameEn,
    nameMl: row.product.nameMl,
    sellingType: row.product.sellingType,
    isFreshToday: row.product.isFreshToday,
    gstRate: row.product.gstRate,
    categoryId: row.product.categoryId,
    categorySlug: row.categorySlug,
    imageUrl: row.imageUrl,
    variants: variants
      .filter((v) => v.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        unitType: v.unitType,
        baseQuantity: v.baseQuantity,
        labelEn: v.labelEn,
        labelMl: v.labelMl,
        pricePaise: v.pricePaise,
        mrpPaise: v.mrpPaise,
        stepQuantity: v.stepQuantity,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
      })),
    availableQuantity: available,
    lowStock: available != null && row.lowStockThreshold > 0 && available <= row.lowStockThreshold,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    soldCount: row.soldCount,
  };
}

async function variantsFor(db: Database, productIds: string[]) {
  if (productIds.length === 0) return new Map<string, (typeof productVariants.$inferSelect)[]>();
  const rows = await db.select().from(productVariants).where(inArray(productVariants.productId, productIds));
  const map = new Map<string, (typeof productVariants.$inferSelect)[]>();
  for (const v of rows) {
    const list = map.get(v.productId) ?? [];
    list.push(v);
    map.set(v.productId, list);
  }
  return map;
}

const cheapestPriceSub = sql<number>`(
  select min(pv.price_paise)::int from product_variants pv
  where pv.product_id = ${products.id} and pv.is_active = true
)`;

export async function listProducts(db: Database, query: ListProductsQuery): Promise<Paginated<ProductCard>> {
  const conditions: SQL[] = [eq(products.isActive, true)];
  if (query.categorySlug) conditions.push(eq(categories.slug, query.categorySlug));
  if (query.freshToday) conditions.push(eq(products.isFreshToday, true));
  if (query.q) {
    const like = `%${query.q.toLowerCase()}%`;
    const cond = or(
      sql`lower(${products.nameEn}) like ${like}`,
      sql`${products.nameMl} like ${`%${query.q}%`}`,
      sql`lower(${products.slug}) like ${like}`,
      sql`lower(${products.searchKeywords}) like ${like}`,
    );
    if (cond) conditions.push(cond);
  }
  if (query.inStock) {
    conditions.push(
      sql`(coalesce(${inventory.trackStock}, true) = false or (${inventory.stockQuantity} - ${inventory.reservedQuantity}) > 0)`,
    );
  }

  const orderBy: SQL[] =
    query.sort === "price_asc"
      ? [asc(cheapestPriceSub)]
      : query.sort === "price_desc"
        ? [desc(cheapestPriceSub)]
        : query.sort === "name_asc"
          ? [asc(products.nameEn)]
          : query.sort === "name_desc"
            ? [desc(products.nameEn)]
            : [desc(soldCountSub), asc(products.nameEn)];

  const where = and(...conditions);
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(inventory, eq(inventory.productId, products.id))
    .where(where);
  const rows = await fetchProductRows(db, where, orderBy, query.pageSize, (query.page - 1) * query.pageSize);
  const variantMap = await variantsFor(
    db,
    rows.map((r) => r.product.id),
  );

  const items = rows.map((r) => toCard(r, variantMap.get(r.product.id) ?? []));
  const cards = query.inStock
    ? items.filter((c) => c.availableQuantity == null || c.availableQuantity > 0)
    : items;
  return paginated(cards, countRow?.count ?? rows.length, query.page, query.pageSize);
}

export async function getProductDetail(db: Database, slug: string): Promise<ProductDetail | null> {
  const rows = await fetchProductRows(db, eq(products.slug, slug), [asc(products.nameEn)], 1, 0);
  const row = rows[0];
  if (!row) return null;
  const variantMap = await variantsFor(db, [row.product.id]);
  const images = await db
    .select({ url: productImages.url, alt: productImages.alt })
    .from(productImages)
    .where(eq(productImages.productId, row.product.id))
    .orderBy(asc(productImages.sortOrder));
  const card = toCard(row, variantMap.get(row.product.id) ?? []);
  return {
    ...card,
    description: row.product.description,
    brand: row.product.brand,
    hsnCode: row.product.hsnCode,
    images: images.length > 0 ? images : [{ url: card.imageUrl ?? "", alt: row.product.nameEn }],
  };
}

export async function relatedProducts(
  db: Database,
  categoryId: string,
  excludeId: string,
): Promise<ProductCard[]> {
  const rows = await fetchProductRows(
    db,
    and(
      eq(products.categoryId, categoryId),
      eq(products.isActive, true),
      sql`${products.id} <> ${excludeId}`,
    ),
    [desc(soldCountSub)],
    8,
    0,
  );
  const variantMap = await variantsFor(
    db,
    rows.map((r) => r.product.id),
  );
  return rows.map((r) => toCard(r, variantMap.get(r.product.id) ?? []));
}

export async function searchSuggest(db: Database, q: string) {
  const like = `%${q.toLowerCase()}%`;
  const rows = await db
    .select({
      slug: products.slug,
      nameEn: products.nameEn,
      nameMl: products.nameMl,
      imageUrl: imageUrlSub,
      pricePaise: sql<number>`coalesce(${cheapestPriceSub}, 0)`,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.isActive, true),
        or(
          sql`lower(${products.nameEn}) like ${like}`,
          sql`${products.nameMl} like ${`%${q}%`}`,
          sql`lower(${products.searchKeywords}) like ${like}`,
        ),
      ),
    )
    .limit(8);
  return { suggestions: rows };
}

export async function homeFeed(db: Database) {
  const activeBanners = await db
    .select()
    .from(banners)
    .where(eq(banners.isActive, true))
    .orderBy(asc(banners.sortOrder));

  const [freshRows, bestRows, seasonalRows] = await Promise.all([
    fetchProductRows(
      db,
      and(eq(products.isActive, true), eq(products.isFreshToday, true)),
      [asc(products.nameEn)],
      10,
      0,
    ),
    fetchProductRows(db, eq(products.isActive, true), [desc(soldCountSub), asc(products.nameEn)], 10, 0),
    fetchProductRows(
      db,
      and(eq(products.isActive, true), inArray(categories.slug, ["fruits", "vegetables"])),
      [desc(products.isFreshToday), desc(soldCountSub)],
      10,
      0,
    ),
  ]);
  const ids = [...freshRows, ...bestRows, ...seasonalRows].map((r) => r.product.id);
  const variantMap = await variantsFor(db, ids);

  return {
    banners: activeBanners.map((b) => ({
      id: b.id,
      titleEn: b.titleEn,
      titleMl: b.titleMl,
      subtitleEn: b.subtitleEn,
      subtitleMl: b.subtitleMl,
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl,
      badge: b.badge,
    })),
    freshToday: freshRows.map((r) => toCard(r, variantMap.get(r.product.id) ?? [])),
    bestSellers: bestRows.map((r) => toCard(r, variantMap.get(r.product.id) ?? [])),
    seasonal: seasonalRows.map((r) => toCard(r, variantMap.get(r.product.id) ?? [])),
  };
}

export async function activeZones(db: Database): Promise<ZoneDTO[]> {
  const rows = await db.select().from(deliveryZones).where(eq(deliveryZones.isActive, true));
  return rows.map((z) => ({
    id: z.id,
    pincode: z.pincode,
    areaNameEn: z.areaNameEn,
    areaNameMl: z.areaNameMl,
    minOrderPaise: z.minOrderPaise,
    deliveryFeePaise: z.deliveryFeePaise,
    freeDeliveryThresholdPaise: z.freeDeliveryThresholdPaise,
    isActive: z.isActive,
  }));
}

export async function productRatingSummary(db: Database, productId: string) {
  const [row] = await db
    .select({
      avg: sql<number>`coalesce(round(avg(${reviews.rating})::numeric, 1), 0)::float8`,
      count: sql<number>`count(*)::int`,
    })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, "approved")));
  return { avg: row?.avg ?? 0, count: row?.count ?? 0 };
}
