import { expect, test, type Page } from "@playwright/test";

type GeoWindow = Window & { __geolocationRequests?: number };

function sseFrame(data: unknown) {
  return `data: ${JSON.stringify(data)}`;
}

function widgetAnswer(origin: string) {
  return [
    "Here's the route.",
    "```cartman-widget",
    JSON.stringify({ type: "route-map", origin, destination: "Portland, OR", mode: "driving" }),
    "```",
  ].join("\n");
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

async function installGeolocation(page: Page) {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({
    latitude: 10.321,
    longitude: 123.941,
    accuracy: 14,
  });
  await page.addInitScript(() => {
    const geoWindow = window as GeoWindow;
    geoWindow.__geolocationRequests = 0;
    const geolocation = navigator.geolocation;
    const getCurrentPosition = geolocation.getCurrentPosition.bind(geolocation);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          success: PositionCallback,
          error?: PositionErrorCallback | null,
          options?: PositionOptions,
        ) => {
          geoWindow.__geolocationRequests = (geoWindow.__geolocationRequests ?? 0) + 1;
          return getCurrentPosition(success, error, options);
        },
        watchPosition: geolocation.watchPosition.bind(geolocation),
        clearWatch: geolocation.clearWatch.bind(geolocation),
      },
    });
  });
}

