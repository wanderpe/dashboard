import { expect, test, type Page } from "@playwright/test";

function sseFrame(data: unknown) {
  return `data: ${JSON.stringify(data)}`;
}

async function mockAuthenticatedSession(page: Page) {
  await page.route("**/api/account-auth/session**", (route) =>
    route.fulfill({
      json: {
        user: { name: "Playwright Tester", email: "tester@example.test", image: null },
        expires: "2099-01-01T00:00:00.000Z",
      },
    }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        chatMode: "live",
        profile: { displayName: "Playwright Tester", username: "playwright-tester" },
      },
    }),
  );
}

test("renders an interactive, responsive route map from Cartman's validated widget block", async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  const routeRequests: Array<Record<string, unknown>> = [];
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await mockAuthenticatedSession(page);

  const answer = [
    "Here's the route. I expect credit for this, obviously.",
    "```cartman-widget",
    JSON.stringify({ type: "route-map", origin: "Seattle, WA", destination: "Portland, OR", mode: "driving" }),
    "```",
  ].join("\n");
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: [
        sseFrame({ choices: [{ delta: { content: answer }, finish_reason: null }] }),
        sseFrame({ choices: [{ delta: {}, finish_reason: "stop" }] }),
        "data: [DONE]",
        "",
      ].join("\n\n"),
    }),
  );
  await page.route("**/api/map-route", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    routeRequests.push(request);
    await route.fulfill({
      json: {
        origin: {
          label: request.mode === "cycling"
            ? 'Seattle <img data-xss="yes">'
            : "Seattle, Washington, United States",
          lat: 47.6062,
          lon: -122.3321,
        },
        destination: { label: "Portland, Oregon, United States", lat: 45.5152, lon: -122.6784 },
        mode: request.mode,
        distanceMeters: 280_000,
        durationSeconds: 10_000,
        geometry: [[47.6062, -122.3321], [46.5, -122.45], [45.5152, -122.6784]],
        steps: [{ instruction: "Start on I-5", distanceMeters: 5_000 }],
      },
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  const composer = page.getByRole("textbox", { name: "Message Eric" });
  await composer.fill("Show me the route from Seattle to Portland.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("region", { name: /Interactive route map/ })).toBeVisible();
  await expect(page.getByText("280 km", { exact: true })).toBeVisible();
  await expect(page.getByText(/Route lookup sends these locations to OpenStreetMap and OSRM/)).toBeVisible();
  const mobileCard = page.getByRole("region", { name: "Route planner" });
  const mobileCardBounds = await mobileCard.boundingBox();
  expect(mobileCardBounds).not.toBeNull();
  expect(mobileCardBounds!.x).toBeGreaterThanOrEqual(12);
  expect(mobileCardBounds!.x + mobileCardBounds!.width).toBeLessThanOrEqual(378);
  const modeGroup = page.getByRole("group", { name: "Travel mode" });
  const modeGroupBounds = await modeGroup.boundingBox();
  expect(modeGroupBounds).not.toBeNull();
  expect(modeGroupBounds!.x).toBeGreaterThanOrEqual(mobileCardBounds!.x + 8);
  expect(modeGroupBounds!.x + modeGroupBounds!.width).toBeLessThanOrEqual(
    mobileCardBounds!.x + mobileCardBounds!.width - 8,
  );
  let previousButtonRight: number | null = null;
  for (const button of await modeGroup.getByRole("button").all()) {
    const buttonBounds = await button.boundingBox();
    expect(buttonBounds?.height).toBeGreaterThanOrEqual(44);
    expect(buttonBounds?.width).toBeGreaterThanOrEqual(44);
    expect(buttonBounds!.x).toBeGreaterThanOrEqual(mobileCardBounds!.x + 8);
    expect(buttonBounds!.x + buttonBounds!.width).toBeLessThanOrEqual(
      mobileCardBounds!.x + mobileCardBounds!.width - 8,
    );
    if (buttonBounds && previousButtonRight !== null) {
      expect(buttonBounds.x - previousButtonRight).toBeGreaterThanOrEqual(8);
    }
    if (buttonBounds) previousButtonRight = buttonBounds.x + buttonBounds.width;
  }
  await expect(page.getByText("Seattle, Washington, United States", { exact: true })).toBeVisible();
  await expect(page.getByText("Portland, Oregon, United States", { exact: true })).toBeVisible();
  await expect.poll(() => routeRequests.length).toBe(1);
  expect(routeRequests[0]).toMatchObject({ origin: "Seattle, WA", destination: "Portland, OR", mode: "driving" });

  await page.screenshot({ path: testInfo.outputPath("route-map-mobile-verified.png"), fullPage: true });
  await page.setViewportSize({ width: 1365, height: 900 });
  await expect.poll(() => page.getByRole("region", { name: /Interactive route map/ }).evaluate((element) => element.clientWidth)).toBeGreaterThan(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("route-map-desktop-verified.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });

  const cyclingButton = page.getByRole("button", { name: "Cycling" });
  await cyclingButton.click();
  await expect.poll(() => routeRequests.length).toBe(2);
  expect(routeRequests[1]).toMatchObject({ origin: "Seattle, WA", destination: "Portland, OR", mode: "cycling" });
  await expect(cyclingButton).toHaveAttribute("aria-pressed", "true");
  expect(await mobileCard.evaluate((element) => element.scrollLeft)).toBe(0);
  const mobileCardAfterMode = await mobileCard.boundingBox();
  const mobileHeaderAfterMode = await mobileCard.locator("header").boundingBox();
  expect(mobileHeaderAfterMode?.x).toBeGreaterThanOrEqual(mobileCardAfterMode!.x);
  expect(mobileHeaderAfterMode!.x + mobileHeaderAfterMode!.width).toBeLessThanOrEqual(
    mobileCardAfterMode!.x + mobileCardAfterMode!.width,
  );
  await expect(page.getByText("280 km", { exact: true })).toBeVisible();
  const markers = page.locator(".leaflet-marker-icon");
  await expect(markers).toHaveCount(2);
  await markers.first().hover();
  await expect(page.locator(".leaflet-tooltip")).toBeVisible();
  await expect(page.locator(".leaflet-tooltip img[data-xss='yes']")).toHaveCount(0);
  await expect(page.getByText("Here's the route.", { exact: false })).toBeVisible();
  await expect(page.getByText("cartman-widget")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  const copyButton = page.getByRole("button", { name: "Copy answer" });
  if (await copyButton.isVisible()) {
    await copyButton.click();
    await expect(page.getByRole("button", { name: "Answer copied" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
      "Here's the route. I expect credit for this, obviously.\n",
    );
  }
  expect(browserErrors).toEqual([]);
});
