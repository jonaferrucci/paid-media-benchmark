"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";

// Cucurucho Product UI.md "Empty states": explain what's missing and
// why, never a bare/technical 403. Shown to a signed-out visitor and
// to a signed-in but non-curator user alike — the copy differs, the
// calm empty-state shape doesn't.
export function CurationGate({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="mx-auto max-w-lg px-4 py-10 md:px-8">
          <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface2 text-ink-400">
              <ShieldAlert size={20} aria-hidden="true" />
            </span>
            <p className="mt-4 text-sm font-medium text-ink-800">
              {signedIn ? t("curation.notAuthorized") : t("curation.signInRequired")}
            </p>
            <p className="mt-1 text-xs text-ink-500">{t("curation.notAuthorizedBody")}</p>
          </div>
        </main>
      </div>
    </div>
  );
}
