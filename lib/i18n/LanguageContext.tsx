"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { dictionaries, Locale } from "./translations";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function resolvePath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Default language is Spanish, per the approved product direction.
  const [locale, setLocaleState] = useState<Locale>("es");

  useEffect(() => {
    const stored = window.localStorage.getItem("cucurucho-locale");
    if (stored === "es" || stored === "en") setLocaleState(stored);
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    window.localStorage.setItem("cucurucho-locale", next);
  }

  function t(path: string, vars?: Record<string, string | number>): string {
    const value = resolvePath(dictionaries[locale], path);

    let text: string;
    if (typeof value === "string") {
      text = value;
    } else {
      // Defense-in-depth: a missing/mismatched translation key must
      // never render as a raw dotted path like "contribute.insight.
      // lower_requiere_atencion" to a real user — that's exactly the
      // Phase 10 production bug this guards against for any future
      // mismatch. Still logged (not silently hidden) so the real
      // underlying bug stays visible to developers in the console;
      // the user just never sees a string that looks like source code.
      console.warn(`[i18n] Missing translation for path: "${path}"`);
      const lastSegment = path.split(".").pop() ?? path;
      text = lastSegment.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
    }

    if (vars) {
      for (const [key, val] of Object.entries(vars)) {
        text = text.replace(`{${key}}`, String(val));
      }
    }
    return text;
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation must be used within LanguageProvider");
  return ctx;
}
