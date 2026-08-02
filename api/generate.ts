import OpenAI, { toFile } from "openai";
import { getMonthlyGenerationLimit, getRedis, COUNTER_KEY, IMAGES_PER_GENERATION, MONTHLY_KEY } from "./_redis.js";

// ── イベントプロンプト（生成の実体）────────────────────────────────────────
//    実際の生成プロンプトはここで組み立てる。フロントの src/lib/events.ts は
//    UI 表示用の定義で、生成には使われない（混同しないこと）。

// これは「新規生成」ではなく「元写真の編集」であることを最初に宣言する。
// モデルは前方のトークンを強く重視するため、識別維持の核を冒頭に置く。
const EDIT = "これは画像編集タスクです。アップロードされた元の写真に写っている犬本人を、顔と頭部をそのまま使ってください。新しい犬を生成したり、別の犬の顔に置き換えたりすることは絶対に禁止です。変更してよいのは衣装・小物・背景・装飾・ポーズ・表情だけで、犬の顔そのものは元写真のまま固定します。体全体の毛並み（毛の長さ・毛流れ・巻き方・質感・色柄の分布）も元の写真から一切変化させないでください。元の写真に人物が写っている場合は、顔や全身だけでなく手・腕・足などの体の一部だけが写っている場合も含めて、生成画像にはその人物を一切含めず、犬だけが写るようにしてください。犬の体型・プロポーション（脚の長さ、胴の長さ、体全体の大きさのバランス、頭と体の比率）も元の写真の個体のまま維持し、太らせたり痩せさせたり、脚を長く/短くしたり、体格を変えたりすることは絶対に禁止です。元の写真に写っている犬の頭数を変えず、複製や追加によって元写真より増やさないでください。";

// 枚目ごとに異なる表情・雰囲気の指示
const FACE = "顔・顔の形・目の形と間隔・鼻の形と大きさ・口元・マズルの長さと丸み・耳の形と位置、および顔まわりの毛（目の周り・鼻周り・口元・耳周りの毛の長さ・カール具合・毛束感・色の濃淡）を、元の写真とまったく同じになるよう厳密に維持してください。特に茶色のトイプードルでは、一般的・テディベア風の整ったプードル顔に寄せてはいけません。元写真の顔のバランス、毛色の濃淡、巻き毛の密度、目鼻の位置をそのまま残してください。顔立ちの美化・若返り・小顔化・目の拡大などの補正は一切しないでください。表情だけはわずかに変えて構いません。写真に複数の犬が写っている場合は、それぞれを別個体として認識し、各犬の顔・毛色・毛並みをそれぞれ元の写真のまま維持してください。";

// 衣装や小物に合わせてポーズを変える際も、四肢の重複や擬人化を防ぐ。
// 特に「持つ」という指示は前足を人間の腕・手のように生成しやすいため、
// 小物は口元・足元・犬の横に自然に配置させる。
const ANATOMY = "犬の解剖学的な正しさを最優先してください。犬1匹につき脚は必ず合計4本だけとし、前脚2本・後ろ脚2本以外の脚、余分な足先、途中から分岐した脚、体につながっていない足を絶対に生成しないでください。画面外や衣装の内側に隠れて見えない脚があっても構いません。見えているすべての脚は肩または腰から足先まで自然につながり、左右の位置と関節の向きが犬として正しくなるようにしてください。前足を人間の腕や手のように変形させたり、小物を握らせたりしないでください。小物は犬の口元・足元・体の横に自然に配置し、四肢を追加して持たせる表現は禁止です。生成を完了する前に、犬ごとの脚と足先を数え、合計4本を超えていないことと重複・融合・分岐がないことを確認してください。";

