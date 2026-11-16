import { expect, test } from "@playwright/test";

function sseFrame(event: string | null, data: unknown) {
  return `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}`;
}

const toolProgress = (status: "running" | "completed", label?: string) => ({
  tool: "web_search",
  toolCallId: "call-browser-test",
  status,
  ...(label ? { label } : {}),
});

test("chat keeps public tool steps and renders explicit inline citations", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
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
  let postedChatBody: Record<string, unknown> | undefined;
  await page.route("**/api/chat", (route) => {
    postedChatBody = route.request().postDataJSON() as Record<string, unknown>;
    const stream = [
      sseFrame("hermes.tool.progress", {
        ...toolProgress("running", "Searching the release notes"),
      }),
      sseFrame("hermes.tool.progress", toolProgress("completed")),
      sseFrame("hermes.tool.progress", {
        tool: "_reasoning",
        label: "private reasoning text",
        status: "running",
      }),
      sseFrame(null, {
        choices: [
          {
            delta: {
              content:
                "The release notes are [available here](https://docs.example.test/releases).",
            },
            finish_reason: null,
          },
        ],
      }),
      sseFrame(null, {
        choices: [{ delta: {}, finish_reason: "stop" }],
      }),
      "data: [DONE]",
    ].join("\n\n");

    return route.fulfill({
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/event-stream; charset=utf-8",
      },
      body: `${stream}\n\n`,
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  await expect(page).toHaveTitle("Eric AI");
  await expect(page.locator('meta[name="description"]')).toHaveCount(0);
  const emptyHeading = page.getByRole("heading", { name: "What are we working on?" });
  const firstPrompt = page.getByRole("button", { name: "Use prompt: Explain a concept" });
  await expect(emptyHeading).toBeInViewport();
  await expect(firstPrompt).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1365, height: 900 });
  await expect(
    page.getByText(
      "Web search is automatic when useful; search terms may go to external providers. Avoid secrets.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Search web", exact: true })).toHaveCount(0);

  const composer = page.getByRole("textbox", { name: "Message Eric" });
  await expect(composer).toBeEnabled();
  await expect(composer).not.toBeFocused();
  await page.getByRole("button", { name: /Explain a concept/ }).click();
  await expect(composer).toHaveValue(
    "Explain a technical concept in plain language, with a simple example.",
  );
  await expect(composer).toBeFocused();
  expect(postedChatBody).toBeUndefined();

  await composer.fill("Find the current release notes.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => postedChatBody).toBeDefined();
  expect(postedChatBody).not.toHaveProperty("forceWebSearch");

  const progressSummary = page.getByText("Worked through 1 step", {
    exact: true,
  });
  await expect(progressSummary).toBeVisible();

  await expect(
    page.getByText("Find the current release notes.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("The release notes are", { exact: true })).toBeVisible();

  const progressDetail = page.getByText("Searching the release notes", {
    exact: true,
  });
  if (!(await progressDetail.isVisible())) await progressSummary.click();
  await expect(progressDetail).toBeVisible();

  const citation = page.getByRole("button", { name: "docs.example.test" });
  await expect(citation).toBeVisible();
  await citation.hover();
  await expect(page.getByRole("link", { name: /Open source/ })).toHaveAttribute(
    "href",
    "https://docs.example.test/releases",
  );
  await expect(page.getByText("Used 1 source", { exact: true })).toBeVisible();
  await expect(page.getByText("Eric · AI assistant", { exact: true })).toBeVisible();
  const copyButton = page.getByRole("button", { name: "Copy answer" });
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  await expect(page.getByRole("button", { name: "Answer copied" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    "The release notes are [available here](https://docs.example.test/releases).",
  );
  await expect(page.getByText("private reasoning text")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
