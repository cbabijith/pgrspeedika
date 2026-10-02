import { expect, test } from "@playwright/test";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

test("basket bar appears immediately on phone and desktop; photos and grocery categories load", async ({
  page,
}) => {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/shop?sort=name_asc");
    await expect(page.getByRole("button", { name: "Login", exact: true })).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation", { name: "Shop categories" })
        .getByRole("link", { name: "Groceries", exact: true }),
    ).toBeVisible();
    // Earlier flows create popular products without photos; use a known seeded photo.
    const card = page.getByRole("article", { name: "Achappam (Rose Cookies)", exact: true });
    const photo = card.locator("img");
    await photo.scrollIntoViewIfNeeded();
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    if (width === 320) await card.getByRole("button", { name: /^Add .* to cart$/ }).click();
    const basket = page.getByRole("link", { name: "View basket, 1 items", exact: true });
    await expect(basket).toBeVisible();
    const rect = await basket.boundingBox();
    expect(rect!.y).toBeGreaterThan(650);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(844);
    await basket.click();
    await expect(page.getByRole("heading", { name: "Your cart (1)", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue to WhatsApp checkout", exact: true }),
    ).toBeVisible();
  }
});

test("a price-loading failure preserves the basket and supports retry", async ({ page }) => {
  await page.route(`${API}/api/cart/preview*`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, message: "Price service unavailable" }),
    }),
  );
  await page.goto("/shop");
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: /^Add .* to cart$/ })
    .click();
  await page.getByRole("link", { name: "View basket, 1 items", exact: true }).click();
  await expect(
    page.getByText("Your items are saved. We could not load current prices. Please try again.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Your cart is empty", { exact: true })).toHaveCount(0);
  await page.unroute(`${API}/api/cart/preview*`);
  await page.getByRole("button", { name: "Retry loading basket", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your cart (1)", exact: true })).toBeVisible();
});
