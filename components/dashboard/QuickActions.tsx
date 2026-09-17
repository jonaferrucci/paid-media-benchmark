"use client";

import Link from "next/link";
import { Sparkles, Compass, Layers, Upload, Bookmark, ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";

// Phase 20D item 1/2/21: the homepage's product launchpad. Every core
// workflow (benchmark, planner, media catalog, contribution, and — once
// signed in — saved comparisons) is reachable straight from home, so the
// product works even for someone who never opens the sidebar. Deliberately
// NOT built on EntityCard: these are launch buttons for actions, not a
// list of entities, so they get their own simpler, bigger, single-accent-
// color shape rather than the avatar/meta/badge entity shape.
// Tailwind's JIT scanner only sees complete class strings in source, so
// the accent is a lookup key into fully-spelled classes here — never a
// dynamically-interpolated `bg-${accent}` (which the scanner would miss
// entirely and silently drop from the generated CSS).
const ACCENT_CLASSES = {
  brandLavender: { bg: "bg-brandLavender/20", text: "text-brandLavender" },
  brandMint: { bg: "bg-brandMint/20", text: "text-brandMint" },
  coral: { bg: "bg-coral/20", text: "text-coral" },
  brandPeach: { bg: "bg-brandPeach/20", text: "text-brandPeach" },
  pistachio: { bg: "bg-pistachio/20", text: "text-pistachio" },
} as const;

type Accent = keyof typeof ACCENT_CLASSES;

interface QuickAction {
  href: string;
  icon: typeof Sparkles;
  accent: Accent;
  titleKey: string;
  bodyKey: string;
}

const PRIMARY_ACTIONS: QuickAction[] = [
  { href: "/benchmark", icon: Sparkles, accent: "brandLavender", titleKey: "benchmarkTitle", bodyKey: "benchmarkBody" },
  { href: "/planner", icon: Compass, accent: "brandMint", titleKey: "plannerTitle", bodyKey: "plannerBody" },
  { href: "/platforms", icon: Layers, accent: "coral", titleKey: "platformsTitle", bodyKey: "platformsBody" },
  { href: "/contribute", icon: Upload, accent: "brandPeach", titleKey: "contributeTitle", bodyKey: "contributeBody" },
];

const SECONDARY_ACTIONS: QuickAction[] = [
  { href: "/comparisons", icon: Bookmark, accent: "pistachio", titleKey: "comparisonsTitle", bodyKey: "comparisonsBody" },
];

function ActionCard({ action }: { action: QuickAction }) {
  const { t } = useTranslation();
  const Icon = action.icon;
  const accent = ACCENT_CLASSES[action.accent];
  return (
    <Link
      href={action.href}
      className="group flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-left shadow-sm outline-none transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${accent.bg}`}>
        <Icon size={19} className={accent.text} aria-hidden="true" />
      </span>
      <p className="font-display text-sm font-semibold text-ink-900">{t(`quickActions.${action.titleKey}`)}</p>
      <p className="text-xs text-ink-600">{t(`quickActions.${action.bodyKey}`)}</p>
      <span className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
        {t("quickActions.openCta")}
        <ArrowRight size={12} className="transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

export function QuickActions() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto mb-10 max-w-4xl px-4">
      <h2 className="mb-3 text-center font-display text-base font-semibold text-ink-900">
        {t("quickActions.heading")}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRIMARY_ACTIONS.map((action) => (
          <ActionCard key={action.href} action={action} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SECONDARY_ACTIONS.map((action) => (
          <ActionCard key={action.href} action={action} />
        ))}
      </div>
    </section>
  );
}
