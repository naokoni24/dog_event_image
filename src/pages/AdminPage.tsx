import { useState, useEffect } from "react";
import { ImageUploader } from "../components/ImageUploader";
import { EventSelector } from "../components/EventSelector";
import { GeneratedImages } from "../components/GeneratedImages";
import { generateEventImage } from "../lib/hf";
import { EVENTS } from "../lib/events";
import type { EventId, GeneratedImage } from "../types";

const IMAGE_COUNT = 3;
const MONTHLY_LIMIT = 300;
const SESSION_KEY = "admin_authed";
const PASSWORD_API = "/api/admin-stats";

// ── ログイン画面 ──────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (password: string) => Promise<boolean> }) {
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const ok = await onLogin(pw);
    setLoading(false);
    if (!ok) {
      setError("パスワードが正しくありません");
      setPw("");
    }
  }

  return (
    <div
      className="min-h-svh flex items-center justify-center px-4"
      style={{ background: "linear-gradient(160deg,#e0e7ff 0%,#c7d2fe 55%,#a5b4fc 100%)" }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 flex flex-col gap-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 mb-3">
            <span className="text-3xl">🔐</span>
          </div>
          <h1 className="text-xl font-black text-indigo-800">管理画面</h1>
          <p className="text-xs text-indigo-400 mt-1">スタッフ専用ページです</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="パスワードを入力"
            className="w-full border-2 border-indigo-200 rounded-2xl px-4 py-3 text-base text-indigo-900 placeholder-indigo-300 outline-none focus:border-indigo-400 transition-colors"
            autoFocus
          />
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
          <button
            type="submit"
            disabled={!pw || loading}
            className="w-full py-3 rounded-2xl text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#818cf8,#6366f1)" }}
          >
            {loading ? "確認中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── 月間統計バー ──────────────────────────────────────────────────────────
function StatsBar({ monthly, total }: { monthly: number; total: number }) {
  const pct = Math.min((monthly / MONTHLY_LIMIT) * 100, 100);
  const barColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f97316" : "#6366f1";

  return (
    <div className="bg-white rounded-3xl p-5 shadow border border-slate-200 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-700 flex items-center gap-1.5">
          <span className="text-base">📊</span> 月間生成数
        </h2>
        <span className="text-xs text-slate-400">累計 {total.toLocaleString()} 枚</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="text-3xl font-black" style={{ color: barColor }}>{monthly.toLocaleString()}</span>
          <span className="text-sm text-slate-400 ml-1">/ {MONTHLY_LIMIT.toLocaleString()} 回</span>
        </div>
        <span className="text-xs font-bold rounded-full px-2 py-0.5" style={{ background: barColor + "18", color: barColor }}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <p className="text-xs text-slate-400">
        残り <strong className="text-slate-600">{Math.max(MONTHLY_LIMIT - monthly, 0).toLocaleString()}</strong> 回
      </p>
    </div>
  );
}

// ── 管理画面メイン ────────────────────────────────────────────────────────
function AdminMain({ password, onLogout }: { password: string; onLogout: () => void }) {
  const [stats, setStats] = useState<{ monthly: number; total: number } | null>(null);
  const [dogImage, setDogImage] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventId | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genKey, setGenKey] = useState(0);
  const selectedEventConfig = EVENTS.find((e) => e.id === selectedEvent);

  async function fetchStats() {
    try {
      const r = await fetch("/api/admin-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (r.ok) {
        const d = await r.json() as { monthly: number; total: number };
        setStats(d);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY);
    onLogout();
  }

  async function handleGenerate() {
    if (!dogImage || !selectedEventConfig) return;

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
        const { dataUrl } = await generateEventImage(dogImage, selectedEventConfig, i);
        setGeneratedImages((prev) =>
          prev.map((img) =>
            img.index === i ? { ...img, data: dataUrl, status: "done" } : img
          )
        );
      } catch (err) {
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
    fetchStats();
  }

  const canGenerate = !!dogImage && !!selectedEvent && !isGenerating;

  return (
    <div className="min-h-svh overflow-x-hidden" style={{ background: "linear-gradient(160deg,#e0e7ff 0%,#eef2ff 60%,#f5f3ff 100%)" }}>
      {/* ヘッダー */}
      <header
        className="px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm"
        style={{ background: "linear-gradient(90deg,#6366f1,#818cf8)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">🛠️</span>
          <div>
            <h1 className="text-sm font-black text-white leading-tight">管理画面</h1>
            <p className="text-[10px] text-indigo-300 leading-tight">Staff Only</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-indigo-200 hover:text-white border border-indigo-400/50 hover:border-indigo-300 rounded-xl px-3 py-1.5 transition-colors"
        >
          ログアウト
        </button>
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 flex flex-col gap-4">

        {/* 月間統計 */}
        {stats ? (
          <StatsBar monthly={stats.monthly} total={stats.total} />
        ) : (
          <div className="bg-white rounded-3xl p-5 shadow border border-slate-200 animate-pulse h-36" />
        )}

        {/* スタッフモードバナー */}
        <div
          className="rounded-2xl px-4 py-2.5 border flex items-center gap-2"
          style={{ background: "#eef2ff", borderColor: "#c7d2fe" }}
        >
          <span className="text-base">👨‍💼</span>
          <div>
            <p className="text-xs font-bold text-indigo-700">スタッフ代行生成モード</p>
            <p className="text-[11px] text-indigo-500 mt-0.5">回数制限なし・生成結果はお客様にシェアしてください</p>
          </div>
        </div>

        {/* ステップ1: 画像アップロード */}
        <section className="bg-white rounded-3xl p-5 shadow border border-slate-200">
          <h2 className="text-sm font-black mb-3 flex items-center gap-1.5 text-slate-700">
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-black shrink-0"
              style={{ background: "#4f46e5" }}
            >1</span>
            わんこの写真をアップ 📸
          </h2>

          <div className="flex justify-center">
            <ImageUploader onImageSelected={setDogImage} currentImage={dogImage} />
          </div>
        </section>

        {/* ステップ2: イベント選択 */}
        <section className="bg-white rounded-3xl p-5 shadow border border-slate-200">
          <h2 className="text-sm font-black mb-4 flex items-center gap-1.5 text-slate-700">
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-black shrink-0"
              style={{ background: "#4f46e5" }}
            >2</span>
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
            ? { background: "linear-gradient(135deg,#6366f1,#4338ca)" }
            : { background: "#a5b4fc", cursor: "not-allowed" }
          }
        >
          {isGenerating
            ? "生成中... ⏳"
            : selectedEventConfig
              ? `✨ ${selectedEventConfig.emoji} ${selectedEventConfig.label}の画像を生成`
              : "✨ 画像を生成する"}
        </button>

        {/* 生成結果 */}
        {generatedImages.length > 0 && selectedEventConfig && (
          <section className="bg-white rounded-3xl p-5 shadow border border-slate-200">
            <GeneratedImages
              key={genKey}
              images={generatedImages}
              eventLabel={selectedEventConfig.label}
            />
          </section>
        )}

        <p className="text-center text-xs text-slate-300 pb-4">Admin Panel · わんこイベント日和</p>
      </div>
    </div>
  );
}

// ── ページエントリー ──────────────────────────────────────────────────────
export default function AdminPage() {
  const [password, setPassword] = useState<string | null>(
    sessionStorage.getItem(SESSION_KEY)
  );

  async function handleLogin(pw: string): Promise<boolean> {
    try {
      const r = await fetch(PASSWORD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (r.ok) {
        sessionStorage.setItem(SESSION_KEY, pw);
        setPassword(pw);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  if (!password) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <AdminMain password={password} onLogout={() => setPassword(null)} />;
}
