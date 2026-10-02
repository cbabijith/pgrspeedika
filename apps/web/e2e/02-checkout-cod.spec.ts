import { expect, test } from "@playwright/test";
import { interceptWhatsApp, sendGuestRequest } from "./helpers/whatsapp";

test("guest submits a basket directly to the correct WhatsApp number without login", async ({ page }) => {
  await interceptWhatsApp(page);
  await page.goto("/products/matta-rice");
  await page.getByRole("button", { name: /5 kg/ }).first().click();
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "WhatsApp checkout", exact: true })).toBeVisible();
  await page.getByLabel("Your name", { exact: true }).fill("E2E Customer");
  await page.getByLabel("Mobile number", { exact: true }).fill("9800000001");
  await page.getByLabel("House / street", { exact: true }).fill("E2E House, Test Lane");
  await page.getByLabel("Pincode", { exact: true }).fill("686001");
  const order = await sendGuestRequest(page);
  expect(order.awaitingConfirmation).toBe(true);
  expect(decodeURIComponent(order.whatsappLink)).toContain("Matta Rice");
  expect(decodeURIComponent(order.whatsappLink)).toContain("To be confirmed by the shop");
  await page.goto(`/guest-orders/${order.orderId}?token=${order.guestToken}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(order.orderNumber);
  await expect(page.getByText("Awaiting confirmation", { exact: true }).first()).toBeVisible();
});
