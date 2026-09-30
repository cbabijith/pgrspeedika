import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const unitTypeEnum = pgEnum("unit_type", ["weight", "unit"]);
export const sellingTypeEnum = pgEnum("selling_type", ["loose", "packaged"]);
export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", [
  "purchase",
  "adjustment",
  "reserve",
  "release",
  "sale",
  "return",
]);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    nameEn: text("name_en").notNull(),
    nameMl: text("name_ml").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("categories_slug_unique").on(t.slug), index("categories_sort_idx").on(t.sortOrder)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    nameEn: text("name_en").notNull(),
    nameMl: text("name_ml").notNull(),
    description: text("description"),
    brand: text("brand"),
    hsnCode: text("hsn_code").notNull().default(""),
    /** GST percentage as an integer (0, 5, 12, 18, 28) — most fresh produce is 0. */
    gstRate: integer("gst_rate").notNull().default(0),
    sellingType: sellingTypeEnum("selling_type").notNull().default("loose"),
    isFreshToday: boolean("is_fresh_today").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    /** Extra English + Malayalam keywords folded into search. */
    searchKeywords: text("search_keywords").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_slug_unique").on(t.slug),
    index("products_category_idx").on(t.categoryId),
    index("products_active_idx").on(t.isActive),
    index("products_fresh_idx").on(t.isFreshToday),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    /** weight → baseQuantity is grams per pack; unit → number of units per pack (usually 1). */
    unitType: unitTypeEnum("unit_type").notNull(),
    baseQuantity: integer("base_quantity").notNull(),
    labelEn: text("label_en").notNull(),
    labelMl: text("label_ml").notNull(),
    /** Price of one variant pack in integer paise. */
    pricePaise: integer("price_paise").notNull(),
    mrpPaise: integer("mrp_paise"),
    /** Allowed custom-quantity increment (grams for weight items). */
    stepQuantity: integer("step_quantity").notNull().default(250),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_variants_sku_unique").on(t.sku),
    index("product_variants_product_idx").on(t.productId),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: text("alt"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
);

export const inventory = pgTable("inventory", {
  productId: uuid("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  /** Grams on hand for loose goods; units on hand for packaged goods. */
  stockQuantity: integer("stock_quantity").notNull().default(0),
  /** Committed to orders not yet packed/delivered. */
  reservedQuantity: integer("reserved_quantity").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(0),
  trackStock: boolean("track_stock").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    movementType: inventoryMovementTypeEnum("movement_type").notNull(),
    /** Signed delta in grams (loose) or units (packaged). */
    quantityDelta: integer("quantity_delta").notNull(),
    reason: text("reason").notNull().default(""),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    performedBy: text("performed_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inventory_movements_product_idx").on(t.productId, t.createdAt),
    index("inventory_movements_reference_idx").on(t.referenceType, t.referenceId),
  ],
);

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  variants: many(productVariants),
  images: many(productImages),
  inventory: one(inventory, { fields: [products.id], references: [inventory.productId] }),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));
