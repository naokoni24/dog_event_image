import { GoogleGenAI } from "@google/genai";
import { getRedis, COUNTER_KEY, MONTHLY_KEY } from "./_redis.js";

// ── イベントプロンプト（src/lib/events.ts と同期して管理） ────────────────

// 枚目ごとに異なる表情・雰囲気の指示
const FACE = "この犬の顔・顔の形・目の形・鼻の形・口元・耳の形・毛の質感と色は元の写真と完全に同一の個体を維持してください。別の犬の顔に変えることは絶対に禁止。表情のみ変えることは許可します。写真に複数の犬が写っている場合は、それぞれの犬を個別の個体として認識し、各犬の顔・毛色・毛並みをそれぞれ元の写真のまま厳密に維持してください。";

const KEEPS = [
  // 1枚目：通常
  `この犬の犬種・毛並み・毛色・年齢感・顔立ちを完全にそのまま維持してください。${FACE}元の写真で犬が着ている服や洋服は生成画像では着せないでください。後ろ向きは禁止。全体的にかわいい雰囲気で仕上げてください。`,
  // 2枚目：通常
  `この犬の犬種・毛並み・毛色・年齢感・顔立ちを完全にそのまま維持してください。${FACE}元の写真で犬が着ている服や洋服は生成画像では着せないでください。後ろ向きは禁止。全体的にかわいい雰囲気で仕上げてください。`,
  // 3枚目：少し舌出し
  `この犬の犬種・毛並み・毛色・年齢感・顔立ちを完全にそのまま維持してください。${FACE}元の写真で犬が着ている服や洋服は生成画像では着せないでください。後ろ向きは禁止。口を少し開けて舌を少しだけ出した愛らしい表情にしてください。全体的にかわいい雰囲気で仕上げてください。`,
];

const STYLE = " 必ず実写写真風・高画質・自然な光・背景ぼかしで仕上げてください。CGイラスト・アニメ・漫画・デジタルアート・絵画調は絶対に禁止。";

// イベント固有のプロンプト（KEEP・STYLEは実行時に付加）
const EVENTS: Record<string, string[]> = {
  birthday: [
    "カラフルな誕生日パーティーハットをかぶり、ろうそくが灯ったバースデーケーキの前で嬉しそうにしている画像を生成してください。背景にカラフルな風船と紙吹雪を入れてください。",
    "誕生日の飾り付けがされた部屋でプレゼントの箱に囲まれてワクワクしている画像を生成してください。明るくパーティーらしい雰囲気にしてください。",
    "パステルカラーのバースデーケーキのそばでお祝いしているほのぼのとした画像を生成してください。誕生日らしい華やかな装飾を周囲に入れてください。",
  ],
  mothersday: [
    "たくさんのカーネーションの花束を口にくわえて、明るい春の庭でプレゼントしようとしている愛らしい画像を生成してください。パステルカラーの優しい雰囲気にしてください。",
    "花で飾られたリボンをつけて、ピンクのバラや花に囲まれた美しい庭でくつろいでいる優雅な画像を生成してください。",
    "「Happy Mother's Day」のメッセージカードの隣に座り、花とギフトボックスを囲んでいる心温まる画像を生成してください。",
  ],
  halloween: [
    "かぼちゃのコスチュームを着て、ジャック・オー・ランタンに囲まれた満月のハロウィンの夜にたたずんでいる神秘的な画像を生成してください。",
    "魔女の三角帽子と黒マントをまとって、お化け屋敷の前でポーズをとっているハロウィンらしい画像を生成してください。コウモリや蜘蛛の巣を背景に入れてください。",
    "ドラキュラのコスチュームを着て、トリックオアトリートのバケツを持ち、ハロウィンで飾られた玄関先に立っている可愛い画像を生成してください。",
  ],
  christmas: [
    "サンタクロースの赤い帽子とふわふわのマフラーを付けて、雪が降るクリスマスツリーの前でポーズをとっている可愛い画像を生成してください。",
    "トナカイのカチューシャをつけて、カラフルなクリスマスプレゼントの箱に囲まれている楽しそうな画像を生成してください。暖かみのある室内の雰囲気にしてください。",
    "エルフの緑の衣装を着て、暖炉のそばでクリスマスの靴下と一緒にくつろいでいる画像を生成してください。ほっこりとした雰囲気で。",
  ],
  newyear: [
    "赤と白の和柄の着物を着て、門松と鏡餅の前でお辞儀をしている日本のお正月らしい画像を生成してください。富士山と初日の出を背景に入れてください。",
    "神社の鳥居の前で凛とした表情でたたずんでいる、厳かで新年らしい画像を生成してください。",
    "羽子板・凧・だるまなどのお正月飾りに囲まれた和室でリラックスしている、ほのぼのとした新年の画像を生成してください。",
  ],
  valentine: [
    "赤いハートのネクタイをつけて、チョコレートの箱とバラの花束に囲まれたバレンタインらしい画像を生成してください。背景にハートをたくさん散りばめてください。",
    "ピンクのハートの飾りをつけて、チョコレートを差し出すようなポーズをとっているロマンチックなバレンタインデーの画像を生成してください。",
    "バレンタインデーのカードとチョコレートの前で愛らしく座っている画像を生成してください。パステルピンクと赤で統一した甘い雰囲気にしてください。",
  ],
  tsuyu: [
    "カラフルな雨合羽を着て、紫陽花の前で小さな傘を持っている梅雨らしい可愛い画像を生成してください。",
    "水たまりの前で長靴を履いて雨の中で楽しそうにしている画像を生成してください。背景に紫陽花と雨粒を入れてください。",
    "窓辺で雨を眺めながらくつろいでいるほのぼのとした梅雨の画像を生成してください。窓に雨粒がついた雨の日の室内の雰囲気にしてください。",
  ],
  natsumaturi: [
    "浴衣を着て、提灯が並ぶ夏祭りの夜店でたこ焼きやりんご飴に囲まれている楽しそうな画像を生成してください。",
    "夏祭りの法被を着て、大きな花火が打ち上がる夜空の下で嬉しそうにしている画像を生成してください。",
    "金魚すくいのたらいの前で浴衣を着て夏祭りを楽しんでいるかわいい画像を生成してください。提灯と屋台の明かりで賑やかな雰囲気にしてください。",
  ],
  resort: [
    "トロピカルなビーチリゾートで、透き通ったターコイズブルーの海とヤシの木を背景に、カラフルなビーチパラソルの下でサングラスをかけてリラックスしている画像を生成してください。南国の花やフルーツカクテルを周囲に添えてください。",
    "高級リゾートホテルのインフィニティプールの縁に座り、眼下に広がるエメラルドグリーンの海と晴れ渡る青空を背景にしている開放的な画像を生成してください。南国の植物とリゾート感あふれる明るい雰囲気にしてください。",
    "夕暮れ時の白い砂浜で、黄金色に輝く海とカラフルな夕焼けを背景に、花のレイを首にかけてトロピカルな雰囲気でくつろいでいる画像を生成してください。",
  ],
};

