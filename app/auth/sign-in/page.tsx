"use client";

import { Suspense, useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogoMark } from "@/components/dashboard/LogoMark";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { signInWithEmailAction, signInWithGoogleAction, type AuthActionResult } from "@/app/auth/actions";

function SubmitButton({ labelKey, loadingKey }: { labelKey: string; loadingKey: string }) {
  const { t } = useTranslation();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-full bg-primary py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? t(loadingKey) : t(labelKey)}
    </button>
  );
}

function SignInForm() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";
  const oauthError = searchParams.get("error");
  const resetSuccess = searchParams.get("reset") === "success";

  const [state, formAction] = useFormState<AuthActionResult, FormData>(signInWithEmailAction, {});

  // RELEASE POLISH (Section 4 — login error accessibility): the error
  // message below was plain text with no live-region semantics and no
  // link to the form fields — a screen reader user who submits an
  // invalid login gets no indication anything happened. role="alert"
  // (an implicit assertive live region, designed specifically for
  // content that appears after the fact, like this one) plus
  // aria-describedby on both inputs gives that announcement and ties it
  // to the fields it's about; moving focus to the message on a new
  // error guarantees it's actually noticed, not just technically
  // announceable. Never changes signInWithEmailAction or its error
  // values — only how the existing error is exposed.
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex justify-center">
          <LogoMark size={30} />
        </div>
        <h1 className="mt-4 text-center font-display text-lg font-semibold text-ink-900">
          {t("auth.signInTitle")}
        </h1>

        {resetSuccess && (
          <p className="mt-3 rounded-xl bg-pistachio-soft px-3 py-2 text-center text-xs text-pistachio">
            {t("auth.resetPasswordButton")} ✓
          </p>
        )}
        {oauthError === "oauth_unavailable" && (
          <p className="mt-3 rounded-xl bg-caution-soft px-3 py-2 text-center text-xs text-caution">
            {t("authErrors.oauth_unavailable")}
          </p>
        )}

        <form action={() => signInWithGoogleAction(redirectTo)}>
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
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input
            type="email"
            name="email"
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "signin-error" : undefined}
            placeholder={t("auth.emailPlaceholder")}
            className="w-full rounded-full border border-line bg-canvas px-4 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
          />
          <input
            type="password"
            name="password"
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "signin-error" : undefined}
            placeholder={t("auth.passwordPlaceholder")}
            className="w-full rounded-full border border-line bg-canvas px-4 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
          />
          {state.error && (
            <p id="signin-error" ref={errorRef} role="alert" tabIndex={-1} className="text-xs text-caution outline-none">
              {t(`authErrors.${state.error}`)}
            </p>
          )}
          <SubmitButton labelKey="auth.signInTitle" loadingKey="auth.signingIn" />
        </form>

        <div className="mt-4 flex flex-col items-center gap-2 text-xs text-ink-600">
          <Link href="/auth/forgot-password" className="text-primary hover:underline">
            {t("auth.forgotPasswordLink")}
          </Link>
          <p>
            {t("auth.noAccountYet")}{" "}
            <Link href="/auth/sign-up" className="font-medium text-primary hover:underline">
              {t("auth.signUpLink")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
