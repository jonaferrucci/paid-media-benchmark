"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BarChart3, Layers, Users, Upload, FileBarChart, Sparkles } from "lucide-react";
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
    { href: "/comparisons", label: t("nav.myComparisons"), icon: BarChart3 },
    { href: "/contribute", label: t("nav.contributeData"), icon: Upload },
  ];

  return (
    <aside className="hidden md:flex md:w-56 md:flex-col md:fixed md:inset-y-0 md:top-[57px] bg-sidebar text-ink-400">
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item, idx) => {
          const Icon = item.icon;
          const isActive = idx <= 1 && pathname === "/" ? idx === 0 : pathname === item.href;
          return (
            <Link
              key={item.label + idx}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-full px-3 py-2 text-sm transition-colors",
                isActive ? "bg-white/10 text-white" : "text-ink-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon size={16} strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
        <div className="my-3 border-t border-white/10" />
        {SECONDARY_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-full px-3 py-2 text-sm transition-colors",
                pathname === item.href
                  ? "bg-white/10 text-white"
                  : "text-ink-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon size={16} strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
