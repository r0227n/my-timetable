export const supportedLanguages = ["ja", "en"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage: SupportedLanguage = "ja";
export const languageStorageKey = "ui.language";
export const namespaces = [
  "common",
  "upload",
  "adjust",
  "analysis",
  "review",
  "selection",
  "timeline",
  "export",
] as const;
export type TranslationNamespace = (typeof namespaces)[number];
export const initialNamespaces = ["common", "upload"] as const satisfies readonly TranslationNamespace[];

export function normalizeLanguage(value: string | null | undefined): SupportedLanguage | null {
  if (!value) return null;
  const base = value.toLowerCase().split("-")[0];
  return supportedLanguages.find((language) => language === base) ?? null;
}

export function resolveInitialLanguage({
  storedLanguage,
  browserLanguages,
}: {
  storedLanguage?: string | null;
  browserLanguages?: readonly string[];
} = {}): SupportedLanguage {
  const stored = normalizeLanguage(storedLanguage);
  if (stored) return stored;
  for (const candidate of browserLanguages ?? []) {
    const language = normalizeLanguage(candidate);
    if (language) return language;
  }
  return defaultLanguage;
}
