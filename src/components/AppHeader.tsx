import { CalendarDays, DatabaseZap, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { changeUiLanguage, currentLanguage } from "../i18n/i18n";
import { supportedLanguages, type SupportedLanguage } from "../i18n/config";

interface AppHeaderProps {
  dark: boolean;
  onToggleTheme: () => void;
  onClearModelCache: () => Promise<void>;
}

export function AppHeader({ dark, onToggleTheme, onClearModelCache }: AppHeaderProps) {
  const { t } = useTranslation("common");
  const language = currentLanguage();
  return (
    <header className="app-header">
      <a className="brand" href="./" aria-label={t("brandTop")}>
        <span className="brand-mark">
          <CalendarDays size={20} strokeWidth={2.4} />
        </span>
        <span>MY TIMETABLE</span>
      </a>
      <div className="header-actions">
        <label className="language-select">
          <span className="sr-only">{t("language.label")}</span>
          <select
            aria-label={t("language.label")}
            value={language}
            onChange={(event) => void changeUiLanguage(event.target.value as SupportedLanguage)}
          >
            {supportedLanguages.map((value) => (
              <option value={value} key={value}>
                {t(`language.${value}`)}
              </option>
            ))}
          </select>
        </label>
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
