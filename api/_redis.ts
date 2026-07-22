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

/** 1か月に実行できる生成回数。Vercelの環境変数で変更する。 */
export function getMonthlyGenerationLimit(): number {
  const value = Number.parseInt(process.env.MONTHLY_GENERATION_LIMIT ?? "100", 10);
  return Number.isFinite(value) && value >= 0 ? value : 100;
}

/** 生成ボタン1回で作成する画像枚数。 */
export const IMAGES_PER_GENERATION = 3;

/** 月別カウンターキー（例: wanko_monthly:2026-05） */
export function MONTHLY_KEY(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `wanko_monthly:${y}-${m}`;
}
