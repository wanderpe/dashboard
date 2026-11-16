import { expect, test } from "@playwright/test";

test("Eric AI workspace opens a selected starter prompt in chat", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.route("**/api/account-auth/session**", (route) =>
    route.fulfill({
      json: {
        user: {
          name: "Playwright Tester",
          email: "tester@example.test",
          image: null,
        },
        expires: "2099-01-01T00:00:00.000Z",
      },
    }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        chatMode: "live",
        profile: {
          displayName: "Playwright Tester",
          username: "playwright-tester",
        },
      },
    }),
  );

  await page.goto("/");
  await expect(page).toHaveTitle(/Eric AI/);
  await expect(page.locator('meta[name="description"]')).toHaveCount(0);
  await expect(page.getByRole("main").getByText("Eric AI", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What do you need help with?" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Eric only knows what you share here; it can’t access your files or other accounts.")).toBeVisible();
  await expect(page.locator('img[src*="eric-cartman"]').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("link", { name: "Chat", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  await page.getByRole("link", { name: /Explain a concept/ }).click();
  await expect(page).toHaveURL(/\/chat\?q=/);
  await expect(page.getByRole("textbox", { name: "Message Eric" })).toHaveValue(
    "Explain a technical concept in plain language, with a simple example.",
  );
  expect(browserErrors).toEqual([]);
});
