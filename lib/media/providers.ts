// Phase 18 item 7: a clean adapter boundary so future automated
// ingestion (YouTube Data API, an analytics provider, etc.) can be
// added later WITHOUT scraping, API credentials, or background jobs
// in this phase. Every provider eventually normalizes into the exact
// same canonical shape that manual entry and CSV/XLSX import already
// produce — one snapshot model, many sources.

export type ProviderSourceType =
  | "youtube"
  | "official_media_kit"
  | "official_website"
  | "manual_verified"
  | "analytics_provider"
  | "other";

// A generic external provider record — shaped loosely enough to
// represent a future YouTube Data API channel-statistics response, an
// analytics-provider export, or any similar structured source,
// without committing to one provider's exact schema today.
export interface ProviderRecord {
  externalEntityId: string; // e.g. a YouTube channel ID
  metricKey: string; // maps to public_media_metric_definitions.internal_key
  value: number;
  observedAt: string; // YYYY-MM-DD
  sourceType: ProviderSourceType;
  sourceReference?: string;
}

export interface CanonicalSnapshotPayload {
  platformId: string;
  metricDefinitionId: string;
  value: number;
  observedAt: string;
  source: ProviderSourceType;
  sourceReference?: string;
}

// The adapter's ONLY job: resolve a provider's external identifiers
// into Cucurucho's real internal ids, and pass the rest through
// unchanged. `resolvePlatformId`/`resolveMetricDefinitionId` are
// injected so this stays a pure function — the actual DB lookups
// happen at the call site (e.g. lib/media/catalog.ts), never here.
export function normalizeProviderRecord(
  record: ProviderRecord,
  resolvePlatformId: (externalEntityId: string) => string | null,
  resolveMetricDefinitionId: (metricKey: string) => string | null
): CanonicalSnapshotPayload | null {
  const platformId = resolvePlatformId(record.externalEntityId);
  const metricDefinitionId = resolveMetricDefinitionId(record.metricKey);
  if (!platformId || !metricDefinitionId) return null;
  if (!Number.isFinite(record.value) || record.value < 0) return null;

  return {
    platformId,
    metricDefinitionId,
    value: record.value,
    observedAt: record.observedAt,
    source: record.sourceType,
    sourceReference: record.sourceReference,
  };
}
