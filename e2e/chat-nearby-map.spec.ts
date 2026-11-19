import { expect, test, type Page } from "@playwright/test";

function sseFrame(data: unknown) {
  return `data: ${JSON.stringify(data)}`;
}

async function expectForegroundOsmAttribution(page: Page) {
  const attribution = page.getByRole("link", { name: "© OpenStreetMap contributors", exact: true });
  await expect(attribution).toBeVisible();
  await expect(attribution).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  await attribution.click({ trial: true });
  await expect.poll(() => attribution.evaluate((link) => {
    const bounds = link.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return hitTarget === link || link.contains(hitTarget);
  })).toBe(true);
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

test("renders nearby gyms and stores with adjustable categories and radius", async ({ page }) => {
  const browserErrors: string[] = [];
  const searches: Array<Record<string, unknown>> = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await mockAuthenticatedSession(page);

  const answer = [
    "Here are the nearby places you asked for.",
    "```cartman-widget",
    JSON.stringify({
      type: "nearby-map",
      center: "Mandaue City Hall, Cebu",
      categories: ["gym", "store"],
      radiusMeters: 500,
    }),
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
  await page.route("**/api/map-nearby", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    searches.push(request);
    const categories = request.categories as string[];
    const allPlaces = [
      { id: "node/101", name: "Iron Gym", lat: 10.324, lon: 123.921, categories: ["gym"], straightLineDistanceMeters: 157, address: null },
      { id: "way/202", name: "Town Market", lat: 10.325, lon: 123.923, categories: ["store"], straightLineDistanceMeters: 245, address: "Market Road" },
      { id: "node/303", name: "Blue Cup Cafe", lat: 10.326, lon: 123.924, categories: ["cafe"], straightLineDistanceMeters: 370, address: null },
    ];
    await route.fulfill({
      json: {
        center: { label: "Mandaue City Hall, Mandaue, Cebu, Philippines", lat: 10.323, lon: 123.922, source: "nominatim", resolutionState: "RESOLVED", userConfirmed: false },
        radiusMeters: request.radiusMeters,
        categories,
        places: allPlaces.filter((place) => place.categories.some((category) => categories.includes(category))).map((place) => ({ ...place, source: "photon", resolutionState: "RESOLVED", userConfirmed: false })),
        truncated: false,
      },
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Find nearby gyms and stores around Mandaue City Hall.");
  await page.getByRole("button", { name: "Send" }).click();

  const nearbyCard = page.getByRole("region", { name: "Nearby places", exact: true });
  await expect(nearbyCard).toBeVisible();
  await expect(nearbyCard.getByText("Nearby search · Photon + OpenStreetMap", { exact: true })).toBeVisible();
  const nearbyMap = page.getByRole("region", { name: /Map showing nearby places/ });
  await expect(nearbyMap).toBeVisible();
  await expect(nearbyMap.getByRole("button", { name: "Show Iron Gym on map" })).toBeVisible();
  await expect(nearbyMap.getByRole("button", { name: "Show Town Market on map" })).toBeVisible();
  await expect(nearbyMap.getByRole("button", { name: "Show Blue Cup Cafe on map" })).toHaveCount(0);
  await expect(nearbyCard.getByText("Iron Gym", { exact: true })).toBeVisible();
  await expect(nearbyCard.getByText("Town Market", { exact: true })).toBeVisible();
  await expect(nearbyCard.getByText("Straight-line · 157 m", { exact: true })).toBeVisible();
  await nearbyCard.getByRole("list").getByRole("button", { name: "Show Iron Gym on map" }).click();
  await expect(page.getByRole("region", { name: /Map showing nearby places.*focused on Iron Gym/ })).toBeVisible();
  await expect.poll(() => searches.length).toBe(1);
  expect(searches[0]).toMatchObject({ center: "Mandaue City Hall, Cebu", categories: ["gym", "store"], radiusMeters: 500 });

  await nearbyCard.getByRole("checkbox", { name: "Cafes" }).check();
  await expect(nearbyCard.getByText("Blue Cup Cafe", { exact: true })).toBeVisible();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1].categories).toEqual(["gym", "store", "cafe"]);

  await nearbyCard.getByLabel("Search radius").selectOption("3000");
  await expect.poll(() => searches.length).toBe(3);
  expect(searches[2].radiusMeters).toBe(3000);
  await expect(nearbyCard.getByText("3 km radius", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  expect(browserErrors).toEqual([]);
});

test("keeps nearby results available when OpenStreetMap tiles fail", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockAuthenticatedSession(page);
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 503, contentType: "text/plain", body: "Tile service unavailable" }),
  );
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: [
        sseFrame({ choices: [{ delta: { content: ["Nearby results:", "```cartman-widget", JSON.stringify({ type: "nearby-map", center: "Mandaue City Hall, Cebu", categories: ["gym"], radiusMeters: 500 }), "```"].join("\n") }, finish_reason: null }] }),
        sseFrame({ choices: [{ delta: {}, finish_reason: "stop" }] }),
        "data: [DONE]",
        "",
      ].join("\n\n"),
    }),
  );
  await page.route("**/api/map-nearby", (route) =>
    route.fulfill({
      json: {
        center: { label: "Mandaue City Hall, Mandaue, Cebu, Philippines", lat: 10.323, lon: 123.922, source: "nominatim", resolutionState: "RESOLVED", userConfirmed: false },
        radiusMeters: 500,
        categories: ["gym"],
        places: [{ id: "node/101", name: "Iron Gym", lat: 10.324, lon: 123.921, categories: ["gym"], straightLineDistanceMeters: 157, address: null, source: "photon", resolutionState: "RESOLVED", userConfirmed: false }],
        truncated: false,
      },
    }),
  );

  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Find a gym near Mandaue City Hall.");
  await page.getByRole("button", { name: "Send" }).click();

  const nearbyCard = page.getByRole("region", { name: "Nearby places", exact: true });
  await expect(nearbyCard.getByText("Iron Gym", { exact: true })).toBeVisible();
  await expect(nearbyCard.getByText("Map tiles are unavailable; place results are still shown.", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("does not show stale nearby results while changed criteria are loading or after failure", async ({ page }) => {
  await mockAuthenticatedSession(page);
  const answer = [
    "Here are gyms near Mandaue City Hall.",
    "```cartman-widget",
    JSON.stringify({ type: "nearby-map", center: "Mandaue City Hall, Cebu", categories: ["gym"], radiusMeters: 1_500 }),
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

  let requestCount = 0;
  let releaseSecondResponse!: () => void;
  let signalSecondRequest!: () => void;
  const secondResponseGate = new Promise<void>((resolve) => { releaseSecondResponse = resolve; });
  const secondRequestStarted = new Promise<void>((resolve) => { signalSecondRequest = resolve; });
  await page.route("**/api/map-nearby", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        json: {
          center: { label: "Mandaue City Hall, Cebu", lat: 10.323, lon: 123.922, source: "nominatim", resolutionState: "RESOLVED", userConfirmed: false },
          radiusMeters: 1_500,
          categories: ["gym"],
          places: [{ id: "node/101", name: "Iron Gym", lat: 10.324, lon: 123.923, categories: ["gym"], straightLineDistanceMeters: 157, address: null, source: "photon", resolutionState: "RESOLVED", userConfirmed: false }],
          truncated: false,
        },
      });
      return;
    }
    signalSecondRequest();
    await secondResponseGate;
    await route.fulfill({ status: 502, json: { error: { code: "provider_unavailable", message: "Nearby search is unavailable." } } });
  });

  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Find gyms near Mandaue City Hall.");
  await page.getByRole("button", { name: "Send" }).click();
  const nearbyCard = page.getByRole("region", { name: "Nearby places", exact: true });
  await expect(nearbyCard.getByText("Iron Gym", { exact: true })).toBeVisible();

  await nearbyCard.getByLabel("Search radius").selectOption("3000");
  await secondRequestStarted;
  await expect(nearbyCard.getByText("Iron Gym", { exact: true })).toBeHidden();
  await expect(page.getByRole("region", { name: /Map showing nearby places/ })).toHaveCount(0);
  const ariaHiddenMap = page.locator('[role="region"][aria-label^="Map showing nearby places"][aria-hidden="true"]');
  await expect(ariaHiddenMap).toHaveCount(1);
  await expect(ariaHiddenMap.locator('button[aria-label="Zoom in"]')).toHaveCount(0);
  await expect(ariaHiddenMap.locator('button[aria-label="Zoom out"]')).toHaveCount(0);
  const ariaHiddenCanvas = ariaHiddenMap.locator("canvas.maplibregl-canvas");
  const visibleOsmAttribution = ariaHiddenMap.locator('.maplibregl-ctrl-attrib a[href*="openstreetmap.org/copyright"]');
  await expect(ariaHiddenCanvas).toBeVisible();
  await ariaHiddenCanvas.focus();
  await expect(ariaHiddenCanvas).not.toBeFocused();
  await expect(visibleOsmAttribution).toBeVisible();
  await expectForegroundOsmAttribution(page);

  releaseSecondResponse();
  await expect(nearbyCard.getByText("Nearby search is unavailable.", { exact: true })).toBeVisible();
  const errorOverlay = nearbyCard.getByText("Couldn’t load nearby places", { exact: true }).locator("xpath=../..");
  const errorOverlayAlpha = await errorOverlay.evaluate((element) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context is unavailable");
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data[3] / 255;
  });
  expect(errorOverlayAlpha).toBe(1);
  await expect(nearbyCard.getByText("Iron Gym", { exact: true })).toHaveCount(0);
  await expect(ariaHiddenMap).toHaveCount(1);
  await expect(ariaHiddenMap.locator('button[aria-label="Zoom in"]')).toHaveCount(0);
  await expect(ariaHiddenMap.locator('button[aria-label="Zoom out"]')).toHaveCount(0);
  await ariaHiddenCanvas.focus();
  await expect(ariaHiddenCanvas).not.toBeFocused();
  await expect(visibleOsmAttribution).toBeVisible();
  await expectForegroundOsmAttribution(page);
});

