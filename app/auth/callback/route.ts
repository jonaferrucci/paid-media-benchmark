import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Reached after: (1) Google OAuth redirects back with a `code`, or
// (2) a user clicks an email confirmation / magic link. Either way, we
// exchange the code for a real Supabase session (cookies set via the
// server client) and then redirect into the app.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirect") ?? "/";

  if (code) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/auth/sign-in?error=oauth_unavailable`);
    }
  }

  return NextResponse.redirect(`${origin}${redirectTo}`);
}
