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

function coordinateAtMapPosition(
  center: { lat: number; lon: number },
  zoom: number,
  size: { width: number; height: number },
  position: { x: number; y: number },
) {
  const worldSize = 256 * 2 ** zoom;
  const centerX = ((center.lon + 180) / 360) * worldSize;
  const latitudeRadians = (center.lat * Math.PI) / 180;
  const centerY = ((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2) * worldSize;
  const pointX = centerX + position.x - size.width / 2;
  const pointY = centerY + position.y - size.height / 2;
  const longitude = (pointX / worldSize) * 360 - 180;
  const latitude = (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * pointY) / worldSize)) * 180) / Math.PI;
  return { lat: latitude, lon: longitude };
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
  await expect(page.getByText(/Place lookup sends text to OpenStreetMap.*coordinates to OSRM/i)).toBeVisible();
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

test("lets users confirm unmapped endpoints with coordinate fields and map pins before routing", async ({ page }, testInfo) => {
  const routeRequests: Array<Record<string, unknown>> = [];
  await mockAuthenticatedSession(page);
  const answer = [
    "I couldn't place both endpoints exactly, so confirm them on the map.",
    "```cartman-widget",
    JSON.stringify({
      type: "route-map",
      origin: "Sacris Road 293, Bakilid, Mandaue City",
      destination: "Clinica Prime Oakridge, A.S. Fortuna St., Mandaue City",
      mode: "driving",
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
  await page.route("**/api/map-route", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    routeRequests.push(request);
    if (routeRequests.length === 1) {
      await route.fulfill({
        status: 422,
        json: {
          error: {
            code: "place_not_found",
            message: "OpenStreetMap couldn't locate the start point and destination.",
            details: {
              unresolvedEndpoints: ["origin", "destination"],
              resolvedEndpoints: {},
              mapCenter: { label: "Mandaue City, Cebu, Philippines", lat: 10.335, lon: 123.94, zoom: 12 },
            },
          },
        },
      });
      return;
    }

    const coordinates = request.confirmedCoordinates as {
      origin: { lat: number; lon: number };
      destination: { lat: number; lon: number };
    };
    await route.fulfill({
      json: {
        origin: {
          label: `User-confirmed pin for ${request.origin}`,
          lat: coordinates.origin.lat,
          lon: coordinates.origin.lon,
          source: "map_pin",
        },
        destination: {
          label: `User-confirmed pin for ${request.destination}`,
          lat: coordinates.destination.lat,
          lon: coordinates.destination.lon,
          source: "map_pin",
        },
        mode: request.mode,
        distanceMeters: 2_300,
        durationSeconds: 420,
        geometry: [
          [coordinates.origin.lat, coordinates.origin.lon],
          [coordinates.destination.lat, coordinates.destination.lon],
        ],
        steps: [],
      },
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Route these two Cebu locations");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Confirm locations on the map", { exact: true })).toBeVisible();
  const pickerMap = page.getByRole("region", { name: "Pin selector map" });
  await expect(pickerMap).toBeVisible();
  await expect(page.getByText("Tap or click the map to place the start pin. Or enter coordinates above, then confirm before routing.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Mandaue City.*center itself is not assumed to be a route stop/i)).toBeVisible();
  await expect.poll(() => routeRequests.length).toBe(1);
  expect(routeRequests[0].confirmedCoordinates).toBeUndefined();
  const calculateButton = page.getByRole("button", { name: "Calculate route with confirmed pins" });
  await expect(calculateButton).toBeDisabled();
  const pinCard = page.getByRole("region", { name: "Route planner" });
  const pinCardBounds = await pinCard.boundingBox();
  expect(pinCardBounds).not.toBeNull();
  const pinControls = [
    ...(await page.getByRole("group", { name: "Route locations that need pins" }).getByRole("button").all()),
    ...(await page.getByRole("spinbutton").all()),
    page.getByRole("button", { name: "Confirm start pin" }),
    page.getByRole("button", { name: "Calculate route with confirmed pins" }),
  ];
  for (const control of pinControls) {
    const bounds = await control.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.x).toBeGreaterThanOrEqual(pinCardBounds!.x + 8);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(pinCardBounds!.x + pinCardBounds!.width - 8);
  }
  await page.getByRole("region", { name: "Route planner" }).screenshot({ path: testInfo.outputPath("route-map-pin-confirmation.png") });

  await page.getByRole("spinbutton", { name: "Start point latitude" }).fill("10.321");
  await page.getByRole("spinbutton", { name: "Start point longitude" }).fill("123.941");
  await page.getByRole("button", { name: "Confirm start pin" }).click();
  await expect(page.getByRole("spinbutton", { name: "Destination latitude" })).toBeVisible();
  await expect(calculateButton).toBeDisabled();
  await expect.poll(async () => {
    const mapBounds = await pickerMap.boundingBox();
    const startPinBounds = await pickerMap.locator('[title="Start pin · confirmed"]').boundingBox();
    if (!mapBounds || !startPinBounds) return false;
    const mapCenterX = mapBounds.x + mapBounds.width / 2;
    const mapCenterY = mapBounds.y + mapBounds.height / 2;
    const pinCenterX = startPinBounds.x + startPinBounds.width / 2;
    const pinCenterY = startPinBounds.y + startPinBounds.height / 2;
    return Math.abs(pinCenterX - mapCenterX) < 2 && Math.abs(pinCenterY - mapCenterY) < 2;
  }).toBe(true);
  const mapSize = await pickerMap.boundingBox();
  expect(mapSize).not.toBeNull();
  const expectedDestinationPoint = coordinateAtMapPosition(
    { lat: 10.321, lon: 123.941 },
    12,
    { width: mapSize!.width, height: mapSize!.height },
    { x: 130, y: 100 },
  );
  await pickerMap.click({ position: { x: 130, y: 100 } });
  await expect(calculateButton).toBeDisabled();
  await page.getByRole("button", { name: "Confirm destination pin" }).click();
  await expect(pickerMap.locator('[title="Destination pin · confirmed"]')).toHaveCount(1);
  await expect(pickerMap.locator('[title="Unconfirmed destination pin"]')).toHaveCount(0);

  await expect(calculateButton).toBeEnabled();
  await expect.poll(() => routeRequests.length).toBe(1);
  await calculateButton.click();
  await expect.poll(() => routeRequests.length).toBe(2);
  await expect(page.getByText("2.3 km", { exact: true })).toBeVisible();
  expect(routeRequests[1]).toMatchObject({
    confirmedCoordinates: { origin: { lat: 10.321, lon: 123.941 } },
  });
  const destinationPoint = (routeRequests[1].confirmedCoordinates as Record<string, { lat: number; lon: number }>).destination;
  expect(Math.abs(destinationPoint.lat - expectedDestinationPoint.lat)).toBeLessThan(0.001);
  expect(Math.abs(destinationPoint.lon - expectedDestinationPoint.lon)).toBeLessThan(0.001);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("retries a pin-backed route when the travel mode changes in flight", async ({ page }) => {
  const routeRequests: Array<Record<string, unknown>> = [];
  const drivingResponseGate: { release?: () => void; completed?: Promise<void>; delivered?: boolean } = {};
  await mockAuthenticatedSession(page);
  const answer = [
    "Confirm these points before I route them.",
    "```cartman-widget",
    JSON.stringify({
      type: "route-map",
      origin: "Pin route race start",
      destination: "Pin route race destination",
      mode: "driving",
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
  await page.route("**/api/map-route", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    routeRequests.push(request);
    if (routeRequests.length === 1) {
      await route.fulfill({
        status: 422,
        json: {
          error: {
            code: "place_not_found",
            message: "Confirm both route points.",
            details: {
              unresolvedEndpoints: ["origin", "destination"],
              resolvedEndpoints: {},
              mapCenter: { label: "Mandaue City, Cebu, Philippines", lat: 10.335, lon: 123.94, zoom: 12 },
            },
          },
        },
      });
      return;
    }

    const fulfill = async () => {
      const coordinates = request.confirmedCoordinates as {
        origin: { lat: number; lon: number };
        destination: { lat: number; lon: number };
      };
      await route.fulfill({
        json: {
          origin: {
            label: `User-confirmed pin for ${request.origin}`,
            ...coordinates.origin,
            source: "map_pin",
          },
          destination: {
            label: `User-confirmed pin for ${request.destination}`,
            ...coordinates.destination,
            source: "map_pin",
          },
          mode: request.mode,
          distanceMeters: 2_300,
          durationSeconds: request.mode === "cycling" ? 480 : 420,
          geometry: [
            [coordinates.origin.lat, coordinates.origin.lon],
            [coordinates.destination.lat, coordinates.destination.lon],
          ],
          steps: [],
        },
      });
    };

    if (request.mode === "driving") {
      let markCompleted = () => {};
      drivingResponseGate.completed = new Promise<void>((resolve) => {
        markCompleted = resolve;
      });
      await new Promise<void>((resolve) => {
        drivingResponseGate.release = resolve;
      });
      try {
        await fulfill();
        drivingResponseGate.delivered = true;
      } catch {
        // The driving request is expected to be aborted when cycling replaces it.
      } finally {
        markCompleted();
      }
      return;
    }
    await fulfill();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Route two coordinates");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Confirm locations on the map", { exact: true })).toBeVisible();

  await page.getByRole("spinbutton", { name: "Start point latitude" }).fill("10.321");
  await page.getByRole("spinbutton", { name: "Start point longitude" }).fill("123.941");
  await page.getByRole("button", { name: "Confirm start pin" }).click();
  await page.getByRole("spinbutton", { name: "Destination latitude" }).fill("10.322");
  await page.getByRole("spinbutton", { name: "Destination longitude" }).fill("123.942");
  await page.getByRole("button", { name: "Confirm destination pin" }).click();
  const pinMap = page.getByRole("region", { name: "Pin selector map" });
  await expect(pinMap).toHaveClass(/leaflet-container/);
  await page.evaluate(() => {
    AbortController.prototype.abort = () => {};
    const testWindow = window as Window & { __lateDrivingResponseProcessed?: boolean };
    testWindow.__lateDrivingResponseProcessed = false;
    const originalJson = Response.prototype.json;
    Response.prototype.json = async function () {
      const payload = await originalJson.call(this);
      const body = typeof payload === "object" && payload !== null
        ? payload as { mode?: unknown }
        : null;
      if (this.url.includes("/api/map-route") && this.status === 200 && body?.mode === "driving") {
        window.setTimeout(() => {
          testWindow.__lateDrivingResponseProcessed = true;
        }, 0);
      }
      return payload;
    };
  });

  await page.getByRole("button", { name: "Calculate route with confirmed pins" }).click();
  await expect.poll(() => routeRequests.length).toBe(2);
  const destinationLatitude = page.getByRole("spinbutton", { name: "Destination latitude" });
  await expect(destinationLatitude).toHaveValue("10.322");
  await pinMap.click({ position: { x: 140, y: 150 } });
  await expect(destinationLatitude).toHaveValue("10.322");
  try {
    await page.getByRole("button", { name: "Cycling" }).click();
    await expect.poll(() => routeRequests.length).toBe(3);
    expect(routeRequests[2]).toMatchObject({
      mode: "cycling",
      confirmedCoordinates: {
        origin: { lat: 10.321, lon: 123.941 },
        destination: { lat: 10.322, lon: 123.942 },
      },
    });
    await expect(page.getByRole("button", { name: "Cycling" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("8 min", { exact: true })).toBeVisible();
  } finally {
    drivingResponseGate.release?.();
  }
  await drivingResponseGate.completed;
  expect(drivingResponseGate.delivered).toBe(true);
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __lateDrivingResponseProcessed?: boolean }).__lateDrivingResponseProcessed,
  )).toBe(true);
  await expect(page.getByText("8 min", { exact: true })).toBeVisible();
  await expect(page.getByText("7 min", { exact: true })).toHaveCount(0);
});

test("does not retry stale pins after a failed route when pins change before Calculate", async ({ page }) => {
  const routeRequests: Array<Record<string, unknown>> = [];
  await mockAuthenticatedSession(page);
  const answer = [
    "Confirm these route points.",
    "```cartman-widget",
    JSON.stringify({
      type: "route-map",
      origin: "Pin retry start",
      destination: "Pin retry destination",
      mode: "driving",
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
  await page.route("**/api/map-route", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    routeRequests.push(request);
    if (routeRequests.length === 1) {
      await route.fulfill({
        status: 422,
        json: {
          error: {
            code: "place_not_found",
            message: "Confirm both route points.",
            details: {
              unresolvedEndpoints: ["origin", "destination"],
              resolvedEndpoints: {},
              mapCenter: { label: "Mandaue City, Cebu, Philippines", lat: 10.335, lon: 123.94, zoom: 12 },
            },
          },
        },
      });
      return;
    }
    if (routeRequests.length === 2) {
      await route.fulfill({ status: 503, json: { error: { message: "OSRM temporarily unavailable." } } });
      return;
    }

    const coordinates = request.confirmedCoordinates as {
      origin: { lat: number; lon: number };
      destination: { lat: number; lon: number };
    };
    await route.fulfill({
      json: {
        origin: { label: "Confirmed start", ...coordinates.origin, source: "map_pin" },
        destination: { label: "Confirmed destination", ...coordinates.destination, source: "map_pin" },
        mode: request.mode,
        distanceMeters: 2_300,
        durationSeconds: 420,
        geometry: [[coordinates.origin.lat, coordinates.origin.lon], [coordinates.destination.lat, coordinates.destination.lon]],
        steps: [],
      },
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Route these two points");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Confirm locations on the map", { exact: true })).toBeVisible();

  await page.getByRole("spinbutton", { name: "Start point latitude" }).fill("10.321");
  await page.getByRole("spinbutton", { name: "Start point longitude" }).fill("123.941");
  await page.getByRole("button", { name: "Confirm start pin" }).click();
  await page.getByRole("spinbutton", { name: "Destination latitude" }).fill("10.322");
  await page.getByRole("spinbutton", { name: "Destination longitude" }).fill("123.942");
  await page.getByRole("button", { name: "Confirm destination pin" }).click();

  const calculateButton = page.getByRole("button", { name: "Calculate route with confirmed pins" });
  await calculateButton.click();
  await expect.poll(() => routeRequests.length).toBe(2);
  await expect(page.getByRole("alert").getByText("OSRM temporarily unavailable.")).toBeVisible();

  await page.getByRole("spinbutton", { name: "Destination latitude" }).fill("10.323");
  await page.getByRole("spinbutton", { name: "Destination longitude" }).fill("123.943");
  const retryButton = page.getByRole("button", { name: "Try route again" });
  await expect(calculateButton).toBeDisabled();
  await expect(retryButton).toBeDisabled();
  await page.getByRole("spinbutton", { name: "Destination latitude" }).fill("10.322");
  await page.getByRole("spinbutton", { name: "Destination longitude" }).fill("123.942");
  await expect(calculateButton).toBeDisabled();
  await expect(retryButton).toBeDisabled();
  await page.getByRole("spinbutton", { name: "Destination latitude" }).fill("10.323");
  await page.getByRole("spinbutton", { name: "Destination longitude" }).fill("123.943");
  await page.getByRole("button", { name: "Confirm destination pin" }).click();
  await page.getByRole("button", { name: "Cycling" }).click();
  await expect(page.getByRole("button", { name: "Cycling" })).toHaveAttribute("aria-pressed", "true");
  await expect(calculateButton).toBeEnabled();
  expect(routeRequests).toHaveLength(2);

  await retryButton.click();
  await expect.poll(() => routeRequests.length).toBe(3);
  expect(routeRequests[2]).toMatchObject({
    mode: "cycling",
    confirmedCoordinates: {
      origin: { lat: 10.321, lon: 123.941 },
      destination: { lat: 10.323, lon: 123.943 },
    },
  });
  await expect(page.getByText("2.3 km", { exact: true })).toBeVisible();
});

test("changing mode after a route error does not silently retry", async ({ page }) => {
  const routeRequests: Array<Record<string, unknown>> = [];
  await mockAuthenticatedSession(page);
  const answer = [
    "Here's the route.",
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
    if (routeRequests.length === 1) {
      await route.fulfill({ status: 503, json: { error: { message: "OSRM temporarily unavailable." } } });
      return;
    }
    await route.fulfill({
      json: {
        origin: { label: "Seattle, Washington, United States", lat: 47.6062, lon: -122.3321 },
        destination: { label: "Portland, Oregon, United States", lat: 45.5152, lon: -122.6784 },
        mode: request.mode,
        distanceMeters: 280_000,
        durationSeconds: 10_000,
        geometry: [[47.6062, -122.3321], [45.5152, -122.6784]],
        steps: [],
      },
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Show me the route from Seattle to Portland.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Couldn’t load this route", { exact: true })).toBeVisible();
  await expect.poll(() => routeRequests.length).toBe(1);

  const automaticRetry = page.waitForRequest("**/api/map-route", { timeout: 500 })
    .then(() => true, () => false);
  await page.getByRole("button", { name: "Cycling" }).click();
  await expect(page.getByRole("button", { name: "Cycling" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Couldn’t load this route", { exact: true })).toBeVisible();
  expect(await automaticRetry).toBe(false);
  expect(routeRequests).toHaveLength(1);

  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => routeRequests.length).toBe(2);
  expect(routeRequests[1]).toMatchObject({ mode: "cycling" });
  await expect(page.getByText("280 km", { exact: true })).toBeVisible();
});

test("changing mode repeatedly preserves confirmed pins and ignores the late prior response", async ({ page }) => {
  const routeRequests: Array<Record<string, unknown>> = [];
  const cyclingResponseGate: { release?: () => void; completed?: Promise<void>; delivered?: boolean } = {};
  await mockAuthenticatedSession(page);
  const answer = [
    "Confirm these points before I route them.",
    "```cartman-widget",
    JSON.stringify({
      type: "route-map",
      origin: "Repeated mode change start",
      destination: "Repeated mode change destination",
      mode: "driving",
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
  await page.route("**/api/map-route", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    routeRequests.push(request);
    if (routeRequests.length === 1) {
      await route.fulfill({
        status: 422,
        json: {
          error: {
            code: "place_not_found",
            message: "Confirm both route points.",
            details: {
              unresolvedEndpoints: ["origin", "destination"],
              resolvedEndpoints: {},
              mapCenter: { label: "Mandaue City, Cebu, Philippines", lat: 10.335, lon: 123.94, zoom: 12 },
            },
          },
        },
      });
      return;
    }
    const coordinates = request.confirmedCoordinates as {
      origin: { lat: number; lon: number };
      destination: { lat: number; lon: number };
    } | undefined;
    const origin = coordinates?.origin ?? { lat: 10.321, lon: 123.941 };
    const destination = coordinates?.destination ?? { lat: 10.322, lon: 123.942 };
    const fulfill = () => route.fulfill({
      json: {
        origin: { label: "Confirmed start", ...origin, ...(coordinates ? { source: "map_pin" } : {}) },
        destination: { label: "Confirmed destination", ...destination, ...(coordinates ? { source: "map_pin" } : {}) },
        mode: request.mode,
        distanceMeters: 2_300,
        durationSeconds: request.mode === "walking" ? 360 : request.mode === "cycling" ? 600 : 420,
        geometry: [[origin.lat, origin.lon], [destination.lat, destination.lon]],
        steps: [],
      },
    });

    if (request.mode === "cycling") {
      let markCompleted = () => {};
      cyclingResponseGate.completed = new Promise<void>((resolve) => {
        markCompleted = resolve;
      });
      await new Promise<void>((resolve) => {
        cyclingResponseGate.release = resolve;
      });
      try {
        await fulfill();
        cyclingResponseGate.delivered = true;
      } finally {
        markCompleted();
      }
      return;
    }
    await fulfill();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Route these two coordinates");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Confirm locations on the map", { exact: true })).toBeVisible();
  await page.getByRole("spinbutton", { name: "Start point latitude" }).fill("10.321");
  await page.getByRole("spinbutton", { name: "Start point longitude" }).fill("123.941");
  await page.getByRole("button", { name: "Confirm start pin" }).click();
  await page.getByRole("spinbutton", { name: "Destination latitude" }).fill("10.322");
  await page.getByRole("spinbutton", { name: "Destination longitude" }).fill("123.942");
  await page.getByRole("button", { name: "Confirm destination pin" }).click();
  await page.getByRole("button", { name: "Calculate route with confirmed pins" }).click();
  await expect.poll(() => routeRequests.length).toBe(2);
  await expect(page.getByText("7 min", { exact: true })).toBeVisible();
  expect(routeRequests[1]).toMatchObject({
    confirmedCoordinates: {
      origin: { lat: 10.321, lon: 123.941 },
      destination: { lat: 10.322, lon: 123.942 },
    },
  });

  await page.evaluate(() => {
    AbortController.prototype.abort = () => {};
    const testWindow = window as Window & { __lateCyclingResponseProcessed?: boolean };
    testWindow.__lateCyclingResponseProcessed = false;
    const originalJson = Response.prototype.json;
    Response.prototype.json = async function () {
      const payload = await originalJson.call(this);
      const body = typeof payload === "object" && payload !== null
        ? payload as { mode?: unknown }
        : null;
      if (this.url.includes("/api/map-route") && this.status === 200 && body?.mode === "cycling") {
        window.setTimeout(() => {
          testWindow.__lateCyclingResponseProcessed = true;
        }, 0);
      }
      return payload;
    };
  });
  await page.getByRole("button", { name: "Cycling" }).click();
  await expect.poll(() => routeRequests.length).toBe(3);
  try {
    await page.getByRole("button", { name: "Walking" }).click();
    await expect.poll(() => routeRequests.length).toBe(4);
    expect(routeRequests[3]).toMatchObject({
      mode: "walking",
      confirmedCoordinates: {
        origin: { lat: 10.321, lon: 123.941 },
        destination: { lat: 10.322, lon: 123.942 },
      },
    });
    await expect(page.getByText("6 min", { exact: true })).toBeVisible();
  } finally {
    cyclingResponseGate.release?.();
  }
  await cyclingResponseGate.completed;
  expect(cyclingResponseGate.delivered).toBe(true);
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __lateCyclingResponseProcessed?: boolean }).__lateCyclingResponseProcessed,
  )).toBe(true);
  await expect(page.getByText("6 min", { exact: true })).toBeVisible();
  await expect(page.getByText("10 min", { exact: true })).toHaveCount(0);
});

test("labels a reverted confirmed coordinate as needing reconfirmation", async ({ page }) => {
  const routeRequests: Array<Record<string, unknown>> = [];
  await mockAuthenticatedSession(page);
  const answer = [
    "Confirm these route points.",
    "```cartman-widget",
    JSON.stringify({ type: "route-map", origin: "Pin label start", destination: "Pin label destination", mode: "driving" }),
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
    routeRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 422,
      json: {
        error: {
          code: "place_not_found",
          message: "Confirm both route points.",
          details: {
            unresolvedEndpoints: ["origin", "destination"],
            resolvedEndpoints: {},
            mapCenter: { label: "Mandaue City", lat: 10.335, lon: 123.94, zoom: 12 },
          },
        },
      },
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Confirm these route points");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Confirm locations on the map", { exact: true })).toBeVisible();
  await expect.poll(() => routeRequests.length).toBe(1);

  await page.getByRole("spinbutton", { name: "Start point latitude" }).fill("10.321");
  await page.getByRole("spinbutton", { name: "Start point longitude" }).fill("123.941");
  await page.getByRole("button", { name: "Confirm start pin" }).click();
  const confirmedStartChip = page.getByRole("button", { name: "Start point · pin confirmed" });
  await confirmedStartChip.click();
  await page.getByRole("spinbutton", { name: "Start point latitude" }).fill("10.322");

  const startNeedsPin = page.getByRole("button", { name: "Start point · needs pin" });
  await expect(startNeedsPin).toBeVisible();
  await expect(page.getByRole("button", { name: "Calculate route with confirmed pins" })).toBeDisabled();
  await page.getByRole("button", { name: "Destination · needs pin" }).click();
  await expect(page.getByRole("spinbutton", { name: "Destination latitude" })).toBeVisible();
  await expect(startNeedsPin).toBeVisible();
  await page.getByRole("button", { name: "Start point · needs pin" }).click();
  await expect(page.getByRole("spinbutton", { name: "Start point latitude" })).toHaveValue("10.322");
  await expect(page.getByRole("spinbutton", { name: "Start point longitude" })).toHaveValue("123.941");
  await expect(page.getByRole("button", { name: "Calculate route with confirmed pins" })).toBeDisabled();
  expect(routeRequests).toHaveLength(1);
});
