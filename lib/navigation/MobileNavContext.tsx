"use client";

// POST-MVP MOBILE PASS (§2/§3/§20): a tiny shared primitive so the
// header's menu button (in AppHeader) and the navigation sheet (in
// DashboardSidebar) can agree on one open/closed state without lifting
// it through every page that composes the two — those pages never need
// to know this state exists. Mounted once in Providers.tsx, above every
// route. No business logic here: purely presentational open/close
// state for the mobile navigation sheet.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface MobileNavContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav(): MobileNavContextValue {
  const ctx = useContext(MobileNavContext);
  // A component rendered outside the provider (shouldn't happen — it's
  // mounted at the root) degrades to always-closed, local-only state
  // rather than throwing, so a missing provider is never a hard crash.
  const [fallbackOpen, setFallbackOpen] = useState(false);
  if (ctx) return ctx;
  return { open: fallbackOpen, setOpen: setFallbackOpen };
}