function installChatResponse(page: Page, origin: string, requests: Array<Record<string, unknown>>) {
  const answer = widgetAnswer(origin);
  return page.route("**/api/chat", (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
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
}

function installMapRouteResponse(page: Page, requests: Array<Record<string, unknown>>) {
  return page.route("**/api/map-route", (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(request);
    const confirmed = request.confirmedCoordinates as
      | { origin?: { lat: number; lon: number } }
      | undefined;
    const originPoint = confirmed?.origin ?? { lat: 47.6062, lon: -122.3321 };
    return route.fulfill({
      json: {
        origin: {
          label: confirmed?.origin ? "User-confirmed pin for Current location" : "Seattle, Washington, United States",
          ...originPoint,
          source: confirmed?.origin ? "map_pin" : "nominatim",
          resolutionState: confirmed?.origin ? "USER_CONFIRMED" : "ROUTE_VALIDATED",
          userConfirmed: Boolean(confirmed?.origin),
        },
        destination: {
          label: "Portland, Oregon, United States",
          lat: 45.5152,
          lon: -122.6784,
          source: "nominatim",
          resolutionState: "ROUTE_VALIDATED",
          userConfirmed: false,
        },
        mode: request.mode,
        straightLineDistanceMeters: 250_000,
        roadDistanceMeters: 280_000,
        estimatedTravelTimeSeconds: 10_000,
        resolutionState: "ROUTE_VALIDATED",
        geometry: [
          [originPoint.lat, originPoint.lon],
          [46.5, -122.45],
          [45.5152, -122.6784],
        ],
        steps: [{ instruction: "Start the route", roadDistanceMeters: 5_000 }],
      },
    });
  });
}

async function geolocationRequestCount(page: Page) {
  return page.evaluate(() => (window as GeoWindow).__geolocationRequests ?? 0);
}

test("uses browser location for destination-only routes after opt-in and keeps coordinates session-only", async ({ page }) => {
  const chatRequests: Array<Record<string, unknown>> = [];
  const mapRequests: Array<Record<string, unknown>> = [];
  await installGeolocation(page);
  await mockAuthenticatedSession(page);
  installChatResponse(page, "Current location", chatRequests);
  installMapRouteResponse(page, mapRequests);

  await page.goto("/chat");
  const useLocationButton = page.getByRole("button", { name: "Use my location for routes" });
  await expect(useLocationButton).toBeVisible();
  await expect(page.getByText(/coordinates are sent to the map-routing provider.*OSRM.*not sent to AI chat or saved chat history/i)).toBeVisible();
  expect(await geolocationRequestCount(page)).toBe(0);

  await useLocationButton.click();
  await expect(page.getByRole("status", { name: "Route origin location" })).toContainText(
    "Using your location as the default route start",
  );
  expect(await geolocationRequestCount(page)).toBe(1);

  await page.getByRole("textbox", { name: "Message Eric" }).fill("Route me to Portland");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("region", { name: "Route planner" })).toBeVisible();
  await expect.poll(() => mapRequests.length).toBe(1);
  expect(chatRequests[0]).toMatchObject({ routeOriginPreference: "current-location" });
  expect(JSON.stringify(chatRequests[0])).not.toContain("10.321");
  expect(mapRequests[0]).toMatchObject({
    origin: "Current location",
    destination: "Portland, OR",
    mode: "driving",
    confirmedCoordinates: { origin: { lat: 10.321, lon: 123.941 } },
  });
  const directOriginCoordinates = (mapRequests[0].confirmedCoordinates as { origin: Record<string, unknown> }).origin;
  expect(Object.keys(directOriginCoordinates).sort()).toEqual(["lat", "lon"]);
  await expect(page.getByText("User-confirmed pin for Current location", { exact: true })).toBeVisible();

  const storedSession = await page.evaluate(() => JSON.stringify(sessionStorage));
  expect(storedSession).not.toContain("10.321");
  expect(storedSession).not.toContain("123.941");

  await page.reload();
  await expect(page.getByRole("button", { name: "Use my location for routes" })).toBeVisible();
  await expect(
    page.getByText(/enable location.*calculate this route/i).first(),
  ).toBeVisible();
  expect(await geolocationRequestCount(page)).toBe(0);
  expect(mapRequests).toHaveLength(1);

  await page.getByRole("button", { name: "Use my location for routes" }).click();
  await expect.poll(() => mapRequests.length).toBe(2);
  expect(mapRequests[1]).toMatchObject({
    origin: "Current location",
    confirmedCoordinates: { origin: { lat: 10.321, lon: 123.941 } },
  });
});

test("does not replace a route origin explicitly named by the user", async ({ page }) => {
  const chatRequests: Array<Record<string, unknown>> = [];
  const mapRequests: Array<Record<string, unknown>> = [];
  await installGeolocation(page);
  await mockAuthenticatedSession(page);
  installChatResponse(page, "Seattle, WA", chatRequests);
  installMapRouteResponse(page, mapRequests);

  await page.goto("/chat");
  await page.getByRole("button", { name: "Use my location for routes" }).click();
  await expect(page.getByRole("status", { name: "Route origin location" })).toContainText(
    "Using your location as the default route start",
  );

  await page.getByRole("textbox", { name: "Message Eric" }).fill("Route from Seattle to Portland");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("region", { name: "Route planner" })).toBeVisible();
  await expect.poll(() => mapRequests.length).toBe(1);

  expect(chatRequests[0]).toMatchObject({ routeOriginPreference: "current-location" });
  expect(mapRequests[0]).toMatchObject({ origin: "Seattle, WA", destination: "Portland, OR" });
  expect(mapRequests[0].confirmedCoordinates).toBeUndefined();
});

