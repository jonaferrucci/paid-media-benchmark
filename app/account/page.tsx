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
  const [state, formAction] = useFormState<UpdateProfileResult, FormData>(updateProfileAction, {});

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? "");
        setProfileLoaded(true);
      });
  }, [user]);

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-56">
        <main className="mx-auto max-w-lg px-4 py-8 md:px-8">
          <h1 className="font-display text-xl font-semibold text-ink-900">{t("account.title")}</h1>

          {loading || !user ? (
            <p className="mt-6 text-sm text-ink-600">{t("account.loading")}</p>
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
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
