"use client";

// Phase 38 (release-candidate cleanup §10): a simple, on-brand 404 for
// any unmatched route or an explicit notFound() call (e.g. a media
// slug or a contribution/import id that doesn't exist or doesn't
// belong to the signed-in owner — see app/media/[slug]/page.tsx and
// app/account/contributions/[id]/page.tsx). Deliberately minimal: no
// sidebar/app chrome (a lost visitor may not even have a valid route
// context yet), no invented copy, no stack trace, just a way back.
import Link from "next/link";
import { Compass } from "lucide-react";
import { LogoMark } from "@/components/dashboard/LogoMark";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
      <LogoMark size={40} variant="gradient" />
      <h1 className="font-display text-xl font-semibold text-ink-900">{t("notFoundPage.title")}</h1>
      <p className="max-w-sm text-sm text-ink-600">{t("notFoundPage.description")}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Link href="/" className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
          {t("notFoundPage.homeCta")}
        </Link>
        <Link
          href="/benchmark"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-xs font-medium text-ink-700 hover:border-primary/50"
        >
          <Compass size={13} aria-hidden="true" /> {t("notFoundPage.benchmarkCta")}
        </Link>
      </div>
    </div>
  );
}
