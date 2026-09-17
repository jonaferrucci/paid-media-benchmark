"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Layers,
  Users,
  Upload,
  FileBarChart,
  Sparkles,
  Bookmark,
  Compass,
  ShieldCheck,
  Menu,
  X,
  Pin,
  PinOff,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n/LanguageContext";

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

function useNavGroups(): NavGroup[] {
  const { t } = useTranslation();
  return [
    {
      label: t("nav.groupExplore"),
      items: [
        { href: "/", label: t("nav.home"), icon: Home },
        { href: "/benchmark", label: t("nav.liveBenchmark"), icon: Sparkles },
        { href: "/platforms", label: t("nav.platforms"), icon: Layers },
        { href: "/verticals", label: t("nav.verticals"), icon: FileBarChart },
        { href: "/audiences", label: t("nav.audiences"), icon: Users },
      ],
    },
    {
      label: t("nav.groupWork"),
      items: [
        { href: "/planner", label: t("nav.planner"), icon: Compass },
        { href: "/comparisons", label: t("nav.myComparisons"), icon: Bookmark },
        { href: "/contribute", label: t("nav.contributeData"), icon: Upload },
      ],
    },
    {
      label: t("nav.groupAdmin"),
      items: [{ href: "/curation", label: t("nav.curation"), icon: ShieldCheck }],
    },
  ];
}

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
        "relative flex items-center gap-3 rounded-full px-3 py-2.5 text-sm transition-colors duration-150",
        active ? "bg-white/[0.08] font-medium text-white" : "text-ink-400 hover:bg-white/5 hover:text-white"
      )}
    >
      {active && <span className="absolute -left-3 h-5 w-1 rounded-r-full bg-brandGradient" aria-hidden="true" />}
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" className={clsx("shrink-0", active && "text-brandLavender")} />
      <span
        className={clsx(
          "truncate transition-opacity duration-100",
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
  const { t } = useTranslation();
  const groups = useNavGroups();
  const [pinned, setPinned] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
        <div className="border-t border-white/5 p-3">
          <button
            type="button"
            onClick={togglePinned}
            aria-pressed={pinned}
            className="flex w-full items-center gap-3 rounded-full px-3 py-2 text-xs text-ink-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            {pinned ? <PinOff size={15} strokeWidth={1.75} aria-hidden="true" className="shrink-0" /> : <Pin size={15} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />}
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

      {/* Mobile: a floating tap trigger (never hover-only) opening a
          full navigation sheet. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={mobileOpen}
        aria-label={t("nav.openMenu")}
        className="fixed bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-sidebar text-white shadow-lg md:hidden"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={t("nav.railLabel")}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 right-0 flex w-64 max-w-[80vw] flex-col bg-sidebar text-ink-400 shadow-xl motion-safe:animate-[fadeIn_0.15s_ease]">
            <div className="flex items-center justify-between border-b border-white/5 p-3">
              <span className="px-2 text-xs font-semibold uppercase tracking-wider text-white/40">{t("nav.railLabel")}</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={t("nav.closeMenu")}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-400 hover:bg-white/5 hover:text-white"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto" onClick={() => setMobileOpen(false)}>
              <SidebarNav groups={groups} pathname={pathname} showLabels />
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
