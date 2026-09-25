import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import es from "./locales/es.json";

export const SUPPORTED_LANGUAGES = ["en", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANG_KEY = "splitit.lang";

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  // Always starts in English for both the server render and the first client
  // paint, so hydration never has to reconcile two different languages.
  // `applyDetectedLanguage()` corrects it right after mount (client-only).
  lng: "en",
  fallbackLng: "en",
  supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
  interpolation: { escapeValue: false },
  returnNull: false,
});

function isSupported(value: string | null | undefined): value is SupportedLanguage {
  return value === "en" || value === "es";
}

/** Reads the saved preference, or falls back to the browser's language. Client-only. */
export function detectPreferredLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LANG_KEY);
  if (isSupported(stored)) return stored;
  const browserLang = window.navigator.language?.slice(0, 2).toLowerCase();
  return isSupported(browserLang) ? browserLang : "en";
}

/** Call once, client-side, after mount — never during SSR or the first render. */
export function applyDetectedLanguage(): void {
  const lang = detectPreferredLanguage();
  if (lang !== i18n.language) void i18n.changeLanguage(lang);
  document.documentElement.setAttribute("lang", lang);
}

export function setLanguage(lang: SupportedLanguage): void {
  void i18n.changeLanguage(lang);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANG_KEY, lang);
    document.documentElement.setAttribute("lang", lang);
  }
}

export default i18n;
