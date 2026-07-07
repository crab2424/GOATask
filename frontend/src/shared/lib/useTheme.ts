import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

const THEME_KEY = "goatask:theme";

function loadTheme(): Theme {
  const value = window.localStorage.getItem(THEME_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function applyTheme(theme: Theme, systemDark: boolean) {
  const dark = theme === "dark" || (theme === "system" && systemDark);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * テーマ設定（端末ごと・localStorage保存）。
 * documentElementの .dark クラスを付け外しし、system選択時はOS設定の変化にも追従する。
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    window.localStorage.setItem(THEME_KEY, theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(theme, media.matches);
    if (theme !== "system") return;
    const onChange = (event: MediaQueryListEvent) => applyTheme(theme, event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return { theme, setTheme };
}
