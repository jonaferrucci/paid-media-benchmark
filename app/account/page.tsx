"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import { createClient } from "@/lib/supabase/client";
import { updateProfileAction, type UpdateProfileResult } from "@/app/account/actions";
import Link from "next/link";

function SaveButton() {
  const { t } = useTranslation();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? t("auth.saving") : t("account.save")}
    </button>
  );
}

export default function AccountPage() {
  const { t } = useTranslation();
  const { user, loading } = useSupabaseUser();
  const [displayName, setDisplayName] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isCurator, setIsCurator] = useState(false);
  const [state, formAction] = useFormState<UpdateProfileResult, FormData>(updateProfileAction, {});

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("profiles")
      // Phase 19B item 3: is_curator is only read here to decide
      // whether to SHOW the curation link — a cosmetic convenience,
      // never the security boundary. The actual page (/curation) and
      // every governance action re-check this server-side, and RLS
      // (migration 0014) enforces it regardless of what this client
      // component renders.
      .select("display_name, is_curator")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? "");
        setIsCurator(data?.is_curator === true);
        setProfileLoaded(true);
      });
  }, [user]);

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="mx-auto max-w-lg px-4 py-8 md:px-8">
          <h1 className="font-display text-xl font-semibold text-ink-900">{t("account.title")}</h1>

          {loading ? (
            <p className="mt-6 text-sm text-ink-600">{t("account.loading")}</p>
          ) : !user ? (
            // Item 20: a signed-out visitor never sees a perpetual
            // "loading" state — a short, concrete explanation of what
            // an account is for, no subscription-tier language.
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
              <p className="font-display text-sm font-semibold text-ink-900">{t("account.signedOutTitle")}</p>
              <p className="mt-1 text-xs text-ink-600">{t("account.signedOutBenefits")}</p>
              <div className="mt-4 flex justify-center gap-2">
                <Link href="/auth/sign-in" className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary">
                  {t("account.signInCta")}
                </Link>
                <Link href="/auth/sign-up" className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
                  {t("account.createAccountCta")}
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-600">{t("account.email")}</span>
                <div className="rounded-full border border-line bg-canvas px-4 py-2.5 text-sm text-ink-600">
                  {user.email}
                </div>
              </label>

              <form action={formAction} className="mt-4 space-y-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-ink-600">{t("account.displayName")}</span>
                  <input
                    type="text"
                    name="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={!profileLoaded}
                    placeholder={t("auth.displayNamePlaceholder")}
                    className="rounded-full border border-line bg-canvas px-4 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
                  />
                </label>
                {state.error && <p className="text-xs text-caution">{t(`authErrors.${state.error}`)}</p>}
                {state.success && <p className="text-xs text-pistachio">{t("account.saved")}</p>}
                <SaveButton />
              </form>

              <Link
                href="/account/contributions"
                className="mt-6 block text-sm font-medium text-primary hover:underline"
              >
                {t("auth.myContributions")} →
              </Link>

              {isCurator && (
                <Link
                  href="/curation"
                  className="mt-2 block text-sm font-medium text-primary hover:underline"
                >
                  {t("curation.navLink")} →
                </Link>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