test("uses the opted-in location for nearby route comparisons", async ({ page }) => {
  const chatRequests: Array<Record<string, unknown>> = [];
  const comparisonRequests: Array<Record<string, unknown>> = [];
  let releaseSecondComparison: (() => void) | undefined;
  let resolveSecondComparisonStarted: (() => void) | undefined;
  const secondComparisonStarted = new Promise<void>((resolve) => {
    resolveSecondComparisonStarted = resolve;
  });
  const secondComparisonGate = new Promise<void>((resolve) => {
    releaseSecondComparison = resolve;
  });
  await installGeolocation(page);
  await mockAuthenticatedSession(page);
  const answer = [
    "I’ll compare routes from your current location.",
    "```cartman-widget",
    JSON.stringify({
      type: "nearby-map",
      center: "Mandaue City Hall, Cebu",
      categories: ["gym"],
      radiusMeters: 1_500,
      routeOrigin: "Current location",
      routeMode: "driving",
    }),
    "```",
  ].join("\n");
  await page.route("**/api/chat", (route) => {
    chatRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
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
        center: { label: "Mandaue City Hall, Cebu", lat: 10.335, lon: 123.94, source: "nominatim", resolutionState: "RESOLVED", userConfirmed: false },
        radiusMeters: 1_500,
        categories: ["gym"],
        truncated: false,
        places: [],
      },
    }),
  );
  await page.route("**/api/map-route/compare", async (route) => {
    comparisonRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    if (comparisonRequests.length === 2) {
      resolveSecondComparisonStarted?.();
      await secondComparisonGate;
    }
    return route.fulfill({
      json: {
        origin: { label: "User-confirmed pin for Current location", lat: 10.321, lon: 123.941, source: "map_pin", resolutionState: "USER_CONFIRMED", userConfirmed: true },
        center: { label: "Mandaue City Hall, Cebu", lat: 10.335, lon: 123.94, source: "nominatim", resolutionState: "RESOLVED", userConfirmed: false },
        categories: ["gym"],
        radiusMeters: 1_500,
        mode: "driving",
        candidateCount: 1,
        truncated: false,
        routes: [{
          id: "node/404",
          name: "Sample Gym",
          address: null,
          categories: ["gym"],
          lat: 10.33,
          lon: 123.95,
          straightLineDistanceMeters: 1_000,
          roadDistanceMeters: 2_000,
          estimatedTravelTimeSeconds: 300,
          geometry: [[10.321, 123.941], [10.33, 123.95]],
          resolutionState: "ROUTE_VALIDATED",
          routeState: "ROUTE_VALIDATED",
          rank: 1,
          failureReason: null,
        }],
      },
    });
  });

  await page.goto("/chat");
  const useLocationButton = page.getByRole("button", { name: "Use my location for routes" });
  await expect(useLocationButton).toBeVisible();
  expect(await geolocationRequestCount(page)).toBe(0);
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Find gyms and compare routes from here.");
  await page.getByRole("button", { name: "Send" }).click();

  const nearbyCard = page.getByRole("region", { name: "Nearby places", exact: true });
  await expect(nearbyCard).toBeVisible();
  await expect(nearbyCard.getByRole("heading", { name: "0 nearby places" })).toBeVisible();
  expect(comparisonRequests).toHaveLength(0);
  await expect(nearbyCard.getByRole("alert")).toContainText(/enable location/i);
  expect(await geolocationRequestCount(page)).toBe(0);

  await useLocationButton.click();
  expect(await geolocationRequestCount(page)).toBe(1);
  await expect.poll(() => comparisonRequests.length).toBe(1);
  expect(chatRequests[0].routeOriginPreference).toBeUndefined();
  expect(comparisonRequests[0]).toMatchObject({
    origin: "Current location",
    confirmedCoordinates: { origin: { lat: 10.321, lon: 123.941 } },
  });

  await expect(nearbyCard.getByRole("button", { name: /Sample Gym/ })).toBeVisible();
  await page.getByRole("button", { name: "Clear location" }).click();
  await expect(nearbyCard.getByRole("alert")).toContainText(/enable location/i);
  await expect(nearbyCard.getByRole("button", { name: /Sample Gym/ })).toHaveCount(0);
  expect(comparisonRequests).toHaveLength(1);

  await page.getByRole("button", { name: "Use my location for routes" }).click();
  await expect.poll(() => comparisonRequests.length).toBe(2);
  await secondComparisonStarted;
  try {
    await expect(nearbyCard.getByText("Calculating a road route for each discovered place…")).toBeVisible();
    await expect(nearbyCard.getByRole("button", { name: /Sample Gym/ })).toHaveCount(0);
  } finally {
    releaseSecondComparison?.();
  }
  await expect(nearbyCard.getByRole("button", { name: /Sample Gym/ })).toBeVisible();
});

