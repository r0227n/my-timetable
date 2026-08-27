import i18n from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";
import {
  defaultLanguage,
  languageStorageKey,
  namespaces,
  normalizeLanguage,
  resolveInitialLanguage,
  supportedLanguages,
  type SupportedLanguage,
  type TranslationNamespace,
} from "./config";

const resourceLoaders = {
  ja: {
    common: () => import("./locales/ja/common.json"),
    upload: () => import("./locales/ja/upload.json"),
    adjust: () => import("./locales/ja/adjust.json"),
    analysis: () => import("./locales/ja/analysis.json"),
    review: () => import("./locales/ja/review.json"),
    selection: () => import("./locales/ja/selection.json"),
    timeline: () => import("./locales/ja/timeline.json"),
    export: () => import("./locales/ja/export.json"),
  },
  en: {
    common: () => import("./locales/en/common.json"),
    upload: () => import("./locales/en/upload.json"),
    adjust: () => import("./locales/en/adjust.json"),
    analysis: () => import("./locales/en/analysis.json"),
    review: () => import("./locales/en/review.json"),
    selection: () => import("./locales/en/selection.json"),
    timeline: () => import("./locales/en/timeline.json"),
    export: () => import("./locales/en/export.json"),
  },
} as const;

let initialization: Promise<typeof i18n> | null = null;

function readStoredLanguage(): string | null {
  try {
    return window.localStorage.getItem(languageStorageKey);
  } catch {
    return null;
  }
}

function browserLanguages(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

function syncDocumentLanguage(language: string): void {
  document.documentElement.lang = normalizeLanguage(language) ?? defaultLanguage;
}

export function initializeI18n(): Promise<typeof i18n> {
  initialization ??= i18n
    .use(initReactI18next)
    .use(
      resourcesToBackend((language: string, namespace: string) => {
        const supportedLanguage = normalizeLanguage(language) ?? defaultLanguage;
        const supportedNamespace = namespaces.includes(namespace as TranslationNamespace)
          ? (namespace as TranslationNamespace)
          : "common";
        return resourceLoaders[supportedLanguage][supportedNamespace]();
      }),
    )
    .init({
      lng: resolveInitialLanguage({
        storedLanguage: readStoredLanguage(),
        browserLanguages: browserLanguages(),
      }),
      fallbackLng: defaultLanguage,
      supportedLngs: supportedLanguages,
      ns: namespaces,
      defaultNS: "common",
      fallbackNS: "common",
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
    .then(() => {
      syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);
      i18n.on("languageChanged", syncDocumentLanguage);
      return i18n;
    });
  return initialization;
}

export async function changeUiLanguage(language: SupportedLanguage): Promise<void> {
  if (!supportedLanguages.includes(language)) throw new TypeError(`Unsupported language: ${language}`);
  await initializeI18n();
  await i18n.changeLanguage(language);
  window.localStorage.setItem(languageStorageKey, language);
}

export function currentLanguage(): SupportedLanguage {
  return normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? defaultLanguage;
}

export default i18n;
