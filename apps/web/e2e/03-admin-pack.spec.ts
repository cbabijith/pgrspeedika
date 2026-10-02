import { expect, test, type Page } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 3001);
const PHONE = "+919700000001";

/** Customer OTP login at the API level (no UI). */
async function apiLogin(page: Page) {
  await page.request.post(`${API}/api/auth/phone-number/send-otp`, {
    data: { phoneNumber: PHONE },
  });
  let code = "";
  for (let attempt = 0; attempt < 20 && !code; attempt++) {
    const res = await page.request.get(`${API}/api/auth/test-otp?phone=${encodeURIComponent(PHONE)}`);
    if (res.ok()) {
      const body = (await res.json()) as { data?: { code?: string } };
      code = body.data?.code ?? "";
    }
    if (!code) await page.waitForTimeout(400);
  }
  expect(code).toMatch(/^\d{6}$/);
  const verify = await page.request.post(`${API}/api/auth/phone-number/verify`, {
    data: { phoneNumber: PHONE, code },
  });
  expect(verify.ok()).toBeTruthy();
}

/**
 * Admin packs the newest confirmed order; the customer's tracking API then
 * shows packed status and the final (weight-adjusted) bill.
 * Requires the seeded owner (pnpm db:seed) and the COD checkout spec.
 */
test("admin packs an order and the customer sees the final bill", async ({ browser, page }) => {
  expect(process.env.SEED_OWNER_PASSWORD, "Seeded owner password is required").toBeTruthy();

  // Customer session for verification at the end.
  await apiLogin(page);

  // Staff signs in on the admin app.
  const adminContext = await browser.newContext({ baseURL: `http://localhost:${ADMIN_PORT}` });
  const admin = await adminContext.newPage();
  await admin.goto("/login");
  await admin.getByLabel("Email").fill(process.env.SEED_OWNER_EMAIL ?? "owner@pgrspeedika.example");
  await admin.getByLabel("Password", { exact: true }).fill(process.env.SEED_OWNER_PASSWORD ?? "");
  await admin.getByRole("button", { name: /sign in/i }).click();
  await admin.waitForURL(/dashboard/);

  // Create this test's order independently; no earlier spec or existing order is required.
  const catalog = await page.request.get(`${API}/api/catalog/products/matta-rice`);
  const rice = (await catalog.json()).data.product.variants.find(
    (v: { baseQuantity: number }) => v.baseQuantity === 5000,
  );
  expect(rice).toBeTruthy();
  const cart = await page.request.post(`${API}/api/cart/items`, {
    data: { items: [{ variantId: rice.id, quantity: 1 }] },
  });
  expect(cart.ok()).toBeTruthy();
  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + 86400000));
  const slots = (await (await page.request.get(`${API}/api/delivery/slots?date=${tomorrow}`)).json()).data;
  const slot = slots.find((s: { bookable: boolean }) => s.bookable);
  expect(slot).toBeTruthy();
  const placed = await page.request.post(`${API}/api/checkout/order`, {
    data: {
      address: {
        label: "Test",
        contactName: "Packing customer",
        contactPhone: PHONE,
        line1: "Packing house, Market road",
        pincode: "686001",
        city: "Kottayam",
        isDefault: true,
      },
      slotId: slot.id,
      slotDate: tomorrow,
      paymentMethod: "cod",
      idempotencyKey: `packing-${Date.now()}`,
    },
  });
  expect(placed.ok()).toBeTruthy();
  const result = (await placed.json()).data;
  const order = { id: result.orderId, orderNumber: result.orderNumber };

  // Pack it through the packing screen (ordered weights are prefilled).
  await admin.goto(`/orders/${order.id}`);
  await expect(admin.getByRole("heading", { level: 1 })).toContainText(order.orderNumber);
  await admin
    .getByRole("button", { name: /mark packed & recalculate bill/i })
    .first()
    .click();

  // Poll the tracking API until the pack lands (packing recomputes the bill).
  let orderBody: {
    data?: { status?: string; grandTotalPaise?: number; finalGrandTotalPaise?: number };
  } | null = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const customerRes = await page.request.get(`${API}/api/orders/${order.id}`);
    if (customerRes.ok()) {
      orderBody = (await customerRes.json()) as typeof orderBody;
      if (orderBody?.data?.status === "packed") break;
    }
    await page.waitForTimeout(1_000);
  }
  expect(orderBody?.data?.status).toBe("packed");
  expect(orderBody?.data?.finalGrandTotalPaise).toBeGreaterThan(0);
});