test("rejects a route comparison with an un-geocoded nearby center", async ({ page }) => {
  const answer = [
    "I’ll compare routes from Seattle.",
    "```cartman-widget",
    JSON.stringify({
      type: "nearby-map",
      center: "Mandaue City Hall, Cebu",
      categories: ["gym"],
      radiusMeters: 1_500,
      routeOrigin: "Seattle, WA",
      routeMode: "driving",
    }),
    "```",
  ].join("\n");
  await mockAuthenticatedSession(page);
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
        center: { label: "Mandaue City Hall, Cebu", lat: 10.335, lon: 123.94, source: "nominatim", resolutionState: "RESOLVED", userConfirmed: false },
        radiusMeters: 1_500,
        categories: ["gym"],
        truncated: false,
        places: [],
      },
    }),
  );
  await page.route("**/api/map-route/compare", (route) =>
    route.fulfill({
      json: {
        origin: { label: "Seattle, Washington, United States", lat: 47.6062, lon: -122.3321, source: "nominatim", resolutionState: "ROUTE_VALIDATED", userConfirmed: false },
        center: { label: "Mandaue City Hall, Cebu", lat: 10.335, lon: 123.94, source: "map_pin", resolutionState: "USER_CONFIRMED", userConfirmed: true },
        categories: ["gym"],
        radiusMeters: 1_500,
        mode: "driving",
        candidateCount: 0,
        truncated: false,
        routes: [],
      },
    }),
  );

  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Find gyms around Mandaue and compare routes from Seattle.");
  await page.getByRole("button", { name: "Send" }).click();
  const nearbyCard = page.getByRole("region", { name: "Nearby places", exact: true });
  await expect(nearbyCard.getByRole("alert")).toContainText("Route comparison returned an invalid response.");
  await expect(nearbyCard.getByRole("group", { name: /Routes from/ })).toHaveCount(0);
});

test("rejects a confirmed map-pin origin for an explicitly named route origin", async ({ page }) => {
  const chatRequests: Array<Record<string, unknown>> = [];
  const comparisonRequests: Array<Record<string, unknown>> = [];
  const answer = [
    "I’ll compare routes from Seattle.",
    "```cartman-widget",
    JSON.stringify({
      type: "nearby-map",
      center: "Mandaue City Hall, Cebu",
      categories: ["gym"],
      radiusMeters: 1_500,
      routeOrigin: "Seattle, WA",
      routeMode: "driving",
    }),
    "```",
  ].join("\n");
  await mockAuthenticatedSession(page);
  await page.route("**/api/chat", (route) => {
    chatRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
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
        center: { label: "Mandaue City Hall, Cebu", lat: 10.335, lon: 123.94, source: "nominatim", resolutionState: "RESOLVED", userConfirmed: false },
        radiusMeters: 1_500,
        categories: ["gym"],
        truncated: false,
        places: [],
      },
    }),
  );
  await page.route("**/api/map-route/compare", (route) => {
    comparisonRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      json: {
        origin: { label: "User-confirmed pin for Seattle, WA", lat: 47.6062, lon: -122.3321, source: "map_pin", resolutionState: "USER_CONFIRMED", userConfirmed: true },
        center: { label: "Mandaue City Hall, Cebu", lat: 10.335, lon: 123.94, source: "nominatim", resolutionState: "RESOLVED", userConfirmed: false },
        categories: ["gym"],
        radiusMeters: 1_500,
        mode: "driving",
        candidateCount: 0,
        truncated: false,
        routes: [],
      },
    });
  });

  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Find gyms near Mandaue and compare routes from Seattle.");
  await page.getByRole("button", { name: "Send" }).click();
  const nearbyCard = page.getByRole("region", { name: "Nearby places", exact: true });
  await expect(nearbyCard.getByRole("alert")).toContainText("Route comparison returned an invalid response.");
  expect(chatRequests[0].routeOriginPreference).toBeUndefined();
  expect(comparisonRequests[0].origin).toBe("Seattle, WA");
  expect(comparisonRequests[0].confirmedCoordinates).toBeUndefined();
});

