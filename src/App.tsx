import { useState, useEffect } from "react";
import { ImageUploader } from "./components/ImageUploader";
import { EventSelector } from "./components/EventSelector";
import { GeneratedImages } from "./components/GeneratedImages";
import { generateEventImage } from "./lib/hf";
import { EVENTS } from "./lib/events";
import { SALON } from "./lib/salonConfig";
import AdminPage from "./pages/AdminPage";
import type { EventId, GeneratedImage } from "./types";

const IMAGE_COUNT = 3;

// 背景の肉球装飾
const PAW_POSITIONS = [
  { left: "5%",  top: "3%",  rotate: 0   },
  { left: "80%", top: "7%",  rotate: 30  },
  { left: "20%", top: "15%", rotate: -20 },
  { left: "65%", top: "22%", rotate: 50  },
  { left: "10%", top: "35%", rotate: 15  },
  { left: "88%", top: "40%", rotate: -35 },
  { left: "40%", top: "50%", rotate: 25  },
  { left: "72%", top: "60%", rotate: -10 },
  { left: "15%", top: "68%", rotate: 40  },
  { left: "55%", top: "75%", rotate: -25 },
  { left: "85%", top: "82%", rotate: 10  },
  { left: "30%", top: "90%", rotate: -40 },
];

export default function App() {
  // /admin ルートを管理画面に振り分け
  if (window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/")) {
    return <AdminPage />;
  }

  return <PublicApp />;
}

