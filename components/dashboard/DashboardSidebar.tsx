"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BarChart3, Layers, Users, Upload, FileBarChart, Sparkles, Bookmark } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const NAV_ITEMS = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/", label: t("nav.benchmarks"), icon: BarChart3 },
    { href: "/verticals", label: t("nav.verticals"), icon: FileBarChart },
    { href: "/audiences", label: t("nav.audiences"), icon: Users },
    { href: "/platforms", label: t("nav.platforms"), icon: Layers },
  ];
  const SECONDARY_ITEMS = [
    { href: "/benchmark", label: t("nav.liveBenchmark"), icon: Sparkles },
    { href: "/comparisons", label: t("nav.myComparisons"), icon: Bookmark },
    { href: "/contribute", label: t("nav.contributeData"), icon: Upload },
  ];

  return (
    <aside className="hidden md:flex md:w-56 md:flex-col md:fixed md:inset-y-0 md:top-[57px] bg-sidebar text-ink-400">
      <nav className="flex-1 space-y-4 px-3 py-5">
        <div>
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">{t("nav.groupExplore")}</p>
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item, idx) => {
              const Icon = item.icon;
              const isActive = idx <= 1 && pathname === "/" ? idx === 0 : pathname === item.href;
              return (
                <Link
                  key={item.label + idx}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={clsx(
                    "relative flex items-center gap-3 rounded-full px-3 py-2.5 text-sm transition-colors duration-150",
                    isActive ? "bg-white/[0.08] font-medium text-white" : "text-ink-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {isActive && <span className="absolute -left-3 h-5 w-1 rounded-r-full bg-brandGradient" aria-hidden="true" />}
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" className={isActive ? "text-brandLavender" : ""} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">{t("nav.groupWork")}</p>
          <div className="space-y-0.5">
            {SECONDARY_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={clsx(
                    "relative flex items-center gap-3 rounded-full px-3 py-2.5 text-sm transition-colors duration-150",
                    isActive ? "bg-white/[0.08] font-medium text-white" : "text-ink-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {isActive && <span className="absolute -left-3 h-5 w-1 rounded-r-full bg-brandGradient" aria-hidden="true" />}
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" className={isActive ? "text-brandLavender" : ""} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </aside>
  );
}
