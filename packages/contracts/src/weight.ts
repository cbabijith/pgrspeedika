/** Weight helpers for loose produce sold in gram steps. */

export const GRAMS_PER_KG = 1000;

/** 250 → "250 g", 1000 → "1 kg", 1500 → "1.5 kg". */
export function formatGrams(grams: number, locale: "en" | "ml" = "en"): string {
  if (grams < GRAMS_PER_KG) {
    if (locale === "ml") {
      return grams + " ഗ്രാം";
    }
    return grams + " g";
  }
  const kg = grams / GRAMS_PER_KG;
  const nice = formatKg(kg);
  if (locale === "ml") {
    return nice + " കി.ഗ്രാം";
  }
  return nice + " kg";
}

function formatKg(kg: number): string {
  if (Number.isInteger(kg)) {
    return kg.toString();
  }
  return kg.toFixed(1);
}

/** Parse "1.5", "750g", "1 kg" into grams; returns null when invalid. */
export function parseGrams(input: string): number | null {
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, "");
  const kgMatch = cleaned.match(/^(\d+(?:\.\d+)?)kg$/);
  if (kgMatch) {
    return Math.round(Number(kgMatch[1]) * GRAMS_PER_KG);
  }
  const gMatch = cleaned.match(/^(\d+(?:\.\d+)?)g$/);
  if (gMatch) {
    return Math.round(Number(gMatch[1]));
  }
  if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
    // Bare numbers are kilograms (the way shops quote vegetable prices).
    return Math.round(Number(cleaned) * GRAMS_PER_KG);
  }
  return null;
}

/** Largest step ≤ requested grams that is a multiple of stepGrams. */
export function snapToStep(grams: number, stepGrams: number): number {
  if (stepGrams <= 0) return grams;
  return Math.max(0, Math.floor(grams / stepGrams) * stepGrams);
}

/** Price for a weight quantity given a per-kg paise price (rounded half-up). */
export function priceForGrams(perKgPaise: number, grams: number): number {
  return Math.round((perKgPaise * grams) / GRAMS_PER_KG);
}
