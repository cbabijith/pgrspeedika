import { expect, type Page, request, test } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const PHONE = "+919700000009";

/** OTP login helper shared by the e2e specs. */
export async function otpLogin(page: Page) {
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
  expect(code, "test OTP must be retrievable (run backend with ENABLE_TEST_OTP=true)").toMatch(/^\d{6}$/);

  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: /verify & continue|പരിശോധിച്ച് തുടരുക/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

test("customer can log in with a phone OTP", async ({ page }) => {
  await otpLogin(page);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: /hello|നമസ്കാരം/i })).toBeVisible();
  await expect(page.getByText(PHONE)).toBeVisible();
});

void request;
