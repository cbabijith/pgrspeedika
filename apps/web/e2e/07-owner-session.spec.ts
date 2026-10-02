import { expect, test } from "@playwright/test";

const ADMIN = process.env.ADMIN_URL ?? "http://localhost:3001";

test("owner login, protected API and reload use the admin origin and retain the session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email", { exact: true }).fill(process.env.SEED_OWNER_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.SEED_OWNER_PASSWORD!);
  const signIn = page.waitForResponse(`${ADMIN}/api/auth/sign-in/email`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await signIn).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Today at a glance", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today at a glance", exact: true })).toBeVisible();

  const session = await page.request.get(`${ADMIN}/api/auth/get-session`);
  expect((await session.json()).user.role).toBe("owner");
  const products = await page.request.get(`${ADMIN}/api/admin/products`);
  expect(products.status()).toBe(200);
  expect((await products.json()).ok).toBe(true);
  const cookies = await page.context().cookies(ADMIN);
  const token = cookies.find((cookie) => cookie.name.endsWith("session_token"));
  expect(token?.httpOnly).toBe(true);
  expect(token?.sameSite).toBe("Lax");

  const nav = page.getByRole("navigation", { name: "Owner navigation" });
  await nav.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
  await nav.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Owner menu" })
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await page.waitForURL(`${ADMIN}/login`);
  expect(await page.request.get(`${ADMIN}/api/admin/products`).then((response) => response.status())).toBe(
    401,
  );
});
