import { expect, test } from "@playwright/test";
import { otpLogin } from "./helpers/auth";

const PHONE = "+919700000009";

test("customer can log in with a phone OTP", async ({ page }) => {
  await otpLogin(page);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: /hello|നമസ്കാരം/i })).toBeVisible();
  await expect(page.getByText(PHONE)).toBeVisible();
});
