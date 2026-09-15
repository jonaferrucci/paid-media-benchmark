import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// DANGER: this client uses the service role key and BYPASSES Row Level
// Security entirely. The "server-only" import above makes Next.js throw
// a build error if this file is ever imported from a "use client"
// component or any client-side bundle — do not remove it.
//
// Use only for:
//   - Admin operations (Phase 8+: taxonomy management, moderation)
//   - Trusted server-side aggregation that legitimately needs to read
//     across all users' data (e.g. a future benchmark computation job)
//
// Never use this client to satisfy a request you could instead serve
// through the RLS-scoped server client (server.ts) plus a policy.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        // Next.js patches the global fetch() to add its own Data Cache/
        // request-memoization behavior. This client performs live
        // cross-user aggregation queries and must never receive a
        // cached/stale response for one concurrent metric query while
        // a sibling query in the same Promise.all legitimately
        // resolves fresh — explicitly opting out here.
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
