import { getRedis } from "../config/redis.js";

interface RateLimitOptions {
  maxPerWindow: number;   // e.g. 60
  windowSecs:   number;   // e.g. 60  → 60 events per 60 s
}

/**
 * Returns true if the action is ALLOWED, false if rate-limited.
 * Key format: rl:{event}:{userId}
 */
export async function checkRateLimit(
  userId: string,
  event: string,
  opts: RateLimitOptions,
): Promise<boolean> {
  const redis = getRedis();
  const key   = `rl:${event}:${userId}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, opts.windowSecs);
    return count <= opts.maxPerWindow;
  } catch {
    // If Redis is down, fail open (allow the request)
    return true;
  }
}

// Presets
export const Limits = {
  CODE_CHANGE:   { maxPerWindow: 120, windowSecs: 10  }, // 12 changes/s
  CURSOR_MOVE:   { maxPerWindow: 300, windowSecs: 10  }, // 30 cursor events/s
  RUN_CODE:      { maxPerWindow: 5,   windowSecs: 30  }, // 5 runs per 30 s
  JOIN_ROOM:     { maxPerWindow: 10,  windowSecs: 30  },
  YJS_UPDATE:    { maxPerWindow: 200, windowSecs: 10  },
} as const;