// 全イベント共通の構図指示。イベント文中の後方に置くと前方の識別系指示に埋もれるため、
// 前方寄りのKEEPSに置いて遵守率を上げる。
const FRAMING = "構図は犬の頭頂・耳先から胴体、そして自然に見えている足先までの全身を画面内に収め、四辺に十分な余白を残してください。衣装や姿勢で隠れている脚は無理に描き足さないでください。顔や体を大きく切り取る接写、耳・頭・胴体・見えている足先が画面外へ切れる構図は絶対に禁止です。元の写真に複数の犬がいる場合は、すべての犬の全身を画面内に収めてください。";

const KEEPS = [
  // 1枚目：通常
  `${EDIT}${ANATOMY}${FRAMING}犬種・毛並み・毛色・年齢感・顔立ちは完全にそのまま維持してください。${FACE}元の写真で犬が着ている服や洋服は生成画像では着せないでください。後ろ向きは禁止。全体的にかわいい雰囲気で仕上げてください。ここまでの指示は犬本体（顔・毛並み・毛色・体型）を維持するためのものです。これから指定する衣装・小道具・背景・演出は、控えめにせず必ずはっきりと分かるように反映させてください。`,
  // 2枚目：通常
  `${EDIT}${ANATOMY}${FRAMING}犬種・毛並み・毛色・年齢感・顔立ちは完全にそのまま維持してください。${FACE}元の写真で犬が着ている服や洋服は生成画像では着せないでください。後ろ向きは禁止。全体的にかわいい雰囲気で仕上げてください。ここまでの指示は犬本体（顔・毛並み・毛色・体型）を維持するためのものです。これから指定する衣装・小道具・背景・演出は、控えめにせず必ずはっきりと分かるように反映させてください。`,
  // 3枚目：少し舌出し
  `${EDIT}${ANATOMY}${FRAMING}犬種・毛並み・毛色・年齢感・顔立ちは完全にそのまま維持してください。${FACE}元の写真で犬が着ている服や洋服は生成画像では着せないでください。後ろ向きは禁止。口を少し開けて舌を少しだけ出した愛らしい表情にしてください。全体的にかわいい雰囲気で仕上げてください。ここまでの指示は犬本体（顔・毛並み・毛色・体型）を維持するためのものです。これから指定する衣装・小道具・背景・演出は、控えめにせず必ずはっきりと分かるように反映させてください。`,
];

const STYLE = " 必ず実写写真風・高画質・自然な光・背景ぼかしで仕上げてください。CGイラスト・アニメ・漫画・デジタルアート・絵画調は絶対に禁止。";

const ZODIAC = [
  "ねずみ", "うし", "とら", "うさぎ", "たつ", "へび",
  "うま", "ひつじ", "さる", "とり", "いぬ", "いのしし",
] as const;

