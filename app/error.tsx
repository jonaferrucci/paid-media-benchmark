"use client";

// Phase 38 (release-candidate cleanup §11): a simple global error
// boundary. Next.js requires this to be a Client Component and to
// receive exactly {error, reset}. Deliberately minimal: no stack
// trace or raw error message shown to the visitor (logged to the
// browser console only, which is where a developer would already look
// — no monitoring SDK added), a retry action wired to the real `reset`
// callback Next.js provides, and a way back to the homepage.
import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { LogoMark } from "@/components/dashboard/LogoMark";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    console.error("[app/error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
      <LogoMark size={40} variant="gradient" />
      <h1 className="font-display text-xl font-semibold text-ink-900">{t("errorBoundary.title")}</h1>
      <p className="max-w-sm text-sm text-ink-600">{t("errorBoundary.description")}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          <RotateCcw size={13} aria-hidden="true" /> {t("errorBoundary.retryCta")}
        </button>
        <Link href="/" className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-medium text-ink-700 hover:border-primary/50">
          {t("errorBoundary.homeCta")}
        </Link>
      </div>
    </div>
  );
}
