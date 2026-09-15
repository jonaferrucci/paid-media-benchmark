"use client";

import Link from "next/link";
import { Search, Sun, Moon } from "lucide-react";
import { LogoMark } from "./LogoMark";
import { AccountMenu } from "./AccountMenu";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useTheme } from "@/lib/theme/ThemeContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";

interface AppHeaderProps {
  onSearchClick: () => void;
}

export function AppHeader({ onSearchClick }: AppHeaderProps) {
  const { t, locale, setLocale } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user, loading } = useSupabaseUser();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-3 md:px-6">
      <div className="flex max-w-[1400px] items-center gap-3">
        <Link href="/" className="flex items-center pr-1" aria-label={t("app.name")}>
          <LogoMark size={34} variant="gradient" />
        </Link>

        <button
          onClick={onSearchClick}
          className="ml-3 flex flex-1 items-center gap-2 rounded-full border border-line bg-canvas px-4 py-2 text-left text-sm text-ink-400 transition-colors hover:border-primary/40 sm:max-w-md"
        >
          <Search size={15} />
          <span className="truncate">{t("search.placeholder")}</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden rounded-full border border-reference/30 bg-reference-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-reference lg:inline-block">
            {t("app.mockData")}
          </span>

          <div className="hidden items-center gap-1 rounded-full border border-line bg-canvas p-0.5 text-xs font-medium sm:flex">
            <button
              onClick={() => setLocale("es")}
              className={`rounded-full px-2.5 py-1 transition-colors ${
                locale === "es" ? "bg-primary text-white" : "text-ink-600"
              }`}
            >
              ES
            </button>
            <button
              onClick={() => setLocale("en")}
              className={`rounded-full px-2.5 py-1 transition-colors ${
                locale === "en" ? "bg-primary text-white" : "text-ink-600"
              }`}
            >
              EN
            </button>
          </div>

          <button
            onClick={toggleTheme}
            aria-label={theme === "light" ? t("theme.dark") : t("theme.light")}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-canvas text-ink-600 transition-colors hover:text-primary"
          >
            {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          <div className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />

          {!loading && (
            user ? (
              <AccountMenu user={user} />
            ) : (
              <>
                <Link
                  href="/auth/sign-in"
                  className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-ink-700 hover:text-primary sm:inline-block"
                >
                  {t("auth.login")}
                </Link>
                <Link
                  href="/auth/sign-up"
                  className="rounded-full bg-brandGradient px-3.5 py-1.5 text-sm font-medium text-[#23232B] transition-opacity hover:opacity-90"
                >
                  {t("auth.createAccount")}
                </Link>
              </>
            )
          )}
        </div>
      </div>
    </header>
  );
}
