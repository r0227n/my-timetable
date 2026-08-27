import type { SupportedLanguage } from "./config";

export function formatNumber(value: number, language: SupportedLanguage): string {
  return new Intl.NumberFormat(language).format(value);
}

export function formatDate(value: string, language: SupportedLanguage, timeZone: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone }).format(
    new Date(`${value}T12:00:00Z`),
  );
}
