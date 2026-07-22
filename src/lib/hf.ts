import type { EventConfig } from "../types";

const MAX_SIZE = 1024; // px
const JPEG_QUALITY = 0.85;
const MAX_BYTES = 3 * 1024 * 1024; // 3MB（Vercelの4.5MB制限に余裕を持たせる）
const FALLBACK_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
]);

function getOriginalImage(dataUrl: string): { base64: string; mimeType: string } {
  const [header, base64] = dataUrl.split(",");
  const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  if (!FALLBACK_MIME_TYPES.has(mimeType)) {
    throw new Error("画像を読み込めませんでした。JPEG・PNG・WebP画像を選んでください。");
  }
  if (!base64 || Math.ceil(base64.length * 0.75) > MAX_BYTES) {
    throw new Error("画像を読み込めませんでした。3MB以下のJPEG・PNG・WebP画像を選んでください。");
  }
  return { base64, mimeType };
}

async function compressImage(dataUrl: string): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;

        // リサイズ（長辺をMAX_SIZE以内に）
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          } else {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);

        // まずJPEGで圧縮
        let quality = JPEG_QUALITY;
        let base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];

        // それでも大きければ品質を下げる
        while (Math.ceil(base64.length * 0.75) > MAX_BYTES && quality > 0.4) {
          quality -= 0.1;
          base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
        }

        resolve({ base64, mimeType: "image/jpeg" });
      } catch {
        try { resolve(getOriginalImage(dataUrl)); } catch (error) { reject(error); }
      }
    };
    img.onerror = () => {
      try { resolve(getOriginalImage(dataUrl)); } catch (error) { reject(error); }
    };
    img.src = dataUrl;
  });
}

export async function generateEventImage(
  dogImageDataUrl: string,
  event: EventConfig,
  promptIndex: number
): Promise<{ dataUrl: string; totalCount?: number }> {
  const { base64: imageData, mimeType } = await compressImage(dogImageDataUrl);

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: event.id,
      promptIndex,
      imageData,
      mimeType,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let message = `HTTP ${response.status}`;
    try {
      const err = JSON.parse(text) as { error?: unknown };
      if (typeof err.error === "string") {
        message = err.error;
      } else if (err.error && typeof err.error === "object") {
        const nested = err.error as { message?: string };
        message = nested.message ?? message;
      } else if (text) {
        message += `: ${text.slice(0, 100)}`;
      }
    } catch {
      if (text) message += `: ${text.slice(0, 100)}`;
    }
    throw new Error(message);
  }

  const result = (await response.json()) as { data: string; mimeType: string; totalCount?: number };
  return {
    dataUrl: `data:${result.mimeType};base64,${result.data}`,
    totalCount: result.totalCount,
  };
}
