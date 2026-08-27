import { CalendarDays, DatabaseZap, Moon, Sun } from "lucide-react";

interface AppHeaderProps {
  dark: boolean;
  onToggleTheme: () => void;
  onClearModelCache: () => Promise<void>;
}

export function AppHeader({ dark, onToggleTheme, onClearModelCache }: AppHeaderProps) {
  return (
    <header className="app-header">
      <a className="brand" href="./" aria-label="My Timetable トップ">
        <span className="brand-mark">
          <CalendarDays size={20} strokeWidth={2.4} />
        </span>
        <span>MY TIMETABLE</span>
      </a>
      <div className="header-actions">
        <button
          className="icon-button"
          type="button"
          onClick={() => void onClearModelCache()}
          aria-label="AIモデルのキャッシュを削除"
        >
          <DatabaseZap size={18} />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onToggleTheme}
          aria-label={dark ? "ライトテーマにする" : "ダークテーマにする"}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
