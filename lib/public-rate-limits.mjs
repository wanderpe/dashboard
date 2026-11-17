import { createHash } from "node:crypto";
import { isIP } from "node:net";

const MINUTE = 60_000;
const FIFTEEN_MINUTES = 15 * MINUTE;
const HOUR = 60 * MINUTE;
const MAX_BUCKETS = 20_000;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createRateLimiter(limit, windowMs, maxBuckets = MAX_BUCKETS) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("limit must be a positive integer");
  }
  if (!Number.isFinite(windowMs) || windowMs < 1) {
    throw new TypeError("windowMs must be a positive number");
  }
  if (!Number.isInteger(maxBuckets) || maxBuckets < 1) {
    throw new TypeError("maxBuckets must be a positive integer");
  }

  const buckets = new Map();
  let callsSinceSweep = 0;

  function prune(now) {
    const cutoff = now - windowMs;
    for (const [key, timestamps] of buckets) {
      let firstLive = 0;
      while (firstLive < timestamps.length && timestamps[firstLive] <= cutoff) {
        firstLive += 1;
      }
      if (firstLive === timestamps.length) {
        buckets.delete(key);
      } else if (firstLive > 0) {
        buckets.set(key, timestamps.slice(firstLive));
      }
    }
  }

  return {
    consume(key, now = Date.now()) {
      if (typeof key !== "string" || key.length === 0) {
        throw new TypeError("key must be a non-empty string");
      }
      if (!Number.isFinite(now)) {
        throw new TypeError("now must be a finite timestamp");
      }

      callsSinceSweep += 1;
      if (callsSinceSweep >= 256) {
        prune(now);
        callsSinceSweep = 0;
      }

      let timestamps = buckets.get(key);
      if (!timestamps) {
        if (buckets.size >= maxBuckets) {
          prune(now);
          if (buckets.size >= maxBuckets) {
            let earliestExpiry = Number.POSITIVE_INFINITY;
            for (const activeTimestamps of buckets.values()) {
              if (activeTimestamps.length > 0) {
                earliestExpiry = Math.min(earliestExpiry, activeTimestamps[0] + windowMs);
              }
            }
            const retryAfterMs = Number.isFinite(earliestExpiry)
              ? Math.max(1, earliestExpiry - now)
              : windowMs;
            return { allowed: false, remaining: 0, retryAfterMs };
          }
        }
        timestamps = [];
      } else {
        const cutoff = now - windowMs;
        let firstLive = 0;
        while (firstLive < timestamps.length && timestamps[firstLive] <= cutoff) {
          firstLive += 1;
        }
        timestamps = timestamps.slice(firstLive);
      }

      if (timestamps.length >= limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(1, timestamps[0] + windowMs - now),
        };
      }

      timestamps.push(now);
      buckets.set(key, timestamps);
      return {
        allowed: true,
        remaining: limit - timestamps.length,
        retryAfterMs: 0,
      };
    },
  };
}

export function clientIpKey(headers) {
  // Tailscale Serve overwrites these markers on Funnel requests; do not trust
  // an arbitrary client-supplied X-Forwarded-For header outside that boundary.
  if (headers.get("tailscale-funnel-request") !== "?1") {
    return "client:unknown";
  }

  const forwardedFor = headers.get("x-forwarded-for") ?? "";
  const address = forwardedFor.split(",", 1)[0].trim();
  if (!address || isIP(address) === 0) {
    return "client:unknown";
  }

  return `client:${digest(address)}`;
}

function combine(decisions) {
  const denied = decisions.filter((decision) => !decision.allowed);
  if (denied.length > 0) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(...denied.map((decision) => decision.retryAfterMs)),
    };
  }
  return {
    allowed: true,
    remaining: Math.min(...decisions.map((decision) => decision.remaining)),
    retryAfterMs: 0,
  };
}

export function createPublicRateLimits() {
  const registrationsPerIp = createRateLimiter(5, HOUR);
  const registrationsGlobal = createRateLimiter(20, HOUR);
  const loginsPerIp = createRateLimiter(30, FIFTEEN_MINUTES);
  const loginsPerEmail = createRateLimiter(10, FIFTEEN_MINUTES);
  const chatsPerUserMinute = createRateLimiter(10, MINUTE);
  const chatsPerUserHour = createRateLimiter(100, HOUR);
  const chatsPerIp = createRateLimiter(20, MINUTE);
  const chatsGlobal = createRateLimiter(30, MINUTE);
  const mapRoutesPerUserMinute = createRateLimiter(20, MINUTE);
  const mapRoutesPerUserHour = createRateLimiter(100, HOUR);
  const mapRoutesPerIp = createRateLimiter(20, MINUTE);
  const mapRoutesGlobal = createRateLimiter(30, MINUTE);

  function checkChatRequest(headers, now) {
    return combine([
      chatsPerIp.consume(clientIpKey(headers), now),
      chatsGlobal.consume("all", now),
    ]);
  }

  function checkChatUser(userId, now) {
    const userKey = `user:${digest(String(userId))}`;
    return combine([
      chatsPerUserMinute.consume(userKey, now),
      chatsPerUserHour.consume(userKey, now),
    ]);
  }

  function checkMapRequest(headers, now) {
    return mapRoutesPerIp.consume(clientIpKey(headers), now);
  }

  function checkMapUser(userId, now) {
    const userKey = `user:${digest(String(userId))}`;
    const userDecision = combine([
      mapRoutesPerUserMinute.consume(userKey, now),
      mapRoutesPerUserHour.consume(userKey, now),
    ]);
    if (!userDecision.allowed) return userDecision;

    return combine([userDecision, mapRoutesGlobal.consume("all", now)]);
  }

  return {
    registration(headers, now = Date.now()) {
      return combine([
        registrationsPerIp.consume(clientIpKey(headers), now),
        registrationsGlobal.consume("all", now),
      ]);
    },
    login(headers, email, now = Date.now()) {
      const ipDecision = loginsPerIp.consume(clientIpKey(headers), now);
      if (!ipDecision.allowed) return ipDecision;

      const decisions = [ipDecision];
      const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      if (normalizedEmail) {
        decisions.push(loginsPerEmail.consume(`email:${digest(normalizedEmail)}`, now));
      }
      return combine(decisions);
    },
    chatRequest(headers, now = Date.now()) {
      return checkChatRequest(headers, now);
    },
    chatUser(userId, now = Date.now()) {
      return checkChatUser(userId, now);
    },
    mapRequest(headers, now = Date.now()) {
      return checkMapRequest(headers, now);
    },
    mapUser(userId, now = Date.now()) {
      return checkMapUser(userId, now);
    },
    chat(headers, userId, now = Date.now()) {
      return combine([
        checkChatRequest(headers, now),
        checkChatUser(userId, now),
      ]);
    },
  };
}

// The dashboard currently runs as one Next.js process behind Tailscale Funnel.
// These process-local counters are a first-layer abuse control; use shared storage
// before scaling to multiple dashboard instances.
export const publicRateLimits = createPublicRateLimits();
