import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import type { GeneratedImage } from "../types";
import { SALON } from "../lib/salonConfig";

interface Props {
  images: GeneratedImage[];
  eventLabel: string;
  onSaved?: () => void;
}

async function downloadImage(dataUrl: string, index: number, label: string) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${label}_${index + 1}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function LoadingCard() {
  return (
    <div className="aspect-square rounded-2xl bg-amber-50 border-2 border-amber-200 flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-4 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
      <p className="text-sm text-amber-700">生成中...</p>
    </div>
  );
}

// Canvasでウォーターマークを画像に焼き込む
function useWatermarked(dataUrl: string): string | null {
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const text = SALON.watermarkText;
      const fontSize = Math.max(14, Math.floor(img.width / 16));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.save();
      ctx.translate(img.width / 2, img.height / 2);
      ctx.rotate(-Math.PI / 6);
      const lineH = fontSize * 3;
      for (let r = -4; r <= 4; r++) {
        for (let c = -2; c <= 2; c++) {
          const x = c * img.width * 0.65 - ctx.measureText(text).width / 2;
          const y = r * lineH;
          ctx.strokeStyle = "rgba(0,0,0,0.2)";
          ctx.lineWidth = 2;
          ctx.strokeText(text, x, y);
          ctx.fillStyle = "rgba(255,255,255,0.3)";
          ctx.fillText(text, x, y);
        }
      }
      ctx.restore();
      setResult(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = dataUrl;
  }, [dataUrl]);
  return result;
}

// ウォーターマーク付きモーダル
function WatermarkModal({ dataUrl, onClose }: { dataUrl: string; onClose: () => void }) {
  const watermarked = useWatermarked(dataUrl);

  // onPointerDownで閉じると指を離したイベントが下の要素に届くため、
  // 少し遅延させてタッチイベントが完了してから閉じる
  const handleClose = (e: React.PointerEvent) => {
    e.stopPropagation();
    setTimeout(onClose, 150);
  };

  // backdrop-blur等の親要素がfixedの基準をずらすため、createPortalでdocument.body直下に描画
  return createPortal(
    <div className="fixed inset-0 z-50" onPointerDown={handleClose}>
      <div className="w-full h-full flex items-center justify-center">
        {/* 画像コンテナ：relative にして✕ボタンを画像右上に重ねる */}
        <div
          className="relative rounded-2xl overflow-visible shadow-2xl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <img
            src={watermarked ?? dataUrl}
            alt="生成画像"
            className="block rounded-2xl overflow-hidden"
            style={{ maxWidth: "100vw", maxHeight: "100svh", width: "auto", height: "auto" }}
            draggable={false}
          />
          {/* ✕ボタン：画像の内側右上に表示 */}
          <button
            onPointerDown={handleClose}
            className="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/60 text-white text-lg font-bold flex items-center justify-center active:bg-black/80 shadow-lg"
          >
            ✕
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function GeneratedImages({ images, eventLabel, onSaved }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [watermarkData, setWatermarkData] = useState<string | null>(null);
  const longPressTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  if (images.length === 0) return null;

  const doneImages = images.filter((img) => img.status === "done");
  const selectedImages = doneImages.filter((img) => selected.has(img.index));
  const hasSelection = selectedImages.length > 0;

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleTouchStart(index: number, dataUrl: string) {
    const timer = setTimeout(() => {
      setWatermarkData(dataUrl);
      longPressTimers.current.delete(index);
    }, 600);
    longPressTimers.current.set(index, timer);
  }

  function handleTouchEnd(index: number) {
    const timer = longPressTimers.current.get(index);
    if (timer) {
      clearTimeout(timer);
      longPressTimers.current.delete(index);
    }
  }

  async function handleDownload() {
    const files = await Promise.all(
      selectedImages.map(async (img) => {
        const res = await fetch(img.data);
        const blob = await res.blob();
        return new File([blob], `${eventLabel}_${img.index + 1}.png`, { type: blob.type });
      })
    );

    if (onSaved) onSaved();

    // モバイル：Web Share API で複数ファイルをまとめて渡す（写真アプリへ保存可）
    if (files.length > 1 && navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files, title: `わんこイベント - ${eventLabel}` });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    // 1枚：直接ダウンロード
    if (files.length === 1) {
      await downloadImage(selectedImages[0].data, selectedImages[0].index, eventLabel);
      return;
    }

    // PC複数枚：ZIP
    const zip = new JSZip();
    files.forEach((file, i) => zip.file(`${eventLabel}_${selectedImages[i].index + 1}.png`, file));
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${eventLabel}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {watermarkData && (
        <WatermarkModal dataUrl={watermarkData} onClose={() => setWatermarkData(null)} />
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-amber-900 text-center">
          生成された画像
        </h2>
        {doneImages.length > 0 && (
          <p className="text-xs text-amber-600 text-center">
            タップで選択 / 長押しでプレビュー
          </p>
        )}

        {/* 画像グリッド */}
        <div className="grid grid-cols-3 gap-3">
          {images.map((img) => (
            <div key={img.index}>
              {img.status === "loading" && <LoadingCard />}
              {img.status === "done" && (
                <div
                  onClick={() => toggleSelect(img.index)}
                  onTouchStart={() => handleTouchStart(img.index, img.data)}
                  onTouchEnd={() => handleTouchEnd(img.index)}
                  onTouchMove={() => handleTouchEnd(img.index)}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`
                    relative aspect-square rounded-2xl overflow-hidden cursor-pointer transition-all select-none
                    ${selected.has(img.index)
                      ? "ring-4 ring-amber-500 scale-105 shadow-lg"
                      : "ring-2 ring-amber-200 hover:ring-amber-400"
                    }
                  `}
                >
                  <img
                    src={img.data}
                    alt={`${eventLabel} ${img.index + 1}`}
                    className="w-full h-full object-cover pointer-events-none"
                    draggable={false}
                    style={{ WebkitTouchCallout: "none" } as React.CSSProperties}
                  />
                  <div className={`
                    absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center shadow transition-all
                    ${selected.has(img.index)
                      ? "bg-amber-500 opacity-100"
                      : "bg-white/60 opacity-60"
                    }
                  `}>
                    <span className={`text-xs font-bold ${selected.has(img.index) ? "text-white" : "text-amber-400"}`}>
                      {selected.has(img.index) ? "✓" : "○"}
                    </span>
                  </div>
                </div>
              )}
              {img.status === "error" && (
                <div className="aspect-square rounded-2xl bg-red-50 border-2 border-red-200 flex flex-col items-center justify-center gap-1 p-2">
                  <span className="text-xl">⚠️</span>
                  <p className="text-xs text-red-600 text-center">{img.error ?? "失敗"}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 保存ボタン */}
        <button
          onClick={handleDownload}
          disabled={!hasSelection}
          className={`w-full py-3 rounded-2xl text-white text-sm font-medium transition-all
            ${hasSelection
              ? "bg-amber-600 hover:bg-amber-700 active:scale-95 shadow-md"
              : "bg-amber-200 cursor-not-allowed"
            }`}
        >
          ⬇ 保存{hasSelection && selectedImages.length > 1 ? `（${selectedImages.length}枚）` : ""}
        </button>
      </div>
    </>
  );
}