const VALID_EVENT_IDS = new Set(Object.keys(EVENTS));

// ── レートリミット（インスタンスごと in-memory） ──────────────────────────
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 15; // 1生成=3並列リクエスト × 5回分
const RATE_WINDOW = 60_000;

// ── 許可設定 ─────────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const PRODUCTION_ORIGIN = "https://dog-event-app.vercel.app";
const ALLOWED_ORIGINS = [
  PRODUCTION_ORIGIN,
  "http://localhost:3456",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getClientIP(headers: Record<string, string | string[] | undefined>): string {
  const fwd = headers["x-forwarded-for"];
  return (Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0]?.trim()) ?? "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any): Promise<void> {
  const origin: string = req.headers["origin"] ?? "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : PRODUCTION_ORIGIN;

  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  // 明示的に別ドメインからのリクエストを拒否（空＝同一オリジンは許可）
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // レートリミット
  const ip = getClientIP(req.headers);
  if (!checkRateLimit(ip)) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "リクエストが多すぎます。しばらく待ってから再試行してください。" });
    return;
  }

  // ── 入力値の検証 ──────────────────────────────────────────────────────
  const body = req.body ?? {};
  const { eventId, promptIndex, imageData, mimeType } = body;

  if (typeof eventId !== "string" || !VALID_EVENT_IDS.has(eventId)) {
    res.status(400).json({ error: "Invalid event ID" }); return;
  }
  if (typeof promptIndex !== "number" || !Number.isInteger(promptIndex) || promptIndex < 0 || promptIndex > 2) {
    res.status(400).json({ error: "Invalid prompt index" }); return;
  }
  if (typeof mimeType !== "string" || !ALLOWED_MIME.has(mimeType)) {
    res.status(400).json({ error: "Unsupported image type" }); return;
  }
  if (typeof imageData !== "string" || imageData.length === 0) {
    res.status(400).json({ error: "Missing image data" }); return;
  }
  if (Math.ceil(imageData.length * 0.75) > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: "画像サイズが大きすぎます（最大5MB）" }); return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "Server configuration error" }); return; }

  const prompts = EVENTS[eventId];
  if (!prompts) { res.status(400).json({ error: "Event not found" }); return; }

  const prompt = `${KEEPS[promptIndex]}${prompts[promptIndex]}${STYLE}`;

  // ── Gemini API 呼び出し（リトライあり） ──────────────────────────────
  const ai = new GoogleGenAI({ apiKey });
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 1000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: imageData } },
              { text: prompt },
            ],
          },
        ],
        config: { responseModalities: ["IMAGE"] },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          // 生成成功 → グローバル・月別カウンターをインクリメント
          let totalCount = 0;
          try {
            const redis = getRedis();
            const monthKey = MONTHLY_KEY();
            [totalCount] = await Promise.all([
              redis.incr(COUNTER_KEY),
              redis.incr(monthKey),
            ]);
          } catch { /* カウント失敗でも画像は返す */ }
          res.status(200).json({ data: part.inlineData.data, mimeType: part.inlineData.mimeType, totalCount });
          return;
        }
      }

      // 画像が返ってこなかった場合もリトライ
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }
      res.status(500).json({ error: "画像の生成に失敗しました。もう一度お試しください。" });
      return;

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[generate] attempt=${attempt} error:`, msg);
      const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate");

      if (attempt < MAX_RETRIES) {
        // レートリミット or 一時エラーはリトライ
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }

      const userMsg = isRateLimit
        ? "生成が混み合っています。少し待ってから再試行してください。"
        : `画像の生成に失敗しました。もう一度お試しください。`;
      res.status(500).json({ error: userMsg });
      return;
    }
  }
}