test("compares and displays every nearby route ranked by road distance", async ({ page }) => {
  const comparisonRequests: Array<Record<string, unknown>> = [];
  await mockAuthenticatedSession(page);
  const answer = [
    "I’ll compare each discovered gym from Mandaue City Hall.",
    "```cartman-widget",
    JSON.stringify({
      type: "nearby-map",
      center: "Mandaue City Hall, Cebu",
      categories: ["gym"],
      radiusMeters: 1_500,
      routeOrigin: "Mandaue City Hall, Cebu",
      routeMode: "driving",
    }),
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
  await page.route("**/api/map-nearby", (route) =>
    route.fulfill({
      json: {
        center: { label: "Mandaue City Hall, Cebu", lat: 10.323, lon: 123.922, source: "nominatim", resolutionState: "RESOLVED", userConfirmed: false },
        radiusMeters: 1_500,
        categories: ["gym"],
        truncated: false,
        places: [
          { id: "node/101", name: "Closest Gym", lat: 10.324, lon: 123.923, categories: ["gym"], straightLineDistanceMeters: 157, address: null, source: "photon", resolutionState: "RESOLVED", userConfirmed: false },
          { id: "node/202", name: "Nearest Road Gym", lat: 10.325, lon: 123.924, categories: ["gym"], straightLineDistanceMeters: 314, address: null, source: "photon", resolutionState: "RESOLVED", userConfirmed: false },
          { id: "node/303", name: "Unroutable Gym", lat: 10.326, lon: 123.925, categories: ["gym"], straightLineDistanceMeters: 471, address: null, source: "photon", resolutionState: "RESOLVED", userConfirmed: false },
        ],
      },
    }),
  );
  await page.route("**/api/map-route/compare", async (route) => {
    comparisonRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      json: {
        origin: { label: "Mandaue City Hall, Cebu", lat: 10.323, lon: 123.922, source: "nominatim", resolutionState: "RESOLVED", userConfirmed: false },
        center: { label: "Mandaue City Hall, Cebu", lat: 10.323, lon: 123.922, source: "nominatim", resolutionState: "RESOLVED", userConfirmed: false },
        categories: ["gym"],
        radiusMeters: 1_500,
        mode: "driving",
        candidateCount: 3,
        truncated: false,
        routes: [
          { id: "node/202", name: "Nearest Road Gym", address: null, categories: ["gym"], lat: 10.325, lon: 123.924, straightLineDistanceMeters: 314, roadDistanceMeters: 2_000, estimatedTravelTimeSeconds: 500, geometry: [[10.323, 123.922], [10.325, 123.924]], resolutionState: "ROUTE_VALIDATED", routeState: "ROUTE_VALIDATED", rank: 1, failureReason: null },
          { id: "node/101", name: "Closest Gym", address: null, categories: ["gym"], lat: 10.324, lon: 123.923, straightLineDistanceMeters: 157, roadDistanceMeters: 4_500, estimatedTravelTimeSeconds: 900, geometry: [[10.323, 123.922], [10.324, 123.923]], resolutionState: "ROUTE_VALIDATED", routeState: "ROUTE_VALIDATED", rank: 2, failureReason: null },
          { id: "node/303", name: "Unroutable Gym", address: null, categories: ["gym"], lat: 10.326, lon: 123.925, straightLineDistanceMeters: 471, roadDistanceMeters: null, estimatedTravelTimeSeconds: null, geometry: null, resolutionState: "RESOLVED", routeState: "FAILED", rank: null, failureReason: "No road route found." },
        ],
      },
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Find gyms and show all routes from Mandaue City Hall.");
  await page.getByRole("button", { name: "Send" }).click();

  const nearbyCard = page.getByRole("region", { name: "Nearby places", exact: true });
  await expect(nearbyCard).toBeVisible();
  const routeChoices = nearbyCard.getByRole("group", { name: "Routes from Mandaue City Hall, Cebu" });
  await expect(routeChoices.getByRole("button", { name: /Nearest Road Gym/ })).toBeVisible();
  await expect(routeChoices.getByRole("button", { name: /Closest Gym/ })).toBeVisible();
  await expect(routeChoices.getByText(/Straight-line · 314 m.*Road · 2 km/)).toBeVisible();
  await expect(routeChoices.getByText(/Straight-line · 157 m.*Road · 4.5 km/)).toBeVisible();
  await expect(routeChoices.getByText(/Unroutable Gym.*Route unavailable/i)).toBeVisible();
  await expect(routeChoices.getByRole("button", { name: /Nearest Road Gym/ })).toHaveAttribute("aria-pressed", "true");
  await routeChoices.getByRole("button", { name: /Closest Gym/ }).click();
  await expect(routeChoices.getByRole("button", { name: /Closest Gym/ })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => comparisonRequests.length).toBe(1);
  expect(comparisonRequests[0]).toMatchObject({
    origin: "Mandaue City Hall, Cebu",
    center: "Mandaue City Hall, Cebu",
    categories: ["gym"],
    radiusMeters: 1_500,
    mode: "driving",
  });
});

test("preserves verified nearby search context across reloads and follow-ups", async ({ page }) => {
  const chatRequests: Array<Record<string, unknown>> = [];
  await mockAuthenticatedSession(page);
  const nearbyAnswer = [
    "I found a gym near your selected center.",
    "```cartman-widget",
    JSON.stringify({ type: "nearby-map", center: "Mandaue City Hall, Cebu", categories: ["gym"], radiusMeters: 1_500 }),
    "```",
  ].join("\n");

  await page.route("**/api/chat", async (route) => {
    chatRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    const answer = chatRequests.length === 1 ? nearbyAnswer : "I’ll reuse the previous nearby search context.";
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: [
        sseFrame({ choices: [{ delta: { content: answer }, finish_reason: null }] }),
        sseFrame({ choices: [{ delta: {}, finish_reason: "stop" }] }),
        "data: [DONE]",
        "",
      ].join("\n\n"),
    });
  });
  await page.route("**/api/map-nearby", (route) =>
    route.fulfill({
      json: {
        center: { label: "Mandaue City Hall, Cebu", lat: 10.323, lon: 123.922, source: "nominatim", resolutionState: "RESOLVED", userConfirmed: false },
        radiusMeters: 1_500,
        categories: ["gym"],
        places: [
          { id: "node/101", name: "Iron Gym", lat: 10.324, lon: 123.923, categories: ["gym"], straightLineDistanceMeters: 157, address: null, source: "photon", resolutionState: "RESOLVED", userConfirmed: false },
        ],
        truncated: false,
      },
    }),
  );

  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Find gyms near Mandaue City Hall.");
  await page.getByRole("button", { name: "Send" }).click();
  const nearbyCard = page.getByRole("region", { name: "Nearby places", exact: true });
  await expect(nearbyCard.getByText("Iron Gym", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const raw = sessionStorage.getItem("harvy-hermes-location-context");
    return raw ? JSON.parse(raw)?.nearby?.candidateNames?.[0] : null;
  })).toBe("Iron Gym");

  await page.reload();
  await expect(page.getByRole("region", { name: "Nearby places", exact: true }).getByText("Iron Gym", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Show me all routes.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("I’ll reuse the previous nearby search context.")).toBeVisible();
  await expect.poll(() => chatRequests.length).toBe(2);
  expect(chatRequests[1].locationContext).toMatchObject({
    nearby: {
      center: "Mandaue City Hall, Cebu",
      categories: ["gym"],
      radiusMeters: 1_500,
      candidateNames: ["Iron Gym"],
    },
  });
  expect(JSON.stringify(chatRequests[1].locationContext)).not.toMatch(/userConfirmed|coordinates|straightLineDistanceMeters/i);
});
