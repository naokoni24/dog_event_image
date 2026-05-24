import { getRedis, COUNTER_KEY } from "./_redis.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "GET") { res.status(405).end(); return; }
  try {
    const val = await getRedis().get(COUNTER_KEY);
    res.status(200).json({ count: parseInt(val ?? "0", 10) });
  } catch {
    res.status(200).json({ count: 0 });
  }
}
