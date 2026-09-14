"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface UpdateProfileResult {
  error?: string;
  success?: boolean;
}

export async function updateProfileAction(
  _prev: UpdateProfileResult,
  formData: FormData
): Promise<UpdateProfileResult> {
  const displayName = String(formData.get("displayName") ?? "").trim();

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "not_authenticated" };

  // RLS policy "users update own profile" (auth.uid() = id) is the real
  // security boundary here — this update would fail even if the id
  // check below were somehow bypassed.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName || null })
    .eq("id", user.id);

  if (error) return { error: "generic_error" };

  revalidatePath("/account");
  return { success: true };
}
