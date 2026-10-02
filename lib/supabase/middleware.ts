import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session on every request so Server
// Components always see a valid (non-expired) session, and writes any
// refreshed cookies onto the response. This does not itself protect
// any route — see PROTECTED_PREFIXES below for the redirect logic.
//
// RELEASE POLISH (Section 5 — protected route consistency). Audited
// current behavior across every authenticated surface before changing
// anything:
//   - /account and /contribute (and everything nested under them,
//     e.g. /account/contributions/*) were already redirected here —
//     the one real "redirect to login with a return destination" rule
//     in the app.
//   - /comparisons had NO redirect at all: the page always rendered,
//     and SavedComparisonsList.tsx's own client-side `!user` branch
//     showed an in-place "sign in to see this" card instead (added
//     deliberately — see that file's own "item 24" comment — but never
//     reconciled with /account already doing the opposite for the
//     exact same kind of page: a user-specific workspace with nothing
//     to show a signed-out visitor).
//   - /curation also had no redirect: CurationPage's own server-side
//     getCurrentProfileIsCurator() check renders CurationGate in place
//     for BOTH a signed-out visitor and a signed-in non-curator —
//     correct and necessary for the non-curator case (redirecting an
//     already-authenticated non-curator to /auth/sign-in would be
//     nonsensical), but inconsistent with every other workspace for
//     the plain signed-out case.
//
// Fix: /comparisons and /curation join the one existing redirect rule
// for the signed-out case — "a user-specific workspace redirects to
// login with ?redirect=<path>" — exactly like /account already does,
// no new mechanism. CurationPage's own curator-vs-signed-in check is
// completely untouched (middleware only ever knows "is there a
// session", never "is this user a curator" — that stays a server-side,
// RLS-backed check exactly as before); a signed-in non-curator still
// reaches CurationGate's "you need curator access" message exactly as
// before. No permission or RLS change anywhere (per this phase's
// explicit "do NOT change permissions/RLS").
export const PROTECTED_PREFIXES = ["/account", "/contribute", "/comparisons", "/curation"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix)
  );

  if (isProtected && !user) {
    const redirectUrl = new URL("/auth/sign-in", request.url);
    redirectUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
