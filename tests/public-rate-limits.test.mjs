import test from "node:test";
import assert from "node:assert/strict";

const rateLimitModule = await import("../lib/public-rate-limits.mjs").catch(() => ({}));

function implementation(name) {
  assert.equal(
    typeof rateLimitModule[name],
    "function",
    `${name} must be implemented`,
  );
  return rateLimitModule[name];
}

function funnelHeaders(ip) {
  return new Headers({
    "Tailscale-Funnel-Request": "?1",
    "X-Forwarded-For": ip,
  });
}

test("sliding window blocks at the limit and expires the oldest hit", () => {
  const createRateLimiter = implementation("createRateLimiter");
  const limiter = createRateLimiter(2, 1_000);

  assert.deepEqual(limiter.consume("user-a", 1_000), {
    allowed: true,
    remaining: 1,
    retryAfterMs: 0,
  });
  assert.deepEqual(limiter.consume("user-a", 1_100), {
    allowed: true,
    remaining: 0,
    retryAfterMs: 0,
  });
  assert.deepEqual(limiter.consume("user-a", 1_500), {
    allowed: false,
    remaining: 0,
    retryAfterMs: 500,
  });
  assert.equal(limiter.consume("user-a", 2_000).allowed, true);
});

test("capacity denial reports time until the earliest bucket expires", () => {
  const createRateLimiter = implementation("createRateLimiter");
  const limiter = createRateLimiter(1, 1_000, 1);

  assert.equal(limiter.consume("first", 1_000).allowed, true);
  assert.deepEqual(limiter.consume("second", 1_999), {
    allowed: false,
    remaining: 0,
    retryAfterMs: 1,
  });
  assert.equal(limiter.consume("second", 2_000).allowed, true);
});

test("rate limit buckets are independent per key", () => {
  const createRateLimiter = implementation("createRateLimiter");
  const limiter = createRateLimiter(1, 1_000);

  assert.equal(limiter.consume("user-a", 100).allowed, true);
  assert.equal(limiter.consume("user-a", 101).allowed, false);
  assert.equal(limiter.consume("user-b", 101).allowed, true);
});

test("client IP keys trust only Tailscale Funnel's overwritten headers", () => {
  const clientIpKey = implementation("clientIpKey");
  const first = clientIpKey(funnelHeaders("203.0.113.8"));

  assert.equal(first, clientIpKey(funnelHeaders("203.0.113.8")));
  assert.notEqual(first, clientIpKey(funnelHeaders("203.0.113.9")));
  assert.equal(first.includes("203.0.113.8"), false);
  assert.equal(
    clientIpKey(new Headers({ "X-Forwarded-For": "203.0.113.8" })),
    "client:unknown",
  );
});

test("registration policy limits repeat signups from one Funnel client", () => {
  const createPublicRateLimits = implementation("createPublicRateLimits");
  const limits = createPublicRateLimits();
  const headers = funnelHeaders("203.0.113.10");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(limits.registration(headers, 1_000 + attempt).allowed, true);
  }
  const blocked = limits.registration(headers, 2_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 3_599_000);
});

test("login policy limits attempts for both a client and an account", () => {
  const createPublicRateLimits = implementation("createPublicRateLimits");
  const limits = createPublicRateLimits();
  const headers = funnelHeaders("203.0.113.11");

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(limits.login(headers, "Friend@Example.com", 1_000 + attempt).allowed, true);
  }
  assert.equal(limits.login(headers, "friend@example.com", 2_000).allowed, false);
});

test("denied login bursts do not allocate buckets for attacker-chosen emails", () => {
  const createPublicRateLimits = implementation("createPublicRateLimits");
  const limits = createPublicRateLimits();
  const attacker = funnelHeaders("203.0.113.77");

  for (let attempt = 0; attempt < 20_005; attempt += 1) {
    limits.login(attacker, `attempt-${attempt}@example.invalid`, 10_000 + attempt);
  }

  const legitimate = limits.login(
    funnelHeaders("203.0.113.78"),
    "new-friend@example.invalid",
    40_000,
  );
  assert.equal(legitimate.allowed, true);
});

