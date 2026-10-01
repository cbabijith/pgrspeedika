import { expect, test, type Page } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const PHONE = "+919700000001";

/** OTP login (duplicated as a plain helper — specs cannot import each other). */
async function otpLogin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(PHONE.replace("+91", ""));
  await page.getByRole("button", { name: /send code|കോഡ് അയക്കുക/i }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible({ timeout: 15_000 });

  let code = "";
  for (let attempt = 0; attempt < 20 && !code; attempt++) {
    const res = await page.request.get(`${API}/api/auth/test-otp?phone=${encodeURIComponent(PHONE)}`);
    if (res.ok()) {
      const body = (await res.json()) as { data?: { code?: string } };
      code = body.data?.code ?? "";
    }
    if (!code) await page.waitForTimeout(500);
  }
  expect(code, "test OTP must be retrievable (ENABLE_TEST_OTP=true)").toMatch(/^\d{6}$/);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: /verify & continue|പരിശോധിച്ച് തുടരുക/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

/**
 * End-to-end COD order: login → add matta rice (₹325, above the ₹99 zone
 * minimum) → checkout with a new address in a served pincode → place order.
 */
test("customer can place a COD order end to end", async ({ page }) => {
  await otpLogin(page);

  // Deterministic product page straight from the seed.
  await page.goto("/products/matta-rice");

  // Pick the 5 kg pack so the cart clears the ₹99 zone minimum.
  const pack = page.getByRole("button", { name: /5 kg/ }).first();
  if (await pack.isVisible()) await pack.click();

  await page.getByRole("button", { name: /add to cart|കൊട്ടയിൽ ചേർക്കുക/i }).click();
  // The cart drawer opens on add; go straight to checkout.
  await page.goto("/checkout");

  await page.getByRole("radio", { name: /add a new address|പുതിയ വിലാസം/i }).check();
  await page.getByLabel("Contact name").fill("E2E Customer");
  await page.getByLabel("Phone").fill("9800000001");
  await page.getByLabel("House / street").fill("E2E House, Test Lane");
  await page.getByLabel("Landmark").fill("Near test park");
  await page.getByLabel("Pincode", { exact: true }).fill("670001");

  await page.getByRole("radio", { name: /cash on delivery/i }).check();

  await page.getByRole("button", { name: /place order|ഓർഡർ സ്ഥിരീകരിക്കുക/i }).click();

  await page.waitForURL(/\/orders\/[0-9a-f-]+/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/PGRS-\d+-\d+/);
});