function getCurrentDateContext(): {
  dateInstruction: string;
  newYearInstruction: string;
  zodiacMainInstruction: string;
} {
  const now = new Date();
  const yearPart = new Intl.DateTimeFormat("ja-JP-u-ca-gregory", { timeZone: "Asia/Tokyo", year: "numeric" })
    .formatToParts(now)
    .find((part) => part.type === "year");
  const currentYear = Number(yearPart?.value);
  const zodiac = ZODIAC[((currentYear - 2020) % ZODIAC.length + ZODIAC.length) % ZODIAC.length];

  return {
    dateInstruction: "画像内に西暦・和暦・日付・曜日・カレンダー・年賀状・バナーなど時期を示す文字や数字は一切描かないでください。",
    newYearInstruction: `お正月の画像では、今年の干支である${zodiac}を、自然な動物または文字のない素朴な置物として必ず1つ取り入れ、別の年の干支は入れないでください。画像内には年号や干支名を含む読める文字・数字・記号・ロゴを一切描かず、絵馬・札・看板・衣装・胸当て・メダル・置物・台座も無地または日本の伝統文様だけにしてください。全体は畳・障子・自然な木・神社の鳥居・門松・鏡餅・しめ縄・紅白の水引・和紙を用いた、落ち着いた日本のお正月にしてください。春節の赤提灯・丸い吊り飾り・中国結び・過剰な赤金装飾・中国風建築・中国式の龍舞や獅子舞・干支の赤金の胸当てや鞍など、中国の春節に見える要素は禁止です。`,
    zodiacMainInstruction: `この画像は、お正月の3枚のうち干支が主役の1枚です。${zodiac}の動物または文字のない素朴な置物を画面で最も目立つ主役にし、日本の正月飾りと調和する構図にしてください。アップロードされた犬本人も、干支の主役を引き立てる位置に自然に一緒に写してください。犬を${zodiac}に置き換えたり、犬の顔・毛並み・体型を変えたりすることは絶対に禁止です。`,
  };
}

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
    "立体感のある上質なオレンジ色のかぼちゃコスチュームを自然に着て、夕暮れのかぼちゃ畑で大小のジャック・オー・ランタンに囲まれたハロウィンのペットポートレートを生成してください。犬の顔を画面の主役にし、ランタンの暖かな光を正面斜めから、満月の淡い青い光を輪郭に当て、瞳の自然なキャッチライトと一本一本の毛並みが明るく精細に見えるようにしてください。背景は紺色とオレンジ色で奥行きを出し、装飾を詰め込みすぎず、読める文字・数字・ロゴは入れないでください。",
    "目や顔を隠さないサイズの魔女の三角帽子と、質感の分かる黒いベルベットのマントを自然に着たハロウィンのペットポートレートを生成してください。背景は西洋ゴシック様式のお化け屋敷、紫と濃紺の夜空、控えめなコウモリと蜘蛛の巣、地面付近の薄い霧にしてください。暖かな窓明かりで犬の顔と毛並みを明るく照らし、月光の縁取り光と瞳の自然なキャッチライトを加え、怖すぎず上品で可愛い映画のワンシーンのようにしてください。読める文字・数字・ロゴは入れないでください。",
    "深いワインレッドのベルベットのマントと白い襟を自然に着た、上品で可愛いドラキュラ風のハロウィンのペットポートレートを生成してください。背景はビクトリア調の玄関先とし、彫刻したかぼちゃ、暖かなキャンドル、少量の落ち葉をバランスよく配置してください。トリックオアトリートのバケツは犬に持たせず前足の横に置いてください。犬の顔を暖かな光で明るく見せ、瞳の自然なキャッチライト、マントの布地、元の毛並みを精細に表現し、背景は柔らかくぼかしてください。玄関脇の小さな木製看板1枚だけに、英語の「Happy Halloween」をこの綴りと大文字・小文字のまま正確に1回だけ、はっきり読めるように表示してください。それ以外の文字・数字・ロゴは入れず、人物や人の手も入れないでください。",
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
    "ピンクのハートの飾りをつけて、前足のそばにチョコレートを置いて自然に座っているロマンチックなバレンタインデーの画像を生成してください。",
    "バレンタインデーのカードとチョコレートの前で愛らしく座っている画像を生成してください。パステルピンクと赤で統一した甘い雰囲気にしてください。",
  ],
  tsuyu: [
    "カラフルな雨合羽を着て、紫陽花の前に自然に座っている梅雨らしい可愛い画像を生成してください。開いた小さな傘は犬に持たせず、犬の体の横に自立するよう自然に配置してください。",
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

// ── レートリミット ────────────────────────────────────────────────────────
// Redis（全インスタンス共通）で固定ウィンドウ制限。サーバレスは複数インスタンスが
// 並走するため in-memory だけでは上限をすり抜けられる。Redis 障害時のみ
// in-memory（インスタンスごと）へフォールバックして保護を完全には失わない。
const RATE_LIMIT = 15; // 1生成=3並列リクエスト × 5回分
const RATE_WINDOW = 60_000;
const RATE_WINDOW_SEC = RATE_WINDOW / 1000;

const rateMap = new Map<string, { count: number; resetAt: number }>();

// ── 許可設定 ─────────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp",
]);
// JSON内でBase64化されるため、Vercelのリクエスト本文上限を超えない値にする。
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

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

