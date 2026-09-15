"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Phase 12: dark is now the default theme, replacing the earlier
  // light-default direction. :root in globals.css already holds the
  // dark palette directly (no attribute needed for the default state,
  // avoiding any flash of the wrong theme before JS hydrates) — this
  // state just needs to stay in sync with that CSS-level default.
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem("cucurucho-theme");
    if (stored === "light" || stored === "dark") {
      setThemeState(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("cucurucho-theme", next);
  }

  function toggleTheme() {
    setTheme(theme === "light" ? "dark" : "light");
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
