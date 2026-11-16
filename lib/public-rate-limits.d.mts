export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export type RateLimitHeaders = Pick<Headers, "get">;

export declare function createRateLimiter(
  limit: number,
  windowMs: number,
  maxBuckets?: number,
): {
  consume(key: string, now?: number): RateLimitDecision;
};

export declare function clientIpKey(headers: RateLimitHeaders): string;

export declare function createPublicRateLimits(): {
  registration(headers: RateLimitHeaders, now?: number): RateLimitDecision;
  login(headers: RateLimitHeaders, email: string, now?: number): RateLimitDecision;
  chatRequest(headers: RateLimitHeaders, now?: number): RateLimitDecision;
  chatUser(userId: string, now?: number): RateLimitDecision;
  chat(headers: RateLimitHeaders, userId: string, now?: number): RateLimitDecision;
};

export declare const publicRateLimits: ReturnType<typeof createPublicRateLimits>;
