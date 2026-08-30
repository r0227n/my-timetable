import { useEffect, useRef, useState } from "react";
import { Bug, CalendarDays, Check, ChevronDown, DatabaseZap, Languages, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { changeUiLanguage, currentLanguage } from "../i18n/i18n";
import { supportedLanguages } from "../i18n/config";

interface AppHeaderProps {
  dark: boolean;
  onToggleTheme: () => void;
  onClearModelCache: () => Promise<void>;
  onOpenDebug?: () => void;
}

export function AppHeader({ dark, onToggleTheme, onClearModelCache, onOpenDebug }: AppHeaderProps) {
  const { t } = useTranslation("common");
  const language = currentLanguage();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!languageMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) setLanguageMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLanguageMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [languageMenuOpen]);

  return (
    <header className="app-header">
      <a className="brand" href="./" aria-label={t("brandTop")}>
        <span className="brand-mark">
          <CalendarDays size={20} strokeWidth={2.4} />
        </span>
        <span>MY TIMETABLE</span>
      </a>
      <div className="header-actions">
        {onOpenDebug ? (
          <button className="debug-button" type="button" onClick={onOpenDebug}>
            <Bug size={17} aria-hidden="true" />
            <span>{t("header.debug")}</span>
          </button>
        ) : null}
        <div className="language-menu" ref={languageMenuRef}>
          <button
            ref={languageButtonRef}
            className="language-button"
            type="button"
            onClick={() => setLanguageMenuOpen((open) => !open)}
            aria-label={t("language.button", { language: t(`language.${language}`) })}
            aria-haspopup="menu"
            aria-expanded={languageMenuOpen}
          >
            <Languages size={18} aria-hidden="true" />
            <span>{t(`language.${language}`)}</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {languageMenuOpen && (
            <div className="language-dropdown" role="menu" aria-label={t("language.label")}>
              {supportedLanguages.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === language}
                  onClick={async () => {
                    setLanguageMenuOpen(false);
                    try {
                      if (value !== language) await changeUiLanguage(value);
                    } finally {
                      languageButtonRef.current?.focus();
                    }
                  }}
                >
                  <span>{t(`language.${value}`)}</span>
                  {value === language && <Check size={16} aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void onClearModelCache()}
          aria-label={t("header.clearCache")}
        >
          <DatabaseZap size={18} />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onToggleTheme}
          aria-label={dark ? t("header.lightTheme") : t("header.darkTheme")}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
