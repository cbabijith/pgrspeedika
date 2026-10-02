import { interceptWhatsApp, sendGuestRequest, confirmRequest } from "./helpers/whatsapp";
import { expect, test, type Page } from "@playwright/test";
import { otpLogin } from "./helpers/auth";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ADMIN = process.env.ADMIN_URL ?? "http://localhost:3001";
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
async function ownerLogin(page: Page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email", { exact: true }).fill(process.env.SEED_OWNER_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.SEED_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/dashboard/);
}

test("small phone app navigation, shared quantities, stock limit and append-only catalog paging", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/shop");
  const nav = page.getByRole("navigation", { name: "Shopping navigation" });
  await expect(nav.getByRole("link", { name: "Shop", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("article")).toHaveCount(20);
  const first = page.getByRole("article").first();
  const name = await first.getAttribute("aria-label");
  await first.getByRole("button", { name: /^Add .* to cart$/ }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await first.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await expect(first.getByRole("group")).toContainText("2");
  await expect(page.getByRole("link", { name: "View basket, 2 items", exact: true })).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(40);
  await expect(page.getByRole("article", { name: name!, exact: true }).getByRole("group")).toContainText("2");
  await page.reload();
  await expect(page.getByRole("article", { name: name!, exact: true }).getByRole("group")).toContainText("2");
  const card = page.getByRole("article", { name: name!, exact: true });
  await card.getByRole("button", { name: "Decrease quantity", exact: true }).click();
  await card.getByRole("button", { name: "Decrease quantity", exact: true }).click();
  await expect(card.getByRole("button", { name: /^Add .* to cart$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^View basket,/ })).not.toBeVisible();
  // Multiple pack sizes share one product's stock allocation.
  const catalog = (await (await page.request.get(`${API}/api/catalog/products?q=tomato`)).json()).data.items;
  const tomato = catalog.find((p: { slug: string }) => p.slug === "tomato");
  const kilo = tomato.variants.find((v: { baseQuantity: number }) => v.baseQuantity === 1000);
  await page.evaluate(
    ({ id, count }) =>
      localStorage.setItem(
        "pgrs-cart",
        JSON.stringify({
          state: { lines: [{ variantId: id, quantity: count }], couponCode: null },
          version: 0,
        }),
      ),
    { id: kilo.id, count: Math.floor(tomato.availableQuantity / 1000) },
  );
  await page.goto("/search?q=tomato");
  await page.reload();
  const tomatoCard = page.getByRole("article", { name: tomato.nameEn, exact: true });
  await tomatoCard.getByLabel(`Pack size for ${tomato.nameEn}`).selectOption(kilo.id);
  await expect(tomatoCard.getByRole("button", { name: "Increase quantity", exact: true })).toBeDisabled();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("shop-small-phone.png"), fullPage: false });
});

