"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface AuthActionResult {
  error?: string;
  success?: string;
}

// Maps known Supabase Auth error messages to friendlier, localization-
// key-agnostic strings. The calling client component is responsible for
// localizing these via a lookup — see components/auth/authErrors.ts.
// We deliberately do not pass the raw Supabase error message through,
// since some reveal implementation details (e.g. exact rate-limit
// wording) or are only in English.
function friendlyErrorKey(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "invalid_credentials";
  if (m.includes("already registered") || m.includes("already exists")) return "account_exists";
  if (m.includes("password should be at least")) return "weak_password";
  if (m.includes("rate limit")) return "rate_limited";
  if (m.includes("email not confirmed")) return "email_not_confirmed";
  if (m.includes("expired") || m.includes("invalid")) return "link_expired";
  return "generic_error";
}

function getOrigin() {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const protocol = h.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

export async function signInWithEmailAction(
  _prev: AuthActionResult,
  formData: FormData
): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/");

  if (!email || !password) return { error: "missing_fields" };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: friendlyErrorKey(error.message) };

  redirect(redirectTo || "/");
}

export async function signUpWithEmailAction(
  _prev: AuthActionResult,
  formData: FormData
): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password) return { error: "missing_fields" };
  if (password.length < 8) return { error: "weak_password" };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getOrigin()}/auth/callback`,
      // Stored in auth.users.raw_user_meta_data — the profile-sync
      // trigger (0009_profile_sync.sql) reads this to pre-fill
      // profiles.display_name so the user doesn't have to set it twice.
      data: displayName ? { display_name: displayName } : undefined,
    },
  });

  if (error) return { error: friendlyErrorKey(error.message) };

  // If email confirmation is required by the project's Auth settings,
  // there is no session yet at this point — data.session is null and
  // the user must click the confirmation link before signing in.
  if (!data.session) {
    return { success: "check_email" };
  }

  redirect("/");
}

export async function signInWithGoogleAction(redirectTo?: string) {
  const supabase = createServerSupabaseClient();
  const callbackUrl = new URL("/auth/callback", getOrigin());
  if (redirectTo) callbackUrl.searchParams.set("redirect", redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl.toString() },
  });

  if (error || !data.url) {
    // No Google/Supabase OAuth provider configured in this environment
    // — see Phase 3 report "Google OAuth Status" for exactly what that
    // means and what would need to be configured in a real project.
    redirect("/auth/sign-in?error=oauth_unavailable");
  }

  redirect(data.url);
}

export async function signOutAction() {
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function forgotPasswordAction(
  _prev: AuthActionResult,
  formData: FormData
): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "missing_fields" };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getOrigin()}/auth/reset-password`,
  });

  // Always return the same success state regardless of whether the
  // email exists, to avoid leaking which addresses have accounts.
  if (error && !error.message.toLowerCase().includes("rate limit")) {
    return { success: "reset_email_sent" };
  }
  if (error) return { error: friendlyErrorKey(error.message) };

  return { success: "reset_email_sent" };
}

export async function resetPasswordAction(
  _prev: AuthActionResult,
  formData: FormData
): Promise<AuthActionResult> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password) return { error: "missing_fields" };
  if (password.length < 8) return { error: "weak_password" };
  if (password !== confirmPassword) return { error: "password_mismatch" };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: friendlyErrorKey(error.message) };

  redirect("/auth/sign-in?reset=success");
}
