"use client";

import { ReactNode, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface DetailedAnalysisProps {
  children: ReactNode;
}

export function DetailedAnalysis({ children }: DetailedAnalysisProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:border-primary/40 hover:text-primary"
      >
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {open ? t("detailed.hide") : t("detailed.show")}
      </button>
      {open && <div className="mt-4 space-y-6">{children}</div>}
    </section>
  );
}
