import { GoogleGenAI } from "@google/genai";
import type { EventConfig } from "../types";

const MODEL = "gemini-3.1-flash-image-preview";

function getClient(): GoogleGenAI {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error("VITE_GEMINI_API_KEY が設定されていません");
  return new GoogleGenAI({ apiKey: key });
}

function toBase64(dataUrl: string): { mimeType: string; data: string } {
  const [header, data] = dataUrl.split(",");
  const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  return { mimeType, data };
}

export async function generateEventImage(
  dogImageDataUrl: string,
  event: EventConfig,
  promptIndex: number
): Promise<string> {
  const ai = getClient();
  const { mimeType, data } = toBase64(dogImageDataUrl);
  const prompt = event.prompts[promptIndex];

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseModalities: ["IMAGE"],
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("画像の生成に失敗しました");
}
