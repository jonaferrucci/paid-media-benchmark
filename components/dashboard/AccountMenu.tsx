"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, User as UserIcon } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { signOutAction } from "@/app/auth/actions";

interface AccountMenuProps {
  user: User;
}

export function AccountMenu({ user }: AccountMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setDisplayName(data?.display_name ?? null));
  }, [user.id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const label = displayName || user.email?.split("@")[0] || "";

  return (
    <div ref={ref} className="relative">
      {/* POST-MVP MOBILE PASS §2: avatar-only below sm — the name +
          chevron are real horizontal cost the mobile header's priority
          row (search icon / account / menu) can't spare. The full
          name+chevron pill returns at sm+, unchanged. Kept at a 44px
          touch target throughout (§14). */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={label ? `${t("auth.myAccount")}: ${label}` : t("auth.myAccount")}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-canvas text-ink-900 hover:border-primary/40 sm:h-auto sm:w-auto sm:gap-1.5 sm:py-1 sm:pl-1 sm:pr-2.5 sm:text-sm sm:font-medium"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-primary">
          <UserIcon size={13} />
        </span>
        <span className="hidden max-w-[100px] truncate sm:inline">{label}</span>
        <ChevronDown size={13} className="hidden text-ink-400 sm:inline" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl border border-line bg-surfaceElevated p-1.5 shadow-lg">
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2 text-sm text-ink-900 hover:bg-canvas"
          >
            {t("auth.myAccount")}
          </Link>
          <Link
            href="/account/contributions"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2 text-sm text-ink-900 hover:bg-canvas"
          >
            {t("auth.myContributions")}
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="block w-full rounded-xl px-3 py-2 text-left text-sm text-caution hover:bg-caution-soft"
            >
              {t("auth.signOut")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