test("does not restore a current-location origin from saved nearby context", async ({ page }) => {
  const chatRequests: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("harvy-hermes-location-context", JSON.stringify({
      nearby: {
        center: "Mandaue City Hall, Cebu",
        categories: ["gym"],
        radiusMeters: 1_500,
        candidateNames: [],
        routeOrigin: "Current location",
        routeMode: "driving",
      },
    }));
  });
  await mockAuthenticatedSession(page);
  await page.route("**/api/chat", (route) => {
    chatRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: [
        sseFrame({ choices: [{ delta: { content: "Sure, what else?" }, finish_reason: null }] }),
        sseFrame({ choices: [{ delta: {}, finish_reason: "stop" }] }),
        "data: [DONE]",
        "",
      ].join("\n\n"),
    });
  });

  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Find another gym near the same area.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => chatRequests.length).toBe(1);

  expect(chatRequests[0].locationContext).toMatchObject({
    nearby: {
      center: "Mandaue City Hall, Cebu",
      categories: ["gym"],
      radiusMeters: 1_500,
      candidateNames: [],
    },
  });
  expect(JSON.stringify(chatRequests[0].locationContext)).not.toContain("Current location");
});

test("clears current location and saved chat as soon as sign-out starts", async ({ page }) => {
  const chatRequests: Array<Record<string, unknown>> = [];
  const mapRequests: Array<Record<string, unknown>> = [];
  let releaseLogout: (() => void) | undefined;
  let resolveLogoutStarted: (() => void) | undefined;
  const logoutStarted = new Promise<void>((resolve) => {
    resolveLogoutStarted = resolve;
  });
  const logoutGate = new Promise<void>((resolve) => {
    releaseLogout = resolve;
  });
  await installGeolocation(page);
  await mockAuthenticatedSession(page);
  installChatResponse(page, "Seattle, WA", chatRequests);
  installMapRouteResponse(page, mapRequests);
  await page.route("**/api/auth/logout", async (route) => {
    resolveLogoutStarted?.();
    await logoutGate;
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/chat");
  await page.getByRole("button", { name: "Use my location for routes" }).click();
  await expect(page.getByRole("status", { name: "Route origin location" })).toBeVisible();
  await page.getByRole("textbox", { name: "Message Eric" }).fill("Route from Seattle to Portland");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("region", { name: "Route planner" })).toBeVisible();
  await expect.poll(() => mapRequests.length).toBe(1);
  await page.evaluate(() => {
    sessionStorage.setItem("harvy-hermes-message-history", JSON.stringify([
      { id: "saved-message", role: "user", content: "Saved chat content" },
    ]));
    sessionStorage.setItem("harvy-hermes-location-context", JSON.stringify({
      nearby: {
        center: "Mandaue City Hall, Cebu",
        categories: ["gym"],
        radiusMeters: 1_500,
        candidateNames: ["Sample Gym"],
      },
    }));
  });

  await page.getByRole("button", { name: "Sign out" }).click();
  await logoutStarted;
  try {
    await expect(page.getByRole("heading", { name: "Create your chat account" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Route planner" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Sign in" })).toBeDisabled();
    const savedState = await page.evaluate(() => ({
      messages: sessionStorage.getItem("harvy-hermes-message-history"),
      location: sessionStorage.getItem("harvy-hermes-location-context"),
    }));
    expect(savedState.location).toBeNull();
    expect(savedState.messages === null || JSON.parse(savedState.messages).length === 0).toBe(true);
  } finally {
    releaseLogout?.();
  }
});
