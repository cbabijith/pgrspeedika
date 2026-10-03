import { expect, test, type Page } from "@playwright/test";
import { interceptWhatsApp, sendGuestRequest } from "./helpers/whatsapp";

const ADMIN = process.env.ADMIN_URL ?? "http://localhost:3001";
const DETAILS_KEY = "pgrs-guest-details";

async function openCheckout(page: Page) {
  await page.goto("/products/tomato");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "WhatsApp checkout", exact: true })).toBeVisible();
}

test("phone checkout remembers drafts and repeat orders appear in the owner's WhatsApp requests", async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openCheckout(page);
  await page.getByLabel("Your name", { exact: true }).fill("Repeat Guest");
  await page.getByLabel("Mobile number", { exact: true }).fill("9800");
  await page.reload();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("Repeat Guest");
  await expect(page.getByLabel("Mobile number", { exact: true })).toHaveValue("9800");
  await page.getByLabel("Mobile number", { exact: true }).fill("9800000081");
  await page.getByLabel("House / street", { exact: true }).fill("Repeat house, Market road");
  await page.getByLabel("Town / city", { exact: true }).fill("Pala");
  await page.getByLabel("Pincode", { exact: true }).fill("686575");
  await page.getByLabel("Landmark (optional)", { exact: true }).fill("Near the market");
  await page.getByLabel("Order note (optional)", { exact: true }).fill("Only this order: deliver after 5 PM");
  await expect(page.getByRole("status")).toContainText("Details saved on this browser");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("remembered-checkout-mobile.png"), fullPage: true });
  await interceptWhatsApp(page);
  const first = await sendGuestRequest(page);

  await openCheckout(page);
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("Repeat Guest");
  await expect(page.getByLabel("Mobile number", { exact: true })).toHaveValue("9800000081");
  await expect(page.getByLabel("House / street", { exact: true })).toHaveValue("Repeat house, Market road");
  await expect(page.getByLabel("Town / city", { exact: true })).toHaveValue("Pala");
  await expect(page.getByLabel("Pincode", { exact: true })).toHaveValue("686575");
  await expect(page.getByLabel("Landmark (optional)", { exact: true })).toHaveValue("Near the market");
  await expect(page.getByLabel("Order note (optional)", { exact: true })).toHaveValue("");
  await page.getByLabel("House / street", { exact: true }).fill("Updated house, Market road");
  await page.reload();
  await expect(page.getByLabel("House / street", { exact: true })).toHaveValue("Updated house, Market road");
  const second = await sendGuestRequest(page);
  expect(second.orderId).not.toBe(first.orderId);
  expect(decodeURIComponent(second.whatsappLink)).toContain("Updated house, Market road");
  expect(decodeURIComponent(second.whatsappLink)).not.toContain("Only this order");

  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const admin = await adminContext.newPage();
  try {
    await admin.goto(`${ADMIN}/login`);
    await admin.getByLabel("Email", { exact: true }).fill(process.env.SEED_OWNER_EMAIL!);
    await admin.getByLabel("Password", { exact: true }).fill(process.env.SEED_OWNER_PASSWORD!);
    await admin.getByRole("button", { name: "Sign in", exact: true }).click();
    await admin.waitForURL(/dashboard/);
    await admin.goto(`${ADMIN}/orders`);
    await admin.getByLabel("Search orders", { exact: true }).fill("no-such-customer");
    await admin.getByLabel("Filter by slot date", { exact: true }).fill("2020-01-01");
    await admin.getByRole("button", { name: "WhatsApp requests", exact: true }).click();
    await expect(admin.getByLabel("Search orders", { exact: true })).toHaveValue("");
    await expect(admin.getByLabel("Filter by slot date", { exact: true })).toHaveValue("");
    await expect(admin.getByRole("link", { name: new RegExp(first.orderNumber) })).toBeVisible();
    const request = admin.getByRole("link", { name: new RegExp(second.orderNumber) });
    await expect(request).toContainText("Awaiting confirmation");
    await expect(request).toContainText("Delivery to be agreed with customer");
    await admin.screenshot({
      path: testInfo.outputPath("owner-whatsapp-requests-mobile.png"),
      fullPage: true,
    });
    await request.click();
    await expect(admin.getByRole("heading", { name: "Confirm WhatsApp request", exact: true })).toBeVisible();
    await expect(admin.getByText("Updated house, Market road", { exact: true })).toBeVisible();
    await expect(admin.getByText("Repeat Guest", { exact: true })).toBeVisible();
    await expect(
      admin.getByRole("link", { name: "Chat with customer on WhatsApp", exact: true }),
    ).toHaveAttribute("href", /^https:\/\/wa.me\/919800000081\?text=/);
  } finally {
    await adminContext.close();
  }
});

test("customer can clear saved details without losing the basket or current order note", async ({ page }) => {
  await openCheckout(page);
  await page.getByLabel("Your name", { exact: true }).fill("Forget Me");
  await page.getByLabel("Mobile number", { exact: true }).fill("9800000082");
  await page.getByLabel("Order note (optional)", { exact: true }).fill("Keep this order's note");
  await page.getByRole("button", { name: "Clear saved details", exact: true }).click();
  await expect(page.getByLabel("Your name", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Mobile number", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Order note (optional)", { exact: true })).toHaveValue(
    "Keep this order's note",
  );
  expect(await page.evaluate((key) => localStorage.getItem(key), DETAILS_KEY)).toBeNull();
  await page.reload();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Mobile number", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Clear saved details", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue to WhatsApp", exact: true })).toBeEnabled();
});

test("damaged saved details do not break checkout or change the retry key", async ({ page }) => {
  await openCheckout(page);
  const attempt = await page.evaluate(() => sessionStorage.getItem("pgrs-whatsapp-request-key"));
  expect(attempt).toBeTruthy();
  for (const damaged of [
    "{invalid json",
    JSON.stringify({ name: { bad: true }, phone: 123, city: "Pala", note: "stale note" }),
  ]) {
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: DETAILS_KEY,
      value: damaged,
    });
    await page.reload();
    await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Mobile number", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Order note (optional)", { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Continue to WhatsApp", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => sessionStorage.getItem("pgrs-whatsapp-request-key"))).toBe(attempt);
  }
  await expect(page.getByLabel("Town / city", { exact: true })).toHaveValue("Pala");
});

test("unavailable browser detail storage never blocks a guest order", async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (key: string, value?: string) {
        if (key === "pgrs-guest-details") throw new DOMException("Storage is disabled", "SecurityError");
        return original.call(this, key, value!);
      };
    }
  });
  await openCheckout(page);
  await page.getByLabel("Your name", { exact: true }).fill("Private Guest");
  await page.getByLabel("Mobile number", { exact: true }).fill("9800000083");
  await page.getByLabel("House / street", { exact: true }).fill("Private house, Market road");
  await page.getByLabel("Pincode", { exact: true }).fill("686001");
  await expect(page.getByRole("status")).toContainText("This browser couldn't save your details");
  await interceptWhatsApp(page);
  const order = await sendGuestRequest(page);
  expect(order.awaitingConfirmation).toBe(true);
});
