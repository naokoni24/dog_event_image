import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is not configured");
    }
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
      lazyConnect: false,
    });
  }
  return client;
}

export const COUNTER_KEY = "wanko_total_generated";

/** 1か月に実行できる生成回数。Vercelの環境変数で変更する。 */
export function getMonthlyGenerationLimit(): number {
  const value = Number.parseInt(process.env.MONTHLY_GENERATION_LIMIT ?? "100", 10);
  return Number.isFinite(value) && value >= 0 ? value : 100;
}

/** 生成ボタン1回で作成する画像枚数。 */
export const IMAGES_PER_GENERATION = 3;

/** 月別カウンターキー（日本時間、例: wanko_monthly:2026-05） */
export function MONTHLY_KEY(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const y = parts.find((part) => part.type === "year")?.value;
  const m = parts.find((part) => part.type === "month")?.value;
  if (!y || !m) throw new Error("Failed to calculate monthly counter key");
  return `wanko_monthly:${y}-${m}`;
}