test("phone owner creates and renames groceries/categories, updates pack stock/prices, and fulfils a multi-item guest order", async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
  });
  const owner = await context.newPage();
  await ownerLogin(owner);
  const nav = owner.getByRole("navigation", { name: "Owner navigation" });
  for (const label of ["Orders", "Products", "Categories", "Stock", "More"])
    await expect(nav.getByText(label, { exact: true })).toBeVisible();
  const suffix = Date.now();
  const category = `Pantry ${suffix}`;
  const productName = `Grocery pack ${suffix}`;
  const newName = `Breakfast oats ${suffix}`;
  await nav.getByRole("link", { name: "Categories", exact: true }).click();
  await owner.getByLabel("Name (EN)", { exact: true }).fill(category);
  await owner.getByRole("button", { name: "Add category", exact: true }).click();
  await owner.getByRole("button", { name: `Edit ${category}`, exact: true }).click();
  await owner.getByLabel("Name (EN)", { exact: true }).fill(`${category} & staples`);
  await owner.getByRole("button", { name: "Save category", exact: true }).click();
  await expect(owner.getByRole("heading", { name: `${category} & staples`, exact: true })).toBeVisible();
  await noOverflow(owner);
  await nav.getByRole("link", { name: "Products", exact: true }).click();
  await owner.getByRole("button", { name: "New product", exact: true }).click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByLabel("Category", { exact: true }).selectOption({ label: `${category} & staples` });
  await dialog.getByLabel("Name (English)", { exact: true }).fill(productName);
  await dialog.getByLabel("Selling type", { exact: true }).selectOption("packaged");
  await expect(dialog.getByLabel("Units per pack", { exact: true })).toHaveValue("1");
  await dialog.getByLabel("Price (₹)", { exact: true }).fill("125");
  await dialog.getByLabel("Initial stock (packs)", { exact: true }).fill("15");
  await dialog.getByRole("button", { name: "Create product", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await owner.getByRole("button", { name: `Edit ${productName}`, exact: true }).click();
  await dialog.getByLabel("Name (English)", { exact: true }).fill(newName);
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(owner.getByRole("heading", { name: newName, exact: true })).toBeVisible();
  await noOverflow(owner);
  const list = (
    await (await owner.request.get(`${API}/api/admin/products?q=${encodeURIComponent(newName)}`)).json()
  ).data;
  const product = list.find((p: { nameEn: string }) => p.nameEn === newName);
  expect(product.sellingType).toBe("packaged");
  expect(product.stockQuantity).toBe(15);
  await nav.getByRole("link", { name: "Stock", exact: true }).click();
  await owner.getByLabel("Search stock", { exact: true }).fill(newName);
  await owner.getByRole("button", { name: `Update stock for ${newName}`, exact: true }).click();
  await owner.getByLabel("Delta (packs)", { exact: true }).fill("-2");
  await owner.getByRole("button", { name: "Update stock", exact: true }).click();
  await expect(owner.getByText("Stock updated", { exact: true })).toBeVisible();
  await noOverflow(owner);
  await nav.getByRole("button", { name: "More", exact: true }).click();
  await owner
    .getByRole("navigation", { name: "Owner menu" })
    .getByRole("link", { name: "Quick price", exact: true })
    .click();
  await owner.getByLabel("Search (English / മലയാളം)", { exact: true }).fill(newName);
  await expect(owner.getByLabel(`Price per kg for ${newName}`, { exact: true })).toHaveCount(0);
  const price = owner.getByLabel(`New price for ${newName} 1 pack`, { exact: true });
  await price.fill("139.50");
  await price.press("Tab");
  await owner.getByRole("button", { name: "Save all", exact: true }).click();
  await expect(owner.getByText(/price.*saved/i)).toBeVisible();
  // A weight-labelled packaged rice bag must also have pack pricing.
  await owner.getByLabel("Search (English / മലയാളം)", { exact: true }).fill("Matta Rice");
  await expect(owner.getByLabel(/Price per kg for Matta Rice/)).toHaveCount(0);
  await noOverflow(owner);
  await nav.getByRole("link", { name: "Products", exact: true }).click();
  await owner.getByLabel("Search products", { exact: true }).fill(newName);
  await owner.screenshot({ path: testInfo.outputPath("owner-products-phone.png"), fullPage: false });

  await page.goto(`/search?q=${encodeURIComponent(newName)}`);
  const card = page.getByRole("article", { name: newName, exact: true });
  await card.getByRole("button", { name: /^Add .* to cart$/ }).click();
  await card.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/search?q=matta");
  const rice = page.getByRole("article").first();
  await rice.getByLabel(/Pack size for/).selectOption({ label: "5 kg" });
  await rice.getByRole("button", { name: /^Add .* to cart$/ }).click();
  await expect(page.getByRole("link", { name: "View basket, 3 items", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View basket, 3 items", exact: true }).click();
  await expect(page.getByText(newName, { exact: true }).first()).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "Continue to WhatsApp checkout", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Mobile Customer");
  await page.getByLabel("Mobile number", { exact: true }).fill("9800000091");
  await page.getByLabel("House / street", { exact: true }).fill("Phone test house, Kottayam");
  await page.getByLabel("Pincode", { exact: true }).fill("686001");
  await interceptWhatsApp(page);
  const result = await sendGuestRequest(page);
  const orderId = result.orderId;
  await page.goto(`/guest-orders/${orderId}?token=${result.guestToken}`);
  await expect(page).toHaveURL(new RegExp(`/guest-orders/${orderId}\\?token=`));
  const order = (await (await owner.request.get(`${API}/api/admin/orders/${orderId}`)).json()).data;
  expect(order.items).toHaveLength(2);
  expect(order.items.find((i: { productId: string }) => i.productId === product.id).quantity).toBe(2);
  expect(order.items.find((i: { productId: string }) => i.productId === product.id).unitPricePaise).toBe(
    13950,
  );
  expect(order.items.every((i: { unitType: string }) => i.unitType === "unit")).toBe(true);
  await nav.getByRole("link", { name: "Orders", exact: true }).click();
  await owner.getByRole("link").filter({ hasText: order.orderNumber }).click();
  await noOverflow(owner);
  await confirmRequest(owner);
  await expect(owner.getByLabel("Packed grams", { exact: true })).toHaveCount(0);
  await owner.getByRole("button", { name: "Mark packed & recalculate bill", exact: true }).click();
  await owner.getByRole("button", { name: "Send out for delivery", exact: true }).click();
  await owner.getByRole("button", { name: /^Record cash collected/ }).click();
  await expect(owner.getByText("Cash collection recorded", { exact: true })).toBeVisible();
  await owner.getByRole("button", { name: "Mark delivered", exact: true }).click();
  await expect(owner.getByText("Delivered", { exact: true })).toBeVisible();
  const fulfilled = (await (await owner.request.get(`${API}/api/admin/orders/${orderId}`)).json()).data;
  expect(fulfilled.status).toBe("delivered");
  expect(fulfilled.paymentStatus).toBe("paid");
  const updated = (await (await owner.request.get(`${API}/api/admin/products/${product.id}`)).json()).data;
  expect(updated.inventory.stockQuantity).toBe(11);
  expect(updated.variants[0].id).toBe(product.variants[0].id);
  await context.close();
});

test("phone guest quantities persist across packs, categories and reloads even with an old session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await otpLogin(page, "+919700000092");
  await page.goto("/search?q=tomato");
  const tomato = page.getByRole("article", { name: "Tomato", exact: true });
  await tomato.getByRole("button", { name: /^Add .* to cart$/ }).click();
  await tomato.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await expect(tomato.getByRole("group")).toContainText("2");
  const picker = tomato.getByLabel("Pack size for Tomato", { exact: true });
  await picker.selectOption({ label: "1 kg" });
  await tomato.getByRole("button", { name: /^Add .* to cart$/ }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("navigation", { name: "Shop categories" })
    .getByRole("link", { name: "Vegetables", exact: true })
    .click();
  await expect(page).toHaveURL(/category\/vegetables/);
  await page
    .getByRole("navigation", { name: "Shopping navigation" })
    .getByRole("link", { name: "Cart", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Your cart (3)", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your cart (3)", exact: true })).toBeVisible();
  await noOverflow(page);
  const lines = await page.evaluate(() => JSON.parse(localStorage.getItem("pgrs-cart") ?? "{}").state.lines);
  const cart = (await (await page.request.post(`${API}/api/cart/preview`, { data: { items: lines } })).json())
    .data;
  expect(cart.items).toHaveLength(2);
  expect(cart.items.map((i: { quantity: number }) => i.quantity).sort()).toEqual([1, 2]);
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons.filter((i: { type: string }) => i.type === "image/png")) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
});
