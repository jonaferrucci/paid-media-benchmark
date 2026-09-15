// Pure helpers shared by app/comparisons/actions.ts (server actions)
// and any client/test code that needs the exact same logic. NOT a
// "use server" file — Next.js requires every export from a "use
// server" file to be an async server action, so these plain,
// synchronous, independently-testable functions live here instead.

export const MAX_NAME_LENGTH = 120;

// Validates and normalizes a proposed name before it's ever sent to
// Postgres (the DB CHECK constraint is the real enforcement backstop;
// this just gives the UI a fast, specific error instead of a generic
// DB failure).
export function validateComparisonName(raw: string): { ok: true; name: string } | { ok: false; reason: "empty" | "too_long" } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_NAME_LENGTH) return { ok: false, reason: "too_long" };
  return { ok: true, name: trimmed };
}

// Minimal local shape -- avoids importing the full SavedComparison
// type from actions.ts here, keeping this module free of any
// dependency on the "use server" file (one-directional: actions.ts
// imports from pure.ts, never the other way around).
interface SavedComparisonLike {
  metric: string | null;
  platform: string;
  objective: string;
  vertical: string;
  country: string;
  audienceStrategy: string | null;
  funnelStage: string | null;
  businessModel: string | null;
  spendBand: string | null;
  durationBand: string | null;
  timeWindow: string | null;
}

// Converts a saved comparison back into the exact BenchmarkFormInput
// shape the real engine already accepts — no parallel logic, no
// duplicated statistics. Used by the reopen flow in BenchmarkExplorer.
export function savedComparisonToFormInput(saved: SavedComparisonLike) {
  return {
    metric: saved.metric ?? "",
    platform: saved.platform,
    objective: saved.objective,
    vertical: saved.vertical,
    country: saved.country,
    audienceStrategy: saved.audienceStrategy,
    funnelStage: saved.funnelStage,
    businessModel: saved.businessModel,
    spendBand: saved.spendBand,
    durationBand: saved.durationBand,
    timeWindow: saved.timeWindow ?? undefined,
  };
}
