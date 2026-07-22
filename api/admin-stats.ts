import { getMonthlyGenerationLimit, getRedis, COUNTER_KEY, IMAGES_PER_GENERATION, MONTHLY_KEY } from "./_redis.js";

const PRODUCTION_ORIGIN = "https://dog-event-app.vercel.app";
const ALLOWED_ORIGINS = [
  PRODUCTION_ORIGIN,
  "http://localhost:3456",
  "http://localhost:5173",
  "http://localhost:3000",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any): Promise<void> {
  const origin: string = req.headers["origin"] ?? "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : PRODUCTION_ORIGIN;
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { password } = req.body ?? {};
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || password !== adminPassword) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const redis = getRedis();
    const monthKey = MONTHLY_KEY();
    const [totalStr, monthlyStr] = await Promise.all([
      redis.get(COUNTER_KEY),
      redis.get(monthKey),
    ]);
    const monthlyImages = parseInt(monthlyStr ?? "0", 10);
    res.status(200).json({
      total: parseInt(totalStr ?? "0", 10),
      monthly: Math.ceil(monthlyImages / IMAGES_PER_GENERATION),
      monthlyLimit: getMonthlyGenerationLimit(),
    });
  } catch {
    res.status(500).json({ error: "Redis error" });
  }
}
