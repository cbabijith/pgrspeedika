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
  test.skip(!process.env.SEED_OWNER_PASSWORD, "SEED_OWNER_PASSWORD required");

  // Customer session for verification at the end.
  await apiLogin(page);

  // Staff signs in on the admin app.
  const adminContext = await browser.newContext({ baseURL: `http://localhost:${ADMIN_PORT}` });
  const admin = await adminContext.newPage();
  await admin.goto("/login");
  await admin.getByLabel("Email").fill(process.env.SEED_OWNER_EMAIL ?? "owner@pgrspeedika.example");
  await admin.getByLabel("Password").fill(process.env.SEED_OWNER_PASSWORD ?? "");
  await admin.getByRole("button", { name: /sign in/i }).click();
  await admin.waitForURL(/dashboard/);

  // Find the newest confirmed order.
  const res = await admin.request.get(`${API}/api/admin/orders?status=confirmed&page=1&pageSize=1`);
  expect(res.ok(), "owner session must authorize the admin API").toBeTruthy();
  const body = (await res.json()) as { data?: { items?: Array<{ id: string; orderNumber: string }> } };
  const order = body.data?.items?.[0];
  test.skip(!order, "no confirmed order — run checkout-cod.spec before this one");
  if (!order) return;

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
