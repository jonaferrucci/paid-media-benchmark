"use client";

import { useFormState, useFormStatus } from "react-dom";
import { LogoMark } from "@/components/dashboard/LogoMark";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { resetPasswordAction, type AuthActionResult } from "@/app/auth/actions";

function SubmitButton() {
  const { t } = useTranslation();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-full bg-primary py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? t("auth.saving") : t("auth.resetPasswordButton")}
    </button>
  );
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [state, formAction] = useFormState<AuthActionResult, FormData>(resetPasswordAction, {});

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex justify-center">
          <LogoMark size={30} />
        </div>
        <h1 className="mt-4 text-center font-display text-lg font-semibold text-ink-900">
          {t("auth.resetPasswordTitle")}
        </h1>

        <form action={formAction} className="mt-4 space-y-3">
          <input
            type="password"
            name="password"
            required
            minLength={8}
            placeholder={t("auth.passwordPlaceholder")}
            className="w-full rounded-full border border-line bg-canvas px-4 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
          />
          <input
            type="password"
            name="confirmPassword"
            required
            minLength={8}
            placeholder={t("auth.confirmPasswordPlaceholder")}
            className="w-full rounded-full border border-line bg-canvas px-4 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
          />
          {state.error && <p className="text-xs text-caution">{t(`authErrors.${state.error}`)}</p>}
          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
