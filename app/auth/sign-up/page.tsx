"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { LogoMark } from "@/components/dashboard/LogoMark";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { signUpWithEmailAction, signInWithGoogleAction, type AuthActionResult } from "@/app/auth/actions";

function SubmitButton() {
  const { t } = useTranslation();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-full bg-primary py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? t("auth.signingUp") : t("auth.signUpTitle")}
    </button>
  );
}

export default function SignUpPage() {
  const { t } = useTranslation();
  const [state, formAction] = useFormState<AuthActionResult, FormData>(signUpWithEmailAction, {});

  if (state.success === "check_email") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
          <LogoMark size={30} />
          <h1 className="mt-4 font-display text-lg font-semibold text-ink-900">
            {t("auth.checkEmailTitle")}
          </h1>
          <p className="mt-2 text-sm text-ink-600">{t("auth.checkEmailBody")}</p>
          <Link href="/auth/sign-in" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
            {t("auth.backToSignIn")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex justify-center">
          <LogoMark size={30} />
        </div>
        <h1 className="mt-4 text-center font-display text-lg font-semibold text-ink-900">
          {t("auth.joinTitle")}
        </h1>
        <p className="mt-1 text-center text-sm text-ink-600">{t("auth.joinSubtitle")}</p>

        <form action={() => signInWithGoogleAction("/")}>
          <button
            type="submit"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface py-2.5 text-sm font-medium text-ink-900 transition-colors hover:border-primary/50"
          >
            {t("auth.continueWithGoogle")}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-ink-400">
          <div className="h-px flex-1 bg-line" />
          {t("auth.or")}
          <div className="h-px flex-1 bg-line" />
        </div>

        <form action={formAction} className="space-y-3">
          <input
            type="text"
            name="displayName"
            placeholder={t("auth.displayNamePlaceholder")}
            className="w-full rounded-full border border-line bg-canvas px-4 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
          />
          <input
            type="email"
            name="email"
            required
            placeholder={t("auth.emailPlaceholder")}
            className="w-full rounded-full border border-line bg-canvas px-4 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
          />
          <input
            type="password"
            name="password"
            required
            minLength={8}
            placeholder={t("auth.passwordPlaceholder")}
            className="w-full rounded-full border border-line bg-canvas px-4 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
          />
          {state.error && <p className="text-xs text-caution">{t(`authErrors.${state.error}`)}</p>}
          <SubmitButton />
        </form>

        <p className="mt-4 text-center text-xs text-ink-600">
          {t("auth.alreadyHaveAccount")}{" "}
          <Link href="/auth/sign-in" className="font-medium text-primary hover:underline">
            {t("auth.signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
