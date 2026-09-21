"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Layers,
  Upload,
  Sparkles,
  Bookmark,
  Compass,
  ShieldCheck,
  X,
  Pin,
  PinOff,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useTheme } from "@/lib/theme/ThemeContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import { createClient } from "@/lib/supabase/client";
import { signOutAction } from "@/app/auth/actions";
import { useMobileNav } from "@/lib/navigation/MobileNavContext";

const PIN_STORAGE_KEY = "cucurucho.sidebarPinned";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Post-MVP sidebar simplification: the primary rail is now exactly
// EXPLORAR (3) / TRABAJAR (3) / ADMINISTRAR (1) — Platforms/Verticals/
// Audiences routes are NOT deleted (their pages, translation keys, and
// links from other product flows/search all still work); Verticals and
// Audiences simply no longer occupy a permanent sidebar slot, and the
// remaining catalog item uses the user-facing "Medios" label rather
// than the internal "platforms" wording. Kept as a plain data
// structure (no hook, no t()) so it's directly unit-testable — see
// scripts/test-postmvp-import.mts's nav-shape assertions.
export const NAV_GROUP_STRUCTURE: { groupKey: string; items: { href: string; labelKey: string; icon: typeof Home }[] }[] = [
  {
    groupKey: "nav.groupExplore",
    items: [
      { href: "/", labelKey: "nav.home", icon: Home },
      { href: "/benchmark", labelKey: "nav.liveBenchmark", icon: Sparkles },
      { href: "/platforms", labelKey: "nav.media", icon: Layers },
    ],
  },
  {
    groupKey: "nav.groupWork",
    items: [
      { href: "/planner", labelKey: "nav.planner", icon: Compass },
      { href: "/comparisons", labelKey: "nav.myComparisons", icon: Bookmark },
      { href: "/contribute", labelKey: "nav.contributeData", icon: Upload },
    ],
  },
  {
    groupKey: "nav.groupAdmin",
    items: [{ href: "/curation", labelKey: "nav.curation", icon: ShieldCheck }],
  },
];

// POST-MVP MOBILE PASS §3: "Curación only when authorized" — this is a
// presentational filter only (the /curation route itself already gates
// server-side via getCurrentProfileIsCurator, unchanged by this task);
// hiding the link for non-curators just stops the nav from listing a
// destination most visitors would immediately bounce off of. Never used
// as a security boundary on its own. Exported as a plain, translation-
// free function so this filtering decision is unit-testable without a
// DOM or a LanguageContext provider.
export function navGroupStructureFor(isCurator: boolean): typeof NAV_GROUP_STRUCTURE {
  return NAV_GROUP_STRUCTURE.filter((group) => group.groupKey !== "nav.groupAdmin" || isCurator);
}

function useNavGroups(isCurator: boolean): NavGroup[] {
  const { t } = useTranslation();
  return navGroupStructureFor(isCurator).map((group) => ({
    label: t(group.groupKey),
    items: group.items.map((item) => ({ href: item.href, label: t(item.labelKey), icon: item.icon })),
  }));
}

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Phase 22 §A1/§A3: ONE shared icon-slot geometry, used by every
// interactive row in the rail (nav links here, and the pin control
// below) — this is what actually fixes the "icons don't share a
// center axis" bug. Previously an icon sat directly in a `gap-3` flex
// row next to a label span; even with the label's opacity at 0, its
// full (untruncated) text still reserved real layout width, so the
// icon effectively floated at "rail padding + 0", never at the rail's
// true horizontal center. Wrapping the icon in a fixed 40px box (the
// rail's collapsed 64px width minus its 12px+12px horizontal padding,
// i.e. derived from --sidebar-rail-width) means the icon is always
// dead-center in that box regardless of whether a label exists, is
// hidden, or is mid hover-reveal — and expansion never moves it,
// since the label is a sibling that appears AFTER this fixed slot
// rather than something the icon shares space with (§A6).
const RAIL_ICON_SLOT = "flex h-10 w-10 shrink-0 items-center justify-center";

