"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { LogoMark } from "@/components/dashboard/LogoMark";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { forgotPasswordAction, type AuthActionResult } from "@/app/auth/actions";

function SubmitButton() {
  const { t } = useTranslation();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-full bg-primary py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? t("auth.sending") : t("auth.sendResetLink")}
    </button>
  );
}

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [state, formAction] = useFormState<AuthActionResult, FormData>(forgotPasswordAction, {});

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex justify-center">
          <LogoMark size={30} />
        </div>
        <h1 className="mt-4 text-center font-display text-lg font-semibold text-ink-900">
          {t("auth.forgotPasswordTitle")}
        </h1>

        {state.success === "reset_email_sent" ? (
          <p className="mt-4 rounded-xl bg-pistachio-soft px-3 py-3 text-center text-sm text-pistachio">
            {t("auth.resetEmailSentBody")}
          </p>
        ) : (
          <>
            <p className="mt-2 text-center text-sm text-ink-600">{t("auth.forgotPasswordBody")}</p>
            <form action={formAction} className="mt-4 space-y-3">
              <input
                type="email"
                name="email"
                required
                placeholder={t("auth.emailPlaceholder")}
                className="w-full rounded-full border border-line bg-canvas px-4 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
              />
              {state.error && <p className="text-xs text-caution">{t(`authErrors.${state.error}`)}</p>}
              <SubmitButton />
            </form>
          </>
        )}

        <Link
          href="/auth/sign-in"
          className="mt-4 block text-center text-xs font-medium text-primary hover:underline"
        >
          {t("auth.backToSignIn")}
        </Link>
      </div>
    </div>
  );
}
