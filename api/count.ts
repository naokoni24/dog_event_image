import { getMonthlyGenerationLimit, getRedis, IMAGES_PER_GENERATION, MONTHLY_KEY } from "./_redis.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "GET") { res.status(405).end(); return; }
  try {
    const val = await getRedis().get(MONTHLY_KEY());
    const generatedImages = parseInt(val ?? "0", 10);
    const usedGenerations = Math.ceil(generatedImages / IMAGES_PER_GENERATION);
    const remaining = Math.max(0, getMonthlyGenerationLimit() - usedGenerations);
    res.status(200).json({ remaining });
  } catch {
    res.status(200).json({ remaining: null });
  }
}
