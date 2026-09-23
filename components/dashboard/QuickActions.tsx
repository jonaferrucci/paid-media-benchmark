"use client";

import Link from "next/link";
import { Compass, Layers, Upload, ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";

// Phase 20D item 1/2/21: the homepage's product launchpad for the
// secondary workflows (planner, media catalog, contribution) — reachable
// straight from home, so the product works even for someone who never
// opens the sidebar. Deliberately NOT built on EntityCard: these are
// launch buttons for actions, not a list of entities, so they get their
// own simpler, bigger, single-accent-color shape rather than the
// avatar/meta/badge entity shape.
// Tailwind's JIT scanner only sees complete class strings in source, so
// the accent is a lookup key into fully-spelled classes here — never a
// dynamically-interpolated `bg-${accent}` (which the scanner would miss
// entirely and silently drop from the generated CSS).
//
// PHASE 39 (§3/§6): "Comparar benchmarks" (duplicated the Benchmark
// Finder above, now Home's one primary CTA) and "Mis comparaciones"
// (not a strong CTA for a new visitor; returning users already see
// their saved work surfaced first in Workspace) were removed — down to
// exactly the 3 secondary tools the phase brief asks for, in the order
// it lists them: Importar campaña, Explorar medios, Planificar.
const ACCENT_CLASSES = {
  brandMint: { bg: "bg-brandMint/20", text: "text-brandMint" },
  coral: { bg: "bg-coral/20", text: "text-coral" },
  brandPeach: { bg: "bg-brandPeach/20", text: "text-brandPeach" },
} as const;

type Accent = keyof typeof ACCENT_CLASSES;

interface QuickAction {
  href: string;
  icon: typeof Compass;
  accent: Accent;
  titleKey: string;
  bodyKey: string;
}

const SECONDARY_ACTIONS: QuickAction[] = [
  { href: "/contribute", icon: Upload, accent: "brandPeach", titleKey: "contributeTitle", bodyKey: "contributeBody" },
  { href: "/platforms", icon: Layers, accent: "coral", titleKey: "platformsTitle", bodyKey: "platformsBody" },
  { href: "/planner", icon: Compass, accent: "brandMint", titleKey: "plannerTitle", bodyKey: "plannerBody" },
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
      <h2 className="mb-3 text-center font-display text-sm font-semibold text-ink-600">
        {t("quickActions.heading")}
      </h2>
      {/* PHASE 39 (§6/§22): exactly 3 compact secondary cards, 1 column
          on mobile — never competing in size or count with the
          Benchmark Finder above. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SECONDARY_ACTIONS.map((action) => (
          <ActionCard key={action.href} action={action} />
        ))}
      </div>
    </section>
  );
}