test("pre-auth chat budget throttles by client before session lookup", () => {
  const createPublicRateLimits = implementation("createPublicRateLimits");
  const limits = createPublicRateLimits();
  const headers = funnelHeaders("203.0.113.13");

  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal(limits.chatRequest(headers, 1_000 + attempt).allowed, true);
  }
  const blocked = limits.chatRequest(headers, 2_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 59_000);
});

test("chat policy limits both an account burst and aggregate traffic", () => {
  const createPublicRateLimits = implementation("createPublicRateLimits");
  const limits = createPublicRateLimits();
  const headers = funnelHeaders("203.0.113.12");

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(limits.chat(headers, "user-a", 1_000 + attempt).allowed, true);
  }
  assert.equal(limits.chat(headers, "user-a", 2_000).allowed, false);

  const aggregateLimits = createPublicRateLimits();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    assert.equal(
      aggregateLimits.chat(funnelHeaders(`198.51.100.${attempt + 1}`), `user-${attempt}`, 1_000).allowed,
      true,
    );
  }
  assert.equal(
    aggregateLimits.chat(funnelHeaders("198.51.100.99"), "user-overflow", 1_000).allowed,
    false,
  );
});

test("map lookups have a separate budget from chat turns", () => {
  const createPublicRateLimits = implementation("createPublicRateLimits");
  const limits = createPublicRateLimits();
  const headers = funnelHeaders("203.0.113.44");

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const now = 1_000 + attempt;
    assert.equal(limits.chat(headers, "user-a", now).allowed, true);
    assert.equal(limits.mapRequest(headers, now).allowed, true);
    assert.equal(limits.mapUser("user-a", now).allowed, true);
  }

  assert.equal(limits.chat(headers, "user-a", 2_000).allowed, false);
  assert.equal(limits.mapRequest(headers, 2_000).allowed, true);
  assert.equal(limits.mapUser("user-a", 2_000).allowed, true);
});

test("map requests enforce separate client and user minute caps", () => {
  const createPublicRateLimits = implementation("createPublicRateLimits");
  const headers = funnelHeaders("203.0.113.45");
  const clientLimits = createPublicRateLimits();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal(clientLimits.mapRequest(headers, 1_000 + attempt).allowed, true);
  }
  assert.equal(clientLimits.mapRequest(headers, 2_000).allowed, false);
  assert.equal(clientLimits.mapUser("user-a", 2_000).allowed, true);

  const userLimits = createPublicRateLimits();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal(userLimits.mapUser("user-a", 1_000 + attempt).allowed, true);
  }
  assert.equal(userLimits.mapUser("user-a", 2_000).allowed, false);
  assert.equal(userLimits.chat(headers, "user-a", 2_000).allowed, true);
});

test("map user hourly cap applies across separate minute windows", () => {
  const createPublicRateLimits = implementation("createPublicRateLimits");
  const limits = createPublicRateLimits();
  const headers = funnelHeaders("203.0.113.46");

  for (let minute = 0; minute < 5; minute += 1) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const now = 1_000 + minute * 60_000 + attempt;
      assert.equal(limits.mapRequest(headers, now).allowed, true);
      assert.equal(limits.mapUser("user-a", now).allowed, true);
    }
  }

  assert.equal(limits.mapRequest(headers, 301_000).allowed, true);
  assert.equal(limits.mapUser("user-a", 301_000).allowed, false);
});

test("unauthenticated map request limits do not consume the authenticated global cap", () => {
  const createPublicRateLimits = implementation("createPublicRateLimits");
  const limits = createPublicRateLimits();
  const headers = funnelHeaders("203.0.113.47");

  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal(limits.mapRequest(headers, 1_000 + attempt).allowed, true);
  }
  assert.equal(limits.mapRequest(headers, 2_000).allowed, false);

  for (let user = 0; user < 30; user += 1) {
    assert.equal(limits.mapUser(`user-${user}`, 2_000).allowed, true);
  }
  assert.equal(limits.mapUser("global-overflow", 2_000).allowed, false);
});
