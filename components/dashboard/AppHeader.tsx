"use client";

import Link from "next/link";
import { Search, Sun, Moon, Menu } from "lucide-react";
import { LogoMark } from "./LogoMark";
import { AccountMenu } from "./AccountMenu";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useTheme } from "@/lib/theme/ThemeContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import { useMobileNav } from "@/lib/navigation/MobileNavContext";

interface AppHeaderProps {
  onSearchClick: () => void;
}

export function AppHeader({ onSearchClick }: AppHeaderProps) {
  const { t, locale, setLocale } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user, loading } = useSupabaseUser();
  const { setOpen: setMobileNavOpen } = useMobileNav();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-3 md:px-6">
      {/* POST-MVP MOBILE PASS §2: below sm, the header is a fixed
          priority row — [Logo] [Search icon] [Account] [Menu] — never
          the full desktop search input squeezed into the same space.
          Search still opens the exact same SearchOverlay (onSearchClick,
          passed down unchanged from every page) — no second search
          implementation, just a narrower trigger control. */}
      <div className="flex max-w-[1400px] items-center gap-2 sm:gap-3">
        {/* Phase 22 §A4: the logo's visual center must land on the same
            horizontal axis as the sidebar rail's icons below it
            (--sidebar-rail-width / 2 = 32px from the viewport's left
            edge, where the rail itself sits flush). At md+ (the only
            breakpoint where the rail renders), a fixed rail-width box
            plus a negative margin canceling this header's own md:px-6
            start padding replaces that padding with the rail's own
            geometry for just this one element — mobile (no rail) is
            untouched. Only the container is repositioned; the approved
            mark asset itself (LogoMark) is never resized or redrawn. */}
        <Link
          href="/"
          className="flex items-center pr-1 md:mr-0 md:w-[var(--sidebar-rail-width)] md:justify-center md:pr-0 md:[margin-left:-1.5rem]"
          aria-label={t("app.name")}
        >
          <LogoMark size={34} variant="gradient" />
        </Link>

        {/* Below sm: a square icon-only trigger (44px touch target).
            At sm+: the existing full-width search pill, unchanged. */}
        <button
          onClick={onSearchClick}
          aria-label={t("search.open")}
          className="ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-canvas text-ink-400 transition-colors hover:border-primary/40 sm:ml-3 sm:h-auto sm:w-auto sm:flex-1 sm:justify-start sm:gap-2 sm:px-4 sm:py-2 sm:max-w-md"
        >
          <Search size={15} aria-hidden="true" />
          <span className="hidden truncate text-left text-sm sm:inline">{t("search.placeholder")}</span>
        </button>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          <span className="hidden rounded-full border border-reference/30 bg-reference-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-reference lg:inline-block">
            {t("app.mockData")}
          </span>

          <div className="hidden items-center gap-1 rounded-full border border-line bg-canvas p-0.5 text-xs font-medium sm:flex">
            <button
              onClick={() => setLocale("es")}
              className={`rounded-full px-2.5 py-1 transition-colors duration-150 ${
                locale === "es" ? "bg-primary text-white" : "text-ink-600"
              }`}
            >
              ES
            </button>
            <button
              onClick={() => setLocale("en")}
              className={`rounded-full px-2.5 py-1 transition-colors duration-150 ${
                locale === "en" ? "bg-primary text-white" : "text-ink-600"
              }`}
            >
              EN
            </button>
          </div>

          {/* Theme toggle stays in the header at every width — a single
              compact icon, cheap enough to keep even at 320px — but is
              ALSO reachable from the mobile nav sheet's "Preferencias"
              section for discoverability (§3). */}
          <button
            onClick={toggleTheme}
            aria-label={theme === "light" ? t("theme.dark") : t("theme.light")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-canvas text-ink-600 transition-colors hover:border-primary/40 hover:text-primary sm:h-8 sm:w-8"
          >
            {theme === "light" ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
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
                  className="rounded-full bg-brandGradient px-3 py-2 text-sm font-medium text-[#23232B] transition-opacity hover:opacity-90 sm:px-3.5 sm:py-1.5"
                >
                  {t("auth.createAccount")}
                </Link>
              </>
            )
          )}

          {/* POST-MVP MOBILE PASS §3: the mobile nav trigger now lives in
              the header, in the priority row's last position — replacing
              the old visually isolated floating bottom-right button.
              Opens the exact same navigation sheet (DashboardSidebar),
              now driven by the shared MobileNavContext instead of local
              state private to the sidebar component. */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-haspopup="dialog"
            aria-label={t("nav.openMenu")}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-canvas text-ink-700 transition-colors hover:border-primary/40 hover:text-primary md:hidden"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
