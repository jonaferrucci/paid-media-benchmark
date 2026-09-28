"use server";

import { getCoverageGrid, COVERAGE_METRIC_KEYS, type CoverageGrid } from "@/lib/benchmark/coverage";
import type { TimeWindowInput } from "@/lib/benchmark/types";

// CUCURUCHO INTELLIGENCE 4 — COVERAGE MAP V1.
//
// Coverage V1 always uses a fixed, non-selectable Time Window — the
// same "current coverage only" decision the locked spec makes
// explicitly ("historical relationship": Coverage shows the current
// window, never a per-cell historical trend; that stays future work).
// "last_12_months" is one of lib/benchmark/timeWindow.ts's existing,
// unmodified TimeWindowInput kinds — this is a presentation choice, not
// a new time-window concept.
const COVERAGE_TIME_WINDOW: TimeWindowInput = { kind: "last_12_months" };

export interface CoverageGridRequest {
  platform: string;
  objective: string;
  country: string;
}

export type CoverageGridActionResult = { ok: true; grid: CoverageGrid } | { ok: false };

/**
 * Server-side bridge between the Coverage UI and lib/benchmark/
 * coverage.ts — mirrors app/benchmark/actions.ts's own convention
 * exactly: no statistical logic here, and any unexpected failure
 * (connection issue, malformed query) is caught, logged server-side
 * only, and degraded to a generic failure the client can show a plain
 * retry state for — never a raw exception message or stack trace.
 */
export async function fetchCoverageGrid(request: CoverageGridRequest, verticalKeys: string[]): Promise<CoverageGridActionResult> {
  try {
    const grid = await getCoverageGrid(
      { platform: request.platform, objective: request.objective, country: request.country, timeWindow: COVERAGE_TIME_WINDOW },
      verticalKeys,
      [...COVERAGE_METRIC_KEYS]
    );
    return { ok: true, grid };
  } catch (err) {
    console.error("[coverage] fetchCoverageGrid failed:", err);
    return { ok: false };
  }
}
