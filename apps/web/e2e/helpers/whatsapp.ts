import { expect, type Page } from "@playwright/test";
import type { WhatsAppOrderResult } from "@pgrs/contracts";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Verify the real redirect without opening WhatsApp or sending a message. */
export async function interceptWhatsApp(page: Page) {
  await page.route("https://wa.me/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><h1>WhatsApp handoff verified</h1>",
    }),
  );
}
export async function sendGuestRequest(page: Page): Promise<WhatsAppOrderResult> {
  let saved: WhatsAppOrderResult | undefined;
  await page.route(
    `${API}/api/whatsapp/request`,
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      saved = (await response.json()).data;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Continue to WhatsApp", exact: true }).click();
  await expect(page).toHaveURL(/^https:\/\/wa.me\/919447114449\?text=/);
  await expect(page.getByRole("heading", { name: "WhatsApp handoff verified" })).toBeVisible();
  expect(saved).toBeTruthy();
  return saved!;
}
export async function confirmRequest(page: Page) {
  await page.getByLabel("Delivery charge (₹)", { exact: true }).fill("29");
  await page.getByLabel("Agreed delivery timing", { exact: true }).fill("5 PM to 7 PM");
  await page.getByRole("button", { name: "Confirm order and reserve stock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark packed & recalculate bill", exact: true }),
  ).toBeVisible();
}
