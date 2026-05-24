import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
      lazyConnect: false,
    });
  }
  return client;
}

export const COUNTER_KEY = "wanko_total_generated";

/** 月別カウンターキー（例: wanko_monthly:2026-05） */
export function MONTHLY_KEY(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `wanko_monthly:${y}-${m}`;
}