function NavLink({
  item,
  active,
  labelVisibility,
}: {
  item: NavItem;
  active: boolean;
  labelVisibility: "always" | "onHover" | "hidden";
}) {
  const Icon = item.icon;
  const showLabelNow = labelVisibility === "always";
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={showLabelNow ? undefined : item.label}
      className={clsx(
        "relative flex w-full items-center gap-3 rounded-full pr-3 text-sm transition-colors duration-150",
        active ? "bg-white/[0.08] font-medium text-white" : "text-ink-400 hover:bg-white/5 hover:text-white"
      )}
    >
      {active && <span className="absolute -left-3 h-5 w-1 rounded-r-full bg-brandGradient" aria-hidden="true" />}
      <span className={RAIL_ICON_SLOT}>
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" className={clsx(active && "text-brandLavender")} />
      </span>
      <span
        className={clsx(
          "truncate py-2.5 transition-opacity duration-100",
          labelVisibility === "always" && "opacity-100",
          labelVisibility === "hidden" && "opacity-0",
          labelVisibility === "onHover" && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user } = useSupabaseUser();
  const [isCurator, setIsCurator] = useState(false);
  const groups = useNavGroups(isCurator);
  const [pinned, setPinned] = useState(false);
  // POST-MVP MOBILE PASS §2/§3: the sheet's open state now lives in the
  // shared MobileNavContext (mounted once in Providers.tsx) so the
  // header's own menu button — not a floating button owned by this
  // component — can drive it. Every existing sheet behavior (contents,
  // close-on-item-click, backdrop) is unchanged, just retriggered.
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNav();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PIN_STORAGE_KEY);
      if (stored === "1") setPinned(true);
    } catch {
      // Best-effort only — localStorage may be unavailable; the rail
      // simply stays collapsed-by-default in that case.
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("sidebar-pinned", pinned);
  }, [pinned]);

  // POST-MVP MOBILE PASS §3: presentational-only curator check (see
  // useNavGroups above) — mirrors the same client-side pattern
  // AccountMenu already uses for display_name, just for is_curator.
  useEffect(() => {
    if (!user) {
      setIsCurator(false);
      return;
    }
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("is_curator")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setIsCurator(data?.is_curator === true));
  }, [user]);

  // §18: Escape closes the sheet, and opening it moves focus into the
  // panel (onto its own close button) so keyboard/screen-reader users
  // land somewhere sensible instead of the sheet appearing silently
  // behind their current focus.
  useEffect(() => {
    if (!mobileOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen, setMobileOpen]);

  function togglePinned() {
    setPinned((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore — pin preference just won't persist across reloads.
      }
      return next;
    });
  }

  return (
    <>
      {/* Desktop rail: collapsed by default (w-16), expands to w-56 on
          hover/keyboard-focus as a fixed overlay so it never shifts page
          content. Pinning keeps it expanded and is the one case that also
          widens the reserved content inset (via the --sidebar-inset CSS
          variable toggled on <html>, see globals.css) — a deliberate,
          user-initiated layout change rather than a surprise on hover. */}
      <aside
        aria-label={t("nav.railLabel")}
        className={clsx(
          "group hidden md:flex md:flex-col md:fixed md:inset-y-0 md:top-[57px] md:z-30 bg-sidebar text-ink-400 shadow-lg",
          "transition-[width] duration-150 ease-out overflow-hidden",
          pinned ? "md:w-56" : "md:w-16 md:hover:w-56 md:focus-within:w-56"
        )}
      >
        <SidebarNav groups={groups} pathname={pathname} showLabels={pinned} revealOnHover={!pinned} />
        {/* Phase 22 §A7: the pin row's OWN left inset must equal the nav
            rows' (12px, matching <nav>'s px-3) so its icon lands on the
            same RAIL_ICON_SLOT-centered axis — previously this wrapper's
            p-3 (12px) stacked with the button's own px-3 (another 12px),
            pushing the pin icon 12px further right than every nav icon
            above it. The button itself no longer sets its own horizontal
            padding; only this wrapper does.
            Phase 27 §1: pt-0 instead of py-3's symmetric top padding —
            the border-t already separates this control from the nav
            above, so a full top gap on top of that border read as a
            visible misalignment. Bottom padding (pb-3) is unchanged so
            the control stays clear of the rail's bottom edge. */}
        <div className="border-t border-white/5 px-3 pb-3 pt-0">
          <button
            type="button"
            onClick={togglePinned}
            aria-pressed={pinned}
            className="flex w-full items-center gap-3 rounded-full py-2 text-xs text-ink-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <span className={RAIL_ICON_SLOT}>
              {pinned ? <PinOff size={15} strokeWidth={1.75} aria-hidden="true" /> : <Pin size={15} strokeWidth={1.75} aria-hidden="true" />}
            </span>
            <span
              className={clsx(
                "truncate transition-opacity duration-100",
                pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              )}
            >
              {pinned ? t("nav.unpinSidebar") : t("nav.pinSidebar")}
            </span>
          </button>
        </div>
      </aside>

      {/* POST-MVP MOBILE PASS §3: the old visually isolated floating
          bottom-right trigger is gone — the same sheet is now opened
          from AppHeader's own menu button, in the header's priority
          row. Nothing else about the sheet's structure changed. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={t("nav.railLabel")}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div
            ref={panelRef}
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-sidebar text-ink-400 shadow-xl outline-none motion-safe:animate-[fadeIn_0.15s_ease]"
          >
            <div className="flex items-center justify-between border-b border-white/5 p-3">
              <span className="px-2 text-xs font-semibold uppercase tracking-wider text-white/40">{t("nav.railLabel")}</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={t("nav.closeMenu")}
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink-400 hover:bg-white/5 hover:text-white"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div onClick={() => setMobileOpen(false)}>
                <SidebarNav groups={groups} pathname={pathname} showLabels />
              </div>

              {/* §2/§3: language + theme, moved here from the header
                  where narrow widths have no room for them; account/
                  sign-out surfaced too so the sheet covers every control
                  a mobile visitor needs without opening the header's
                  separate account menu. Touch targets kept at ~44px. */}
              <div className="border-t border-white/5 px-3 py-4">
                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">{t("nav.preferences")}</p>
                <div className="flex items-center gap-2 px-3">
                  <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5 text-xs font-medium">
                    <button
                      onClick={() => setLocale("es")}
                      className={clsx("rounded-full px-3 py-2 transition-colors duration-150", locale === "es" ? "bg-white/[0.15] text-white" : "text-ink-400")}
                    >
                      ES
                    </button>
                    <button
                      onClick={() => setLocale("en")}
                      className={clsx("rounded-full px-3 py-2 transition-colors duration-150", locale === "en" ? "bg-white/[0.15] text-white" : "text-ink-400")}
                    >
                      EN
                    </button>
                  </div>
                  <button
                    onClick={toggleTheme}
                    aria-label={theme === "light" ? t("theme.dark") : t("theme.light")}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-400 hover:bg-white/10 hover:text-white"
                  >
                    {theme === "light" ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
                  </button>
                </div>

                {user && (
                  <form action={signOutAction} className="mt-3">
                    <button
                      type="submit"
                      className="flex w-full items-center gap-3 px-3 py-2.5 rounded-full text-caution text-left text-sm hover:bg-caution-soft/10"
                    >
                      <span className={RAIL_ICON_SLOT}>
                        <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
                      </span>
                      {t("auth.signOut")}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SidebarNav({
  groups,
  pathname,
  showLabels,
  revealOnHover = false,
}: {
  groups: NavGroup[];
  pathname: string;
  showLabels: boolean;
  revealOnHover?: boolean;
}) {
  return (
    <nav className="flex-1 space-y-4 px-3 py-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p
            className={clsx(
              "px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30 truncate transition-opacity duration-100",
              showLabels && "opacity-100",
              !showLabels && revealOnHover && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
              !showLabels && !revealOnHover && "opacity-0"
            )}
          >
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isItemActive(pathname, item.href)}
                labelVisibility={showLabels ? "always" : revealOnHover ? "onHover" : "hidden"}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
