import { expect, test, type Page } from "@playwright/test";
import { otpLogin } from "./helpers/auth";
import { interceptWhatsApp, sendGuestRequest, confirmRequest } from "./helpers/whatsapp";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ADMIN = process.env.ADMIN_URL ?? "http://localhost:3001";

async function adminLogin(page: Page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email", { exact: true }).fill(process.env.SEED_OWNER_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.SEED_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/dashboard/);
}
async function fillGuest(page: Page, phone = "9800000071") {
  await page.getByLabel("Your name", { exact: true }).fill("Guest Shopper");
  await page.getByLabel("Mobile number", { exact: true }).fill(phone);
  await page.getByLabel("House / street", { exact: true }).fill("Guest house, Test road");
  await page.getByLabel("Pincode", { exact: true }).fill("686001");
}
async function addRice(page: Page) {
  await page.goto("/products/matta-rice");
  await page.getByRole("group", { name: "Pack size" }).first().getByRole("button", { name: /5 kg/ }).click();
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("admin restricts delivery to Kottayam and can pause or enable a served pincode", async ({ page }) => {
  await adminLogin(page);
  await page.goto(`${ADMIN}/zones`);
  await expect(page.getByText(/Delivery is limited to Kottayam district/)).toBeVisible();
  await page.getByLabel("Pincode", { exact: true }).fill("686691");
  await expect(page.getByText("Enter a Kottayam district pincode", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add zone", exact: true })).toBeDisabled();
  await page.getByLabel("Pincode", { exact: true }).fill("686002");
  await page.getByLabel("Area (EN)", { exact: true }).fill("Kottayam Collectorate");
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const zone = page.getByRole("row").filter({ hasText: "686002" });
  await expect(zone.getByText("Active", { exact: true })).toBeVisible();
  await zone.getByRole("button", { name: "Edit delivery to 686002", exact: true }).click();
  await page.getByLabel("Min order ₹", { exact: true }).fill("149");
  await page.getByLabel("Fee ₹", { exact: true }).fill("35");
  await page.getByLabel("Free delivery above ₹", { exact: true }).fill("699");
  await page.getByRole("button", { name: "Save zone", exact: true }).click();
  await expect(page.getByText("Zone updated", { exact: true })).toBeVisible();
  const updated = (
    await (
      await page.request.post(`${API}/api/delivery/check-pincode`, { data: { pincode: "686002" } })
    ).json()
  ).data.zone;
  expect(updated.minOrderPaise).toBe(14900);
  expect(updated.deliveryFeePaise).toBe(3500);
  expect(updated.freeDeliveryThresholdPaise).toBe(69900);
  await zone.getByRole("button", { name: "Pause delivery to 686002", exact: true }).click();
  await expect(zone.getByText("Paused", { exact: true })).toBeVisible();
  expect(
    (
      await (
        await page.request.post(`${API}/api/delivery/check-pincode`, { data: { pincode: "686002" } })
      ).json()
    ).data.served,
  ).toBe(false);
  await zone.getByRole("button", { name: "Enable delivery to 686002", exact: true }).click();
  await expect(zone.getByText("Active", { exact: true })).toBeVisible();
  expect(
    (
      await (
        await page.request.post(`${API}/api/delivery/check-pincode`, { data: { pincode: "686002" } })
      ).json()
    ).data.served,
  ).toBe(true);
  const listed = (await (await page.request.get(`${API}/api/delivery/zones`)).json()).data;
  expect(listed.some((z: { pincode: string }) => z.pincode === "670001")).toBe(false);
  await page.goto("/about");
  await expect(page.getByText(/We currently focus on Kottayam district only/)).toBeVisible();
  await page.goto("/contact");
  await expect(page.getByRole("main").getByText(/PGRS Peedika, Kottayam district, Kerala/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Message us on WhatsApp", exact: true })).toHaveAttribute(
    "href",
    "https://wa.me/919447114449",
  );
});

// This complete journey exercises owner forms and the guest flow against the same persisted data.
test("admin creates and edits the catalog, manages kg stock/prices, then fulfils a guest's weighed order", async ({
  browser,
  page,
}, testInfo) => {
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await adminLogin(admin);
  const suffix = String(Date.now());
  const name = `E2E Carrot ${suffix}`;
  const category = `E2E Greens ${suffix}`;
  const slug = `e2e-carrot-${suffix}`;

  await admin.goto(`${ADMIN}/categories`);
  await admin.getByLabel("Name (EN)", { exact: true }).fill(category);
  await admin.getByLabel("Name (ML)", { exact: true }).fill("പച്ചക്കറികൾ");
  await admin.getByRole("button", { name: "Add category", exact: true }).click();
  const categoryRow = admin.getByRole("row").filter({ hasText: category });
  await expect(categoryRow).toBeVisible();
  await categoryRow.getByRole("button", { name: `Edit ${category}`, exact: true }).click();
  await admin.getByLabel("Description", { exact: true }).fill("Fresh market vegetables");
  await admin.getByRole("button", { name: "Save category", exact: true }).click();
  await expect(admin.getByText("Category updated", { exact: true })).toBeVisible();

  await admin.goto(`${ADMIN}/products`);
  await admin.getByRole("button", { name: "New product", exact: true }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Slug", { exact: true }).fill(slug);
  await dialog.getByLabel("Category", { exact: true }).selectOption({ label: category });
  await dialog.getByLabel("Name (English)", { exact: true }).fill(name);
  await dialog.getByLabel("Name (Malayalam)", { exact: true }).fill("ക്യാരറ്റ്");
  await dialog.getByLabel("Label (EN)", { exact: true }).fill("500 g");
  await dialog.getByLabel("Label (ML)", { exact: true }).fill("500 ഗ്രാം");
  await dialog.getByLabel("Grams per pack", { exact: true }).fill("500");
  await dialog.getByLabel("Price (₹)", { exact: true }).fill("100");
  await dialog.getByLabel("Initial stock (kg)", { exact: true }).fill("10");
  await dialog.getByRole("button", { name: "Create product", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const productList = (
    await (await admin.request.get(`${API}/api/admin/products?q=${encodeURIComponent(name)}`)).json()
  ).data;
  const product = productList.find((p: { slug: string }) => p.slug === slug);
  expect(product.stockQuantity).toBe(10000);
  const variant = product.variants[0];

  await admin.goto(`${ADMIN}/inventory`);
  await admin.getByRole("row").filter({ hasText: name }).click();
  await admin.getByLabel(/Delta \(kg/).fill("-1");
  await admin.getByLabel("Reason", { exact: true }).fill("Market stock correction");
  await admin.getByRole("button", { name: "Update stock", exact: true }).click();
  await expect(admin.getByText("Stock updated", { exact: true })).toBeVisible();
  const inventory = (await (await admin.request.get(`${API}/api/admin/inventory`)).json()).data;
  expect(inventory.find((i: { productId: string }) => i.productId === product.id).stockQuantity).toBe(9000);

  await admin.goto(`${ADMIN}/quick-price`);
  await admin.getByLabel("Category", { exact: true }).selectOption("all");
  await admin.getByLabel("Search (English / മലയാളം)", { exact: true }).fill(name);
  await admin.getByLabel(`Price per kg for ${name}`, { exact: true }).fill("240");
  await admin.getByLabel(`Price per kg for ${name}`, { exact: true }).press("Tab");
  await admin.getByRole("button", { name: "Save all", exact: true }).click();
  await expect(admin.getByText(/price\(s\) updated|price.*saved/i)).toBeVisible();
  const changed = (await (await admin.request.get(`${API}/api/admin/products/${product.id}`)).json()).data;
  expect(changed.variants[0].id).toBe(variant.id);
  expect(changed.variants[0].pricePaise).toBe(12000);

  await page.goto(`/products/${slug}`);
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Continue to WhatsApp checkout/ })
    .click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading", { name: "WhatsApp checkout", exact: true })).toBeVisible();
  await fillGuest(page);
  await page.screenshot({ path: testInfo.outputPath("guest-checkout-desktop.png"), fullPage: true });
  await interceptWhatsApp(page);
  const result = await sendGuestRequest(page);
  const orderId = result.orderId;
  await page.goto(`/guest-orders/${orderId}?token=${result.guestToken}`);
  await expect(page).toHaveURL(new RegExp(`/guest-orders/${orderId}\\?token=`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/PGRS-/);
  const saved = (await (await admin.request.get(`${API}/api/admin/orders/${orderId}`)).json()).data;
  expect(saved.grandTotalPaise).toBe(12000);
  expect(saved.address.contactName).toBe("Guest Shopper");
  expect(saved.source).toBe("whatsapp");

  await admin.goto(`${ADMIN}/orders/${orderId}`);
  await confirmRequest(admin);
  await admin.getByLabel("Packed grams", { exact: true }).fill("450");
  await admin.getByRole("button", { name: "Mark packed & recalculate bill", exact: true }).click();
  await expect(admin.getByRole("button", { name: "Send out for delivery", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("450 g", { exact: false })).toBeVisible();
  const packed = (await (await admin.request.get(`${API}/api/admin/orders/${orderId}`)).json()).data;
  expect(packed.finalGrandTotalPaise).toBe(13700);
  const soldInventory = (await (await admin.request.get(`${API}/api/admin/inventory`)).json()).data;
  const sold = soldInventory.find((i: { productId: string }) => i.productId === product.id);
  expect(sold.stockQuantity).toBe(8550);
  expect(sold.reservedQuantity).toBe(0);
  await admin.getByRole("button", { name: "Send out for delivery", exact: true }).click();
  await admin.getByRole("button", { name: /Record cash collected/ }).click();
  await expect(admin.getByText("Cash collection recorded", { exact: true })).toBeVisible();
  await admin.getByRole("button", { name: "Mark delivered", exact: true }).click();
  await page.reload();
  await expect(page.getByText("Delivered", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Payment collected", { exact: true })).toBeVisible();
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Your guest orders", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(saved.orderNumber) })).toBeVisible();
  await page.goto(`/products/${slug}`);
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  expect(
    (
      await admin.request.patch(`${API}/api/admin/products/${product.id}`, { data: { isActive: false } })
    ).status(),
  ).toBe(200);
  await page.goto("/checkout");
  await expect(page.getByText("Some cart items are no longer available.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove unavailable items", exact: true }).click();
  await expect(page.getByText("Your basket is empty", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("pgrs-cart") ?? "{}").state?.lines),
  ).toEqual([]);
  await adminContext.close();
});

test("guest WhatsApp message includes all selected items and address", async ({ page }) => {
  await interceptWhatsApp(page);
  await addRice(page);
  await page.goto("/whatsapp");
  await fillGuest(page, "9800000072");
  const result = await sendGuestRequest(page);
  expect(decodeURIComponent(result.whatsappLink)).toContain(result.orderNumber);
  expect(decodeURIComponent(result.whatsappLink)).toContain("Matta Rice");
  expect(decodeURIComponent(result.whatsappLink)).toContain("Guest house, Test road");
  expect(decodeURIComponent(result.whatsappLink)).toContain("Cash on delivery");
  await page.goto("/orders");
  await expect(page.getByRole("link", { name: new RegExp(result.orderNumber) })).toBeVisible();
});

test("mobile guest checkout validates Kottayam addresses without a zone or minimum-order gate", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/products/tomato");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await page.goto("/checkout");
  await fillGuest(page, "9800000073");
  await page.getByLabel("Pincode", { exact: true }).fill("110001");
  await page.getByRole("button", { name: "Continue to WhatsApp", exact: true }).click();
  await expect(page.getByText("Enter a pincode within Kottayam district", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("guest-checkout-mobile.png"), fullPage: true });
});

test("mobile guest can correct required details and safely retry after a saved order's response is lost", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addRice(page);
  await page.goto("/checkout");
  await page.getByLabel("Pincode", { exact: true }).fill("686001");
  await page.getByRole("button", { name: "Continue to WhatsApp", exact: true }).click();
  await expect(page.getByText("Enter your name", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter a valid 10-digit mobile number", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter your house and street", { exact: true })).toBeVisible();
  await fillGuest(page, "9800000074");
  let firstOrder: { orderId: string; orderNumber: string } | undefined;
  const keys: string[] = [];
  let replayResult: { replay: boolean; orderId: string; guestToken: string } | undefined;
  await page.route(`${API}/api/whatsapp/request`, async (route) => {
    keys.push(route.request().postDataJSON().idempotencyKey);
    if (!firstOrder) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      firstOrder = (await response.json()).data;
      await route.abort("failed");
    } else {
      const response = await route.fetch();
      replayResult = (await response.json()).data;
      await route.fulfill({ response });
    }
  });
  await page.getByRole("button", { name: "Continue to WhatsApp", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Failed to fetch/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "WhatsApp checkout", exact: true })).toBeVisible();
  await interceptWhatsApp(page);
  const retry = page.waitForResponse(
    (r) => r.url() === `${API}/api/whatsapp/request` && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continue to WhatsApp", exact: true }).click();
  await retry;
  await expect(page).toHaveURL(/^https:\/\/wa.me\/919447114449/);
  const result = replayResult!;
  expect(result.replay).toBe(true);
  expect(result.orderId).toBe(firstOrder!.orderId);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await expect(page).toHaveURL(/^https:\/\/wa.me\/919447114449/);
  await page.goto(`/guest-orders/${result.orderId}?token=${result.guestToken}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(firstOrder!.orderNumber);
  await page.screenshot({ path: testInfo.outputPath("guest-confirmation-mobile.png"), fullPage: true });
});

test("guest basket stays on the device even when an account session exists", async ({ page }) => {
  await addRice(page);
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await otpLogin(page, "+919800000075");
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your cart (1)", exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("pgrs-cart") ?? "{}").state?.lines.length),
  ).toBe(1);
  await expect(page.getByRole("button", { name: "Login", exact: true })).toHaveCount(0);
});
