"use client";

import { useState } from "react";
import { Bookmark, Check, LogIn } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import { saveComparisonAction, type SavedComparisonInput } from "./actions";

interface SaveComparisonButtonProps {
  defaultName: string;
  buildPayload: () => Omit<SavedComparisonInput, "name">;
}

// Compact, inline pattern (expand-in-place) rather than a modal, per
// Phase 14 item 7. Reused by both the single-metric result and the
// campaign comparison result.
export function SaveComparisonButton({ defaultName, buildPayload }: SaveComparisonButtonProps) {
  const { t } = useTranslation();
  const { user } = useSupabaseUser();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(defaultName);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  if (!user) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-ink-400">
        <LogIn size={12} aria-hidden="true" /> {t("comparisons.signInToSave")}
      </p>
    );
  }

  if (status === "saved") {
    return (
      <p className="motion-safe:animate-[fadeIn_0.2s_ease] inline-flex items-center gap-1.5 text-xs font-medium text-pistachio">
        <Check size={13} aria-hidden="true" /> {t("comparisons.savedConfirmation")}
      </p>
    );
  }

  if (!expanded) {
    return (
      <button
        onClick={() => { setName(defaultName); setExpanded(true); }}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-primary hover:text-primary"
      >
        <Bookmark size={13} aria-hidden="true" /> {t("comparisons.saveComparison")}
      </button>
    );
  }

  async function handleSave() {
    setStatus("saving");
    const result = await saveComparisonAction({ ...buildPayload(), name });
    setStatus(result.ok ? "saved" : "error");
  }

  return (
    <div className="motion-safe:animate-[fadeIn_0.15s_ease] inline-flex flex-col gap-1.5">
      <label htmlFor="save-comparison-name" className="text-xs font-medium text-ink-600">
        {t("comparisons.saveNamePrompt")}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="save-comparison-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setExpanded(false);
          }}
          autoFocus
          className="w-56 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink-900 outline-none ring-2 ring-transparent transition-shadow focus-visible:border-primary focus-visible:ring-primary/20"
        />
        <button
          onClick={handleSave}
          disabled={status === "saving"}
          className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {t("comparisons.save")}
        </button>
        <button onClick={() => setExpanded(false)} className="rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface2">
          {t("comparisons.cancel")}
        </button>
      </div>
      {status === "error" && <p className="text-xs text-caution">{t("comparisons.errorGeneric")}</p>}
    </div>
  );
}