function PublicApp() {
  const [dogImage, setDogImage] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventId | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [remainingCount, setRemainingCount] = useState<number | null>(null);
  const [genKey, setGenKey] = useState(0);

  const selectedEventConfig = EVENTS.find((e) => e.id === selectedEvent);

  useEffect(() => {
    fetch("/api/count")
      .then((r) => r.json())
      .then((d: { remaining: number | null }) => setRemainingCount(d.remaining))
      .catch(() => setRemainingCount(null));
  }, []);

  async function handleGenerate() {
    if (!dogImage || !selectedEventConfig) return;

    // すでに生成済み画像がある場合は確認
    const hasDone = generatedImages.some(img => img.status === "done");
    if (hasDone) {
      const ok = window.confirm("再生成しますか？\n現在の画像は消えます。");
      if (!ok) return;
    }

    setIsGenerating(true);
    setGenKey(k => k + 1);
    setGeneratedImages([]);

    const initial: GeneratedImage[] = Array.from({ length: IMAGE_COUNT }, (_, i) => ({
      data: "",
      index: i,
      status: "loading",
    }));
    setGeneratedImages(initial);

    const promises = Array.from({ length: IMAGE_COUNT }, async (_, i) => {
      try {
        const { dataUrl, remaining } = await generateEventImage(dogImage, selectedEventConfig, i);
        setGeneratedImages((prev) =>
          prev.map((img) =>
            img.index === i ? { ...img, data: dataUrl, status: "done" } : img
          )
        );
        if (remaining !== undefined) {
          setRemainingCount((prev) => prev === null ? remaining : Math.min(prev, remaining));
        }
      } catch (err) {
        console.error("[generate] error:", err);
        const message = err instanceof Error ? err.message : String(err) || "エラーが発生しました";
        setGeneratedImages((prev) =>
          prev.map((img) =>
            img.index === i ? { ...img, status: "error", error: message } : img
          )
        );
      }
    });

    await Promise.all(promises);
    setIsGenerating(false);
  }

  const canGenerate = !!dogImage && !!selectedEvent && !isGenerating;

  return (
    <div
      className="min-h-svh relative overflow-x-hidden"
      style={{ background: SALON.bgGradient }}
    >
      {/* 背景の絵文字装飾 */}
      <div className="fixed inset-0 pointer-events-none select-none" aria-hidden>
        {PAW_POSITIONS.map((pos, i) => (
          <span
            key={i}
            className="absolute opacity-[0.04] text-5xl"
            style={{ left: pos.left, top: pos.top, transform: `rotate(${pos.rotate}deg)`, color: SALON.primaryColor }}
          >
            {SALON.emoji}
          </span>
        ))}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5 relative">

        {/* ヘッダー */}
        <header className="flex flex-col items-center gap-2 pt-2">
          <div className="flex items-center justify-between w-full">
            <div className="w-14 shrink-0" />
            <div className="text-center">
              <h1 className="text-2xl font-black tracking-tight" style={{ color: SALON.primaryColor }}>{SALON.name}</h1>
              <div className="flex justify-center gap-0.5 mt-0.5 text-sm">
                <span>{SALON.emoji}</span><span>{SALON.emoji}</span><span>{SALON.emoji}</span>
              </div>
            </div>
            {/* 今月の残り生成回数バッジ */}
            <div className="rounded-2xl px-2 py-1.5 text-center shadow-lg w-14 shrink-0" style={{ background: SALON.badgeBg, color: SALON.badgeText }}>
              <p className="text-[10px] font-bold leading-tight opacity-80">今月残り</p>
              <p className="text-base font-black leading-tight">
                {remainingCount === null ? "…" : remainingCount.toLocaleString()}<span className="text-[10px] font-bold opacity-80">回</span>
              </p>
            </div>
          </div>
          <p className="text-xs text-center" style={{ color: SALON.secondaryColor }}>
            {SALON.tagline}
          </p>
        </header>

        {/* ステップ1: 画像アップロード */}
        <section className="bg-white/80 backdrop-blur-sm rounded-3xl p-5 shadow border-2" style={{ borderColor: SALON.borderColor }}>
          <h2 className="text-sm font-black mb-4 flex items-center gap-1.5" style={{ color: SALON.primaryColor }}>
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-black shrink-0" style={{ background: SALON.secondaryColor }}>1</span>
            わんこの写真をアップ 📸
          </h2>
          <div className="flex justify-center">
            <ImageUploader onImageSelected={setDogImage} currentImage={dogImage} />
          </div>
          <p className="mt-3 text-xs text-center bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2 text-amber-700">
            🐶 1匹で写っている写真が最もキレイに仕上がります<br />
            <span className="opacity-70">複数匹の場合、顔が変わる場合があります</span>
          </p>
        </section>

        {/* ステップ2: イベント選択 */}
        <section className="bg-white/80 backdrop-blur-sm rounded-3xl p-5 shadow border-2" style={{ borderColor: SALON.borderColor }}>
          <h2 className="text-sm font-black mb-4 flex items-center gap-1.5" style={{ color: SALON.primaryColor }}>
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-black shrink-0" style={{ background: SALON.secondaryColor }}>2</span>
            イベントを選ぼう 🎊
          </h2>
          <EventSelector
            events={EVENTS}
            selected={selectedEvent}
            onSelect={setSelectedEvent}
            disabled={isGenerating}
          />
        </section>

        {/* 生成ボタン */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full py-4 rounded-3xl font-black text-base text-white transition-all shadow-xl active:scale-95"
          style={canGenerate
            ? { background: SALON.buttonGradient }
            : { background: "#d6a96a", cursor: "not-allowed" }
          }
        >
          {isGenerating
            ? (
              <span className="inline-flex items-center justify-center gap-2">
                生成中... <span className="animate-dog-face">🐶</span>
              </span>
            )
            : selectedEventConfig
              ? `${SALON.emoji} ${selectedEventConfig.emoji} ${selectedEventConfig.label}の画像を生成 ${SALON.emoji}`
              : `${SALON.emoji} 画像を生成する ${SALON.emoji}`}
        </button>

        {/* 生成結果 */}
        {generatedImages.length > 0 && selectedEventConfig && (
          <section className="bg-white/80 backdrop-blur-sm rounded-3xl p-5 shadow border-2" style={{ borderColor: SALON.borderColor }}>
            <GeneratedImages
              key={genKey}
              images={generatedImages}
              eventLabel={selectedEventConfig.label}
            />
          </section>
        )}
      </div>
    </div>
  );
}
