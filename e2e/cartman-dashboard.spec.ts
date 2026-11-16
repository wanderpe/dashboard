import { expect, test, type Page } from "@playwright/test";

async function mockAuthenticatedSession(page: Page) {
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
}

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

test("chat empty state is input-first and starter prompts prefill without sending", async ({ page }) => {
  const browserErrors: string[] = [];
  const postRequests: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("request", (request) => {
    if (request.method() === "POST") postRequests.push(request.url());
  });

  await mockAuthenticatedSession(page);
  await page.goto("/chat");

  const heading = page.getByRole("heading", { name: "What are we working on?" });
  await expect(heading).toBeVisible();
  await expect(
    page.getByText(
      "Ask a question, untangle an error, or plan a project. Eric only sees what you share in this chat.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(["left", "start"]).toContain(
    await heading.evaluate((element) => getComputedStyle(element).textAlign),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  const prompts = [
    ["Explain a concept", "Explain a technical concept in plain language, with a simple example."],
    ["Interpret an error", "Help me understand an error message I paste. Explain what it means and suggest safe next checks."],
    ["Plan a project", "Help me plan a project. Ask about my goals, timeline, and constraints first."],
  ];
  const suggestionButtons = prompts.map(([label]) =>
    page.getByRole("button", { name: `Use prompt: ${label}` }),
  );
  await expect(page.getByRole("region", { name: "Suggested prompts" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Use prompt:/ })).toHaveCount(3);

  const buttonBoxes = await Promise.all(suggestionButtons.map((button) => button.boundingBox()));
  const buttonYPositions = buttonBoxes.map((box) => box?.y ?? 0);
  expect(buttonYPositions[1]).toBeGreaterThan(buttonYPositions[0]);
  expect(buttonYPositions[2]).toBeGreaterThan(buttonYPositions[1]);

  const composer = page.getByRole("textbox", { name: "Message Eric" });
  for (const [index, [, prompt]] of prompts.entries()) {
    await suggestionButtons[index].click();
    await expect(composer).toHaveValue(prompt);
    await expect(heading).toBeVisible();
  }
  expect(postRequests).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePromptContentFits = await Promise.all(
    suggestionButtons.map((button) =>
      button.evaluate((element) => {
        const prompt = element.lastElementChild;
        if (!(prompt instanceof HTMLElement)) return false;
        const buttonBounds = element.getBoundingClientRect();
        const promptBounds = prompt.getBoundingClientRect();
        return promptBounds.top >= buttonBounds.top && promptBounds.bottom <= buttonBounds.bottom;
      }),
    ),
  );
  expect(mobilePromptContentFits).toEqual([true, true, true]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  expect(browserErrors).toEqual([]);
});

test("chat starter hover lift respects reduced-motion preference", async ({ page }) => {
  await mockAuthenticatedSession(page);
  await page.goto("/chat");

  const suggestion = page.getByRole("button", { name: "Use prompt: Explain a concept" });
  const translate = () => suggestion.evaluate((element) => getComputedStyle(element).translate);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await suggestion.hover();
  await expect.poll(translate).not.toBe("none");

  await page.mouse.move(0, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const restingStyles = await suggestion.evaluate((element) => {
    const style = getComputedStyle(element);
    return { backgroundColor: style.backgroundColor, borderColor: style.borderColor };
  });

  await suggestion.hover();
  await expect.poll(translate).toBe("none");
  await expect
    .poll(() => suggestion.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(restingStyles.backgroundColor);
  await expect
    .poll(() => suggestion.evaluate((element) => getComputedStyle(element).borderColor))
    .not.toBe(restingStyles.borderColor);
});
