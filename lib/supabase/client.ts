import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// Safe to import from "use client" components. The anon key only ever
// grants what Row Level Security allows (supabase/migrations/0007_row_
// level_security.sql) — it is not a privileged credential.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