function checkRateLimitMemory(ip: string): boolean {
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

async function checkRateLimit(ip: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `wanko_rl:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_WINDOW_SEC);
    return count <= RATE_LIMIT;
  } catch {
    // Redis 障害時は in-memory にフォールバック
    return checkRateLimitMemory(ip);
  }
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
  if (!(await checkRateLimit(ip))) {
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
    res.status(413).json({ error: "画像サイズが大きすぎます（最大3MB）" }); return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "Server configuration error" }); return; }

  const prompts = EVENTS[eventId];
  if (!prompts) { res.status(400).json({ error: "Event not found" }); return; }

  // ── 月次上限チェック ─────────────────────────────────────────────────
  // remainingはこれまで表示専用で、上限到達後も生成・課金が続いてしまっていたため、
  // OpenAI呼び出し前にブロックする（Redis障害時はブロックせず可用性を優先）。
  try {
    const redis = getRedis();
    const monthlyCount = Number.parseInt((await redis.get(MONTHLY_KEY())) ?? "0", 10);
    const usedGenerations = Math.ceil(monthlyCount / IMAGES_PER_GENERATION);
    if (usedGenerations >= getMonthlyGenerationLimit()) {
      res.status(429).json({ error: "生成回数の上限に達しました。", remaining: 0 });
      return;
    }
  } catch { /* Redis障害時はブロックしない */ }

  const dateContext = getCurrentDateContext();
  const eventContextInstruction = eventId === "newyear"
    ? `${dateContext.newYearInstruction}${promptIndex === 2 ? dateContext.zodiacMainInstruction : ""}`
    : dateContext.dateInstruction;
  const prompt = `${KEEPS[promptIndex]}${eventContextInstruction}${prompts[promptIndex]}${STYLE}`;

  // ── OpenAI API 呼び出し（リトライあり） ──────────────────────────────
  // gpt-image-2(low)の実測レイテンシが25秒を超えるケースが多く、
  // 前回の25秒設定では2回とも必ずタイムアウトしていた。
  // vercel.jsonのmaxDurationを300秒に引き上げた上で、1回あたり90秒の
  // 余裕を持たせる（SDK自体のデフォルトリトライ・タイムアウトは無効化し、
  // こちらの外側リトライループと二重に重ならないようにする）。
  const openai = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 0 });
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 1000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const image = await toFile(Buffer.from(imageData, "base64"), "photo.jpg", { type: mimeType });

      const response = await openai.images.edit({
        // gpt-image-2はinput_fidelityを変更できず常に高忠実度で処理するため、
        // ポーズ・構図が元写真からほぼ変わらない問題が発生した。
        // gpt-image-1.5はinput_fidelity: "low"でより自由に変化させられる。
        model: "gpt-image-1.5",
        image,
        prompt,
        // low: 速度・コスト優先の最安ティア（画質は無印より下がる）
        quality: "low",
        // ポーズ・構図・背景を元写真に縛られず変化させるための設定
        input_fidelity: "low",
        // 正方形に固定（横長・縦長はコストが上がるため）
        size: "1024x1024",
      });

      const result = response.data?.[0];
      if (result?.b64_json) {
        // 生成成功 → グローバル・月別カウンターをインクリメント
        let remaining: number | undefined;
        try {
          const redis = getRedis();
          const monthKey = MONTHLY_KEY();
          const [, monthlyCount] = await Promise.all([
            redis.incr(COUNTER_KEY),
            redis.incr(monthKey),
          ]);
          const usedGenerations = Math.ceil(monthlyCount / IMAGES_PER_GENERATION);
          remaining = Math.max(0, getMonthlyGenerationLimit() - usedGenerations);
        } catch { /* カウント失敗でも画像は返す */ }
        const outputFormat = response.output_format ?? "png";
        res.status(200).json({ data: result.b64_json, mimeType: `image/${outputFormat}`, remaining });
        return;
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
      const status = (err as { status?: number })?.status;
      console.error(`[generate] attempt=${attempt} error:`, msg);
      const isRateLimit = status === 429 || msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate");

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
