import Redis from "ioredis";
import type { Redis as RedisType } from "ioredis";

// Shared Redis client (queue, rate-limiter, pub/sub subscriber each need their own)
export function createRedisClient(): RedisType {
  return new (Redis as any)({
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD ?? undefined,
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: false,
  });
}

// Singleton for general use (rate limiter, misc)
let _redis: RedisType | null = null;
export function getRedis(): RedisType {
  if (!_redis) _redis = createRedisClient();
  return _redis;
}