export interface SalonConfig {
  name: string;
  tagline: string;
  emoji: string;
  watermarkText: string;
  primaryColor: string;
  secondaryColor: string;
  bgGradient: string;
  borderColor: string;
  textColor: string;
  badgeBg: string;
  badgeText: string;
  buttonGradient: string;
}

// ── デフォルト（わんこイベント日和） ────────────────────────────────────
export const DEFAULT_CONFIG: SalonConfig = {
  name: "わんこイベント日和",
  tagline: "愛犬の写真をイベント画像に変換しよう🎉",
  emoji: "🐾",
  watermarkText: "🐾 わんこイベント日和 🐾",
  primaryColor: "#92400e",
  secondaryColor: "#b45309",
  bgGradient: "linear-gradient(160deg,#fff7ed 0%,#fef3c7 55%,#fde68a 100%)",
  borderColor: "#fde68a",
  textColor: "#92400e",
  badgeBg: "#92400e",
  badgeText: "#fffbeb",
  buttonGradient: "linear-gradient(135deg,#d97706,#b45309)",
};

// ── サンプル：Fluffy トリミングサロン ────────────────────────────────────
export const FLUFFY_CONFIG: SalonConfig = {
  name: "Fluffy トリミングサロン",
  tagline: "トリミング後の愛犬を特別な1枚に✂️",
  emoji: "✂️",
  watermarkText: "✂️ Fluffy トリミングサロン ✂️",
  primaryColor: "#9d174d",
  secondaryColor: "#be185d",
  bgGradient: "linear-gradient(160deg,#fff0f6 0%,#fce7f3 55%,#fbcfe8 100%)",
  borderColor: "#fbcfe8",
  textColor: "#9d174d",
  badgeBg: "#9d174d",
  badgeText: "#fdf2f8",
  buttonGradient: "linear-gradient(135deg,#ec4899,#be185d)",
};

// ── 使用するサロン設定をここで切り替え ──────────────────────────────────
// export const SALON = FLUFFY_CONFIG;
export const SALON = DEFAULT_CONFIG;
