import Redis from "ioredis";

export function createRedis() {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => {
      return Math.min(1000 * 2 ** Math.min(times, 5), 10000);
    }
  });
  return redis;
}

export const LUA_TRY_WIN = `
if redis.call("EXISTS", KEYS[1]) == 1 then
  return 0
end
redis.call("HSET", KEYS[1], "userId", ARGV[1], "wonAtMs", ARGV[2])
redis.call("PEXPIRE", KEYS[1], 3600000)
return 1
`;

export const LUA_TRY_ADVANCE = `
if redis.call("SET", KEYS[1], ARGV[1], "NX", "PX", 15000) then
  return 1
end
return 0
`;

