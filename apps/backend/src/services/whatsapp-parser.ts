import { and, eq, sql } from "drizzle-orm";
import { productVariants, products } from "@pgrs/db";
import type { Database } from "@pgrs/db";

export interface ParsedWhatsAppOrder {
  items: Array<{ variantId: string; quantity: number; matchedName: string }>;
  name: string | null;
  address: string | null;
  pincode: string;
}

interface CatalogEntry {
  productId: string;
  variantId: string;
  nameEn: string;
  nameMl: string;
  slug: string;
  keywords: string;
  labelEn: string;
  baseQuantity: number;
  unitType: "weight" | "unit";
}

/** Load the active catalog once per parse (small: ~90 products). */
async function loadCatalog(db: Database): Promise<CatalogEntry[]> {
  const rows = await db
    .select({
      productId: products.id,
      nameEn: products.nameEn,
      nameMl: products.nameMl,
      slug: products.slug,
      keywords: products.searchKeywords,
      variantId: productVariants.id,
      labelEn: productVariants.labelEn,
      baseQuantity: productVariants.baseQuantity,
      unitType: productVariants.unitType,
    })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .where(and(eq(products.isActive, true), eq(productVariants.isActive, true)))
    .orderBy(sql`${productVariants.baseQuantity} asc`);
  return rows;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Find the best catalog match for one item phrase (EN, ML or slug). */
function matchOne(phrase: string, catalog: CatalogEntry[]): CatalogEntry | null {
  const needle = normalizeText(phrase);
  if (!needle) return null;
  let best: { entry: CatalogEntry; score: number } | null = null;
  for (const entry of catalog) {
    const candidates = [entry.nameEn, entry.nameMl, entry.slug, entry.keywords]
      .filter(Boolean)
      .map(normalizeText);
    for (const candidate of candidates) {
      if (!candidate) continue;
      let score = 0;
      if (candidate === needle) score = 100;
      else if (candidate.split(", ").some((alias) => alias === needle)) score = 95;
      else if (needle.includes(candidate) && candidate.length >= 4) score = 70 + candidate.length;
      else if (candidate.includes(needle) && needle.length >= 4) score = 60 + needle.length;
      if (score > 0 && (!best || score > best.score)) best = { entry, score };
    }
  }
  return best ? best.entry : null;
}

/** Parse a "2 kg tomato" phrase into quantity + product text. */
function parseQuantityPhrase(phrase: string): { quantity: number; productText: string; grams?: number } {
  const text = phrase.trim();
  // "2kg tomato", "2 kg tomato", "tomato 2kg", "1 packet milk"
  const qtyFirst = text.match(
    /^(\d+(?:\.\d+)?)\s*(kg|kilo|g|gm|gram|grams|packet|pack|piece|pcs|no)?\s+(.+)$/i,
  );
  const qtyLast = text.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s*(kg|kilo|g|gm|gram|grams|packet|pack|piece|pcs|no)?$/i,
  );
  if (qtyFirst) {
    const amount = Number(qtyFirst[1]);
    const unit = (qtyFirst[2] ?? "").toLowerCase();
    return {
      quantity: amount,
      productText: qtyFirst[3] ?? "",
      grams: unit.startsWith("k") ? amount * 1000 : unit.startsWith("g") || unit === "" ? amount : undefined,
    };
  }
  if (qtyLast) {
    const amount = Number(qtyLast[2]);
    const unit = (qtyLast[3] ?? "").toLowerCase();
    return {
      quantity: amount,
      productText: qtyLast[1] ?? "",
      grams: unit.startsWith("k") ? amount * 1000 : unit.startsWith("g") || unit === "" ? amount : undefined,
    };
  }
  return { quantity: 1, productText: text };
}

/** Pick the variant closest to the requested grams (weight items). */
function pickVariant(requestedGrams: number | undefined, matches: CatalogEntry[]): CatalogEntry {
  if (requestedGrams == null) {
    // Default to the smallest weight size or first entry.
    const weight = matches.find((m) => m.unitType === "weight");
    return weight ?? matches[0]!;
  }
  const weights = matches.filter((m) => m.unitType === "weight");
  const pool = weights.length > 0 ? weights : matches;
  return pool.reduce((best, entry) =>
    Math.abs(entry.baseQuantity - requestedGrams) < Math.abs(best.baseQuantity - requestedGrams)
      ? entry
      : best,
  );
}

/**
 * Parse a free-text WhatsApp order. Recognized shape (English or Malayalam
 * product names, flexible order):
 *
 *   2 kg tomato
 *   matta rice 5 kg
 *   Name: Ravi
 *   Address: Mullakam house, Market road
 *   Pincode: 670001
 *
 * Returns null when no catalog item matches or the pincode is missing —
 * callers reply with the how-to-order template instead.
 */
export async function parseWhatsAppOrderText(
  db: Database,
  message: string,
): Promise<ParsedWhatsAppOrder | null> {
  const catalog = await loadCatalog(db);
  const lines = message.split(/\r?\n/);

  let name: string | null = null;
  let address: string | null = null;
  let pincode: string | null = null;
  const itemLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const labelMatch = trimmed.match(/^(name|പേര്)\s*[:-]\s*(.+)$/i);
    const addressMatch = trimmed.match(/^(address|home|house|വിലാസം)\s*[:-]\s*(.+)$/i);
    const pinMatch = trimmed.match(/^(pincode|pin|പിൻകോഡ്)\s*[:-]?\s*(\d{6})$/i);
    const barePin = trimmed.match(/^[1-9]\d{5}$/);
    if (labelMatch) {
      name = labelMatch[2]!.trim();
    } else if (addressMatch) {
      address = addressMatch[2]!.trim();
    } else if (pinMatch) {
      pincode = pinMatch[2]!;
    } else if (barePin) {
      pincode = trimmed;
    } else {
      itemLines.push(trimmed);
    }
  }

  if (itemLines.length === 0 || !pincode) return null;

  const byProduct = new Map<string, CatalogEntry[]>();
  for (const entry of catalog) {
    const list = byProduct.get(entry.productId) ?? [];
    list.push(entry);
    byProduct.set(entry.productId, list);
  }
  const flatCatalog = [...byProduct.values()].flat();
  void flatCatalog;

  const items: ParsedWhatsAppOrder["items"] = [];
  for (const itemLine of itemLines) {
    // Strip an explicit size suffix like "5 kg" from the product text too.
    const { quantity, productText, grams } = parseQuantityPhrase(itemLine);
    const cleanedProduct = productText
      .replace(/\d+(?:\.\d+)?\s*(kg|kilo|g|gm|gram|grams|packet|pack|piece|pcs|no)\b/gi, "")
      .trim();
    const match = matchOne(cleanedProduct || productText, catalog);
    if (!match) continue;
    const variants = byProduct.get(match.productId) ?? [match];
    const variant = pickVariant(grams, variants);
    // Convert a requested weight ("2 kg") into packs of the chosen size.
    const packs =
      variant.unitType === "weight" && grams != null && grams > 0
        ? Math.max(1, Math.round(grams / variant.baseQuantity))
        : Math.max(1, Math.round(quantity));
    if (items.some((i) => i.variantId === variant.variantId)) {
      const existing = items.find((i) => i.variantId === variant.variantId)!;
      existing.quantity += packs;
    } else {
      items.push({ variantId: variant.variantId, quantity: packs, matchedName: match.nameEn });
    }
  }

  if (items.length === 0) return null;
  return { items, name, address, pincode };
}
