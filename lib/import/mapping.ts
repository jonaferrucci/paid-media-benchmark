import type { CanonicalField, DetectedMapping, MappedRow, RawTable } from "./types";

// Deterministic alias dictionary (ES/EN + common LATAM/agency
// wording). Purely static lookup — no external/AI dependency, per
// Phase 16 item 10. Extend this list over time; it's the one place
// new header variants need to be added.
//
// NOTE: clipboard/"Pegar desde Excel" import is deferred from this
// pass (Phase 16 item 13 explicitly allows deferring it) but was
// designed for: clipboard TSV rows parse into the same RawTable shape
// (see parse.ts's toRawTable) and would flow through this exact same
// detectMapping/applyMapping/normalize/validate pipeline unchanged —
// no separate import engine would be needed to add it later.
const ALIASES: Record<CanonicalField, string[]> = {
  platform: ["platform", "plataforma", "canal", "media platform", "red", "medio"],
  objective: ["objective", "objetivo", "goal", "meta"],
  vertical: ["vertical", "category", "categoria", "categoría", "industry", "industria", "rubro"],
  country: ["country", "país", "pais", "mercado", "market"],
  business_model: ["business model", "modelo de negocio", "negocio"],
  audience_strategy: ["audience", "audiencia", "audience strategy", "estrategia de audiencia", "segmentacion", "segmentación"],
  funnel_stage: ["funnel", "funnel stage", "etapa", "etapa del funnel"],
  // Post-MVP: "Reporting starts"/"Reporting ends" are the exact column
  // names a Meta Ads Manager export uses for a date-range report — a
  // real, existing alias for the SAME canonical field, not a new one.
  // "Inicio del informe"/"Fin del informe" are the exact ES equivalent,
  // confirmed against a real Meta export (post-MVP fix) — same field.
  start_date: ["start date", "fecha inicio", "fecha de inicio", "inicio", "start", "reporting starts", "inicio del informe"],
  end_date: ["end date", "fecha fin", "fecha de fin", "fin", "end", "reporting ends", "fin del informe"],
  // "Código de moneda" is the exact column name a real Google Ads
  // export uses for a per-row currency code (§M) — a stronger, direct
  // signal than Meta's header-suffix inference, but the SAME canonical
  // field: it flows through the identical currency/validate pipeline.
  currency: ["currency", "moneda", "divisa", "código de moneda", "codigo de moneda"],
  // "amount spent"/"importe gastado" (Meta) and bare "cost"/"costo"
  // (Google/TikTok/Pinterest all label spend this way) are real
  // platform-export column names for the SAME ad_spend field Cucurucho
  // already has — not a new field. "Costo" is Google's own real export
  // label (confirmed against the real Google Ads fixture, §G).
  //
  // POST-MVP IMPORT FIX 3 (§G/§N): "presupuesto"/"budget" DELIBERATELY
  // REMOVED from this list. A real Google Ads export proves "Presupuesto"
  // (the campaign's configured budget CAP) and "Costo" (actual spend) are
  // two distinct real columns — aliasing "presupuesto" to ad_spend would
  // let it wrongly claim the field before "Costo" ever gets a chance
  // (detectMapping only auto-maps the FIRST matching column). "Presupuesto"
  // is real campaign-budget context now, not spend — see IGNORED_HEADERS
  // below.
  ad_spend: ["spend", "inversión", "inversion", "investment", "gasto", "ad spend", "amount spent", "importe gastado", "cost", "costo"],
  // "Impr." is Google Ads' own abbreviation (the trailing "." is
  // stripped by normalizeHeader, same as any other punctuation).
  impressions: ["impressions", "impresiones", "imp", "impr"],
  // "Usuarios únicos" (Google Ads, §G) is the same "distinct people
  // reached" concept as Meta's "reach"/"alcance" — mapped ONLY because
  // it's semantically compatible (a real per-user reach count), not a
  // generic "unique X" catch-all.
  reach: ["reach", "alcance", "usuarios únicos", "usuarios unicos"],
  // "Clicks (all)" (Meta) and "Pin clicks" (Pinterest — a click on the
  // pin itself, the same concept as a generic ad click) both mean the
  // same raw click count Cucurucho already tracks.
  clicks: ["clicks", "clics", "click", "clicks (all)", "pin clicks"],
  // "Outbound clicks" (Pinterest) is the same "click that leaves the
  // platform toward the advertiser's site" concept as Meta's own "link
  // clicks" — not a new metric.
  link_clicks: ["link clicks", "clics en el enlace", "clics al enlace", "outbound clicks"],
  landing_page_views: ["landing page views", "vistas de landing", "lpv"],
  // "Vistas de TrueView" (Google Ads, §I) is Google's own name for the
  // same "a user watched the video" concept as Cucurucho's generic
  // video_views field — mapped directly since a canonical field already
  // exists, so this never needs a manual-mapping prompt.
  video_views: ["video views", "reproducciones", "vistas de video", "vistas de vídeo", "vistas de trueview"],
  engagements: ["engagements", "interacciones"],
  // "Purchases"/"Leads" (Meta) and "Compras"/"Clientes potenciales"
  // (ES) and "Ventas" (Mercado Libre Ads) are all completed-conversion
  // counts — the same single "conversions" raw field
  // lib/metrics/derive.ts's CPA/CPL formulas already share (see that
  // file's own comment on why Sales and Leads share one field). "Results"
  // is deliberately NOT aliased here: its meaning changes by campaign
  // objective (could mean reach, engagement, or a conversion), so
  // guessing it would risk silently mis-mapping a non-conversion metric.
  conversions: ["conversions", "conversiones", "purchases", "leads", "compras", "clientes potenciales", "ventas"],
  // "Purchase conversion value" / "Website purchases conversion value"
  // (Meta) and "Valor de conversión" (ES) are the same attributed
  // revenue figure ROAS/ACOS are already derived from.
  // "Valor de conv." (Google Ads, §G) is Google's own abbreviation for
  // a conversion-attributed revenue figure — the same concept as
  // Meta's "purchase conversion value" — mapped where methodology
  // supports it (it feeds the same ROAS/ACOS-style derivation as any
  // other attributed_revenue source).
  attributed_revenue: ["attributed revenue", "ingresos atribuidos", "revenue", "purchase conversion value", "website purchases conversion value", "valor de conversión", "valor de conversion", "valor de conv."],
  // "Facturación" (Mercado Libre Ads) buckets with the existing generic
  // "ingresos"/"total revenue" field, which already feeds the TACoS
  // (total-revenue-based) derived metric rather than ROAS/ACoS — a
  // deliberate, documented choice (see platformExports.ts) since a
  // marketplace "facturación" figure is typically broader than a single
  // ad's last-click attributed revenue.
  total_revenue: ["total revenue", "ingresos totales", "ingresos", "facturación", "facturacion"],
  // Post-MVP row-level fix (§3): "Nombre de la campaña" (and its EN/
  // generic equivalents) is a REAL, existing field a source column maps
  // to now — previously bucketed into IGNORED_HEADERS as disposable
  // row-identity metadata. It flows through the same pipeline as every
  // other field (auto-recognized, shown in preview) but is never
  // persisted — see the "campaign_name" CanonicalField comment in
  // types.ts. "Ad set name"/"ad name"/"ad group name"/"campaign type"
  // stay in IGNORED_HEADERS below: those are a finer breakdown level
  // Cucurucho's schema has no field for at all, not the campaign's own
  // identity.
  campaign_name: ["campaign", "campaign name", "nombre de la campaña", "nombre de campaña", "campaña"],
  // POST-MVP IMPORT FIX 3 (§N): "Tipo de campaña" (Google Ads' own
  // subtype label, e.g. "Búsqueda"/"Máximo rendimiento") is a real,
  // existing field a source column maps to now — previously bucketed
  // into IGNORED_HEADERS as disposable context. Review/context-only,
  // never taxonomy-resolved or persisted — see the "campaign_type"
  // CanonicalField comment in types.ts for why real campaign_type_id
  // resolution is deliberately deferred.
  campaign_type: ["campaign type", "tipo de campaña", "tipo de campana"],
};

// Real ad-platform export columns that Cucurucho recognizes but never
// imports — either because Cucurucho DERIVES the same figure itself
// from raw values (lib/metrics/derive.ts: CTR/CPM/CPC/ROAS/ACOS/
// frequency/etc. — importing a platform's own pre-calculated version
// would risk a silently conflicting number) or because the column is a
// row-identity/breakdown label Cucurucho's schema has no per-row field
// for (campaign/ad set/ad name, campaign type, a daily "Day" column).
// Matching one of these marks the column "ignored" automatically
// instead of dumping it into "needs review" — the user never has to
// manually dismiss a column Cucurucho already understands and
// deliberately won't use.
// A small, known currency-code allowlist — NOT a bare \([a-z]{3}\)
// heuristic, which would risk stripping a real 3-letter semantic
// qualifier (e.g. "(all)", "(new)") that happens to fit the same
// shape. Real ad-platform exports commonly append a trailing
// "(USD)"-style currency-code suffix to monetary/derived-metric column
// headers (confirmed against a real Meta export: "Importe gastado
// (USD)", "CPM (coste por 1000 impresiones) (USD)") — stripping ONLY
// this specific, deterministic shape lets e.g. "Importe gastado (USD)"
// still match the exact same alias as bare "Importe gastado", without
// risking an accidental match on some other trailing parenthetical
// (like "Resultados (iniciales)", which must stay distinct from bare
// "Resultados" — see IGNORED_HEADERS below).
//
// Declared here (before IGNORED_HEADERS/normalizeHeader's first call)
// because — unlike normalizeHeader itself, a hoisted function
// declaration — a `const` is NOT usable before its own declaration
// runs; normalizeHeader references this at module-init time via the
// IGNORED_HEADER_SET/IGNORED_HEADER_REASONS built below.
const CURRENCY_SUFFIX_RE = /\s*\((usd|ars|mxn|brl|clp|cop|pen|uyu|eur|gbp|cad|aud)\)\s*$/i;

// Post-MVP row-level fix (§4): exposes the actual matched currency code
// from a header's trailing "(USD)"-style suffix — normalizeHeader below
// only ever DISCARDS this suffix for matching purposes; this is the one
// place that reads the code itself, so platformExports.ts's
// detectReportCurrency can auto-detect the report's currency from
// header shape alone, without a dedicated currency column.
export function extractCurrencySuffix(header: string): string | null {
  const match = header.match(CURRENCY_SUFFIX_RE);
  return match ? match[1].toUpperCase() : null;
}

type IgnoredReason = "derived" | "context" | "row_semantic";
const IGNORED_HEADERS: { header: string; reason: IgnoredReason }[] = [
  // Derived/calculated metrics — never trusted from the source file.
  { header: "ctr", reason: "derived" },
  { header: "ctr (link click through rate)", reason: "derived" },
  { header: "cpm", reason: "derived" },
  { header: "cpc", reason: "derived" },
  { header: "avg cpc", reason: "derived" },
  { header: "cost / conv", reason: "derived" },
  { header: "cost per conversion", reason: "derived" },
  { header: "roas", reason: "derived" },
  { header: "acos", reason: "derived" },
  { header: "frequency", reason: "derived" },
  { header: "frecuencia", reason: "derived" },
  { header: "search impr share", reason: "derived" },
  { header: "conv value", reason: "derived" },
  // A distinct, narrower definition than Cucurucho's own "video views"
  // (a 6-second-minimum view) — never conflated with the generic field.
  { header: "6 second video views", reason: "derived" },
  // Row-identity / breakdown columns with no canonical field. NOTE:
  // "campaign"/"campaign name"/"nombre de la campaña"/"campaña" moved
  // OUT of this list in the row-level fix (§3) — they're now a real
  // ALIASES.campaign_name mapping instead, since campaign identity is
  // never disposable. What's left here is a finer breakdown level
  // ("which ad set/ad within the campaign") Cucurucho's schema has no
  // field for at all.
  { header: "ad set name", reason: "context" },
  { header: "ad name", reason: "context" },
  { header: "ad group name", reason: "context" },
  { header: "day", reason: "context" },
  { header: "día", reason: "context" },
  // Post-MVP real-Meta-export fix: headers confirmed against an actual
  // Meta Ads export that weren't previously recognized at all (they
  // fell into "needs review" even though Cucurucho already understands
  // exactly what they are and exactly why it won't import them).
  //
  // "Coste por 1000 cuentas de Meta alcanzadas" and "CPM (coste por
  // 1000 impresiones)"/"CPC (todos)" are Meta-specific calculated cost
  // metrics (after normalizeHeader strips the trailing "(USD)"
  // currency suffix — see CURRENCY_SUFFIX_RE below) — same "derived,
  // never trusted from the file" reasoning as bare cpm/cpc/roas/acos.
  { header: "coste por 1000 cuentas de meta alcanzadas", reason: "derived" },
  { header: "cpm (coste por 1000 impresiones)", reason: "derived" },
  { header: "cpc (todos)", reason: "derived" },
  // Post-MVP row-level fix (§2/§8): "Resultados" and its paired
  // "Indicador de resultado" have no SINGLE canonical field for the
  // whole file — a real Meta report can (and, per the canonical
  // fixture, does) mix result types row by row. Both are recognized
  // and classified as a distinct "row_semantic" reason (never dumped
  // into "needs review" as a giant unresolved mapping) — the review UI
  // shows a "Resultado contextual" explanation instead of a column
  // picker, and the ACTUAL per-row interpretation happens in
  // resolveMetaResultForRow (platformExports.ts), reading the raw
  // per-row values directly rather than a static header alias.
  { header: "resultados", reason: "row_semantic" },
  { header: "indicador de resultado", reason: "row_semantic" },
  // Meta's own campaign delivery/status label — real metadata, no
  // canonical field.
  { header: "entrega de la campaña", reason: "context" },
  // An audience/account-level count, not a per-campaign performance
  // raw metric Cucurucho's schema tracks.
  { header: "seguidores de instagram", reason: "context" },
  // "(iniciales)"/"(inicial)": Meta's pre-attribution-window snapshot
  // of the same result Cucurucho already captures from the primary
  // "Resultados"/"Indicador de resultado" pair — importing these too
  // would double-count the same conversion concept, so they're always
  // recognized-but-not-imported, regardless of how "Resultados" itself
  // resolves.
  { header: "resultados (iniciales)", reason: "context" },
  { header: "indicador de resultados (inicial)", reason: "context" },
  // POST-MVP IMPORT FIX 3 (§H): real Google Ads export columns that are
  // themselves derived/calculated by Google FROM raw metrics Cucurucho
  // already imports (cost, clicks, conversions, conversion value) — the
  // exact same "never trust a platform's own pre-calculated figure over
  // Cucurucho's own methodology" reasoning as ctr/cpm/cpc/roas above.
  // Recognized so they're never dumped into "needs review" as a
  // mysterious unmapped column; the review UI can label these
  // "Cucurucho la calcula" instead of asking the user to map them.
  { header: "porcentaje de interacción", reason: "derived" },
  { header: "costo prom.", reason: "derived" },
  { header: "prom. cpc", reason: "derived" },
  { header: "costo/conv.", reason: "derived" },
  { header: "cpm prom.", reason: "derived" },
  { header: "valor de conv./costo", reason: "derived" },
  { header: "porcentaje de conv.", reason: "derived" },
  // POST-MVP IMPORT FIX 3 (§I): partial-video-completion breakdown
  // columns — a finer-grained concept than Cucurucho's single generic
  // "video views" field (which "Vistas de TrueView" maps to instead,
  // above). Recognized as known contextual metrics, never a mysterious
  // unmapped field requiring manual mapping.
  { header: "video reproducido al 25 %", reason: "context" },
  { header: "video reproducido al 50 %", reason: "context" },
  { header: "video reproducido al 75 %", reason: "context" },
  { header: "video reproducido al 100 %", reason: "context" },
  // POST-MVP IMPORT FIX 3 (§G/§N): real Google Ads row-identity/status/
  // budget/targeting metadata with no canonical field Cucurucho tracks
  // per row — the same "context, not a raw performance metric" bucket
  // as Meta's "entrega de la campaña"/"seguidores de instagram" above.
  { header: "estado de la campaña", reason: "context" },
  { header: "presupuesto", reason: "context" },
  { header: "nombre del presupuesto", reason: "context" },
  { header: "tipo de presupuesto", reason: "context" },
  { header: "estado", reason: "context" },
  { header: "motivos del estado", reason: "context" },
  { header: "% impr. (absoluto parte sup.)", reason: "context" },
  { header: "% impr. (parte sup.)", reason: "context" },
  { header: "nivel de optimización", reason: "context" },
  { header: "tipo de estrategia de oferta", reason: "context" },
];
// normalizeHeader is a hoisted function declaration (defined just
// below), so it's safely callable here even though this const is
// initialized first at module load — same normalization used
// everywhere else in this file and by platformExports.ts's detector.
const IGNORED_HEADER_SET = new Set(IGNORED_HEADERS.map((h) => normalizeHeader(h.header)));
const IGNORED_HEADER_REASONS = new Map<string, IgnoredReason>(IGNORED_HEADERS.map((h) => [normalizeHeader(h.header), h.reason]));

// Returns why a given source header was auto-ignored — used by the
// review UI to explain itself instead of a bare "Ignoradas" (post-MVP
// real-Meta-export fix): "context" is a safe default for a header not
// found here (callers only ever call this for a header already known
// to be in the "ignored" state).
export function ignoredReasonForHeader(header: string): IgnoredReason {
  return IGNORED_HEADER_REASONS.get(normalizeHeader(header)) ?? "context";
}

// ADAPTIVE PLATFORM IMPORT ARCHITECTURE (§6): a coarser, UI-facing
// classification collapsing DetectedMapping's 3 pipeline states + the
// ignored reason into the 4 labels a review screen actually needs to
// show. "exact" (a real alias-dictionary match — every current mapping
// is a deterministic exact match, never a fuzzy guess, so there is no
// separate "high_confidence" tier to distinguish it from yet: a real
// future fuzzy-matched case would be the first to earn that label).
// "derived"/"contextual" mirror IGNORED_HEADERS' own reasons 1:1
// (row_semantic folds into "contextual" — a per-row-resolved result is
// exactly as non-blocking and non-configurable as a static context
// column, from the review screen's point of view). "ambiguous" is the
// ONLY state that should ever demand a manual dropdown (§6: "Only
// ambiguous fields should demand manual action"). "unsupported" is
// reserved for a column Cucurucho recognizes but that this file's
// PLATFORM/PROFILE can't safely use — no real case exists yet (every
// recognized column today is either always-safe or always-derived), so
// it's declared for completeness but never returned; a real future case
// would return it here rather than inventing a second classifier.
export type FieldConfidence = "exact" | "high_confidence" | "contextual" | "derived" | "unsupported" | "ambiguous";

export function classifyFieldConfidence(mapping: DetectedMapping): FieldConfidence {
  if (mapping.state === "mapped") return "exact";
  if (mapping.state === "needs_review") return "ambiguous";
  // state === "ignored"
  const reason = ignoredReasonForHeader(mapping.sourceHeader);
  return reason === "derived" ? "derived" : "contextual";
}

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(CURRENCY_SUFFIX_RE, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents for comparison
    .replace(/[_\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Builds a reverse lookup once: normalized alias string -> canonical field.
const ALIAS_LOOKUP: Map<string, CanonicalField> = new Map();
for (const [field, aliases] of Object.entries(ALIASES) as [CanonicalField, string[]][]) {
  for (const alias of aliases) {
    ALIAS_LOOKUP.set(normalizeHeader(alias), field);
  }
}

// Suggests a mapping for every source column. A canonical field can
// only be auto-mapped to ONE source column — if two source headers
// alias to the same canonical field, only the first (by column order)
// is auto-mapped; the rest are left "needs_review" rather than
// silently creating a duplicate mapping (Phase 16 item 12).
export function detectMapping(table: RawTable): DetectedMapping[] {
  const claimed = new Set<CanonicalField>();
  return table.headers.map((header, index) => {
    const normalized = normalizeHeader(header);
    const candidate = ALIAS_LOOKUP.get(normalized);
    if (candidate && !claimed.has(candidate)) {
      claimed.add(candidate);
      return { sourceHeader: header, sourceColumnIndex: index, canonicalField: candidate, state: "mapped" as const };
    }
    // Post-MVP ad-platform import: a column Cucurucho RECOGNIZES as a
    // derived metric or a row-identity label (see IGNORED_HEADERS
    // above) is auto-ignored rather than dumped into "needs review" —
    // the user only ever reviews columns that are genuinely unknown.
    if (IGNORED_HEADER_SET.has(normalized)) {
      return { sourceHeader: header, sourceColumnIndex: index, canonicalField: null, state: "ignored" as const };
    }
    return { sourceHeader: header, sourceColumnIndex: index, canonicalField: null, state: "needs_review" as const };
  });
}

// Returns true if assigning `field` to `columnIndex` would create a
// duplicate canonical-field mapping among the OTHER currently-mapped
// columns — used by the UI to block/flag conflicting manual choices.
export function wouldConflict(mappings: DetectedMapping[], columnIndex: number, field: CanonicalField): boolean {
  return mappings.some((m) => m.sourceColumnIndex !== columnIndex && m.state === "mapped" && m.canonicalField === field);
}

// POST-MVP IMPORT FIX 3 (§J): real Google Ads exports include aggregate
// summary rows ("Total: Campañas", "Total: Cuenta", "Total: Búsqueda",
// "Total: Máximo rendimiento", ...) mixed in with real per-campaign
// rows. These must NEVER be imported as individual campaigns — that
// would both double-count spend/impressions/etc. against the real rows
// they summarize AND import a non-campaign as if it were one.
//
// Deliberately GENERIC/platform-agnostic (§S: "do not overfit") — never
// hardcodes Google's specific total-row labels. Instead: (1) finds
// whichever source column is mapped to campaign_name via the same
// ALIAS_LOOKUP every other header goes through, then (2) excludes any
// row whose value in that column starts with "Total:" (a report
// aggregate row is universally labeled this way across export tools,
// not just Google's). A file with no campaign-identity column at all
// (e.g. a generic manual-entry template) safely no-ops: 0 excluded,
// table unchanged.
const AGGREGATE_TOTAL_ROW_RE = /^total\s*:/i;

export function excludeAggregateTotalRows(table: RawTable): { table: RawTable; excludedCount: number } {
  const campaignNameColumnIndex = table.headers.findIndex(
    (header) => ALIAS_LOOKUP.get(normalizeHeader(header)) === "campaign_name"
  );
  if (campaignNameColumnIndex === -1) {
    return { table, excludedCount: 0 };
  }
  const keptRows: string[][] = [];
  let excludedCount = 0;
  for (const row of table.rows) {
    const value = row[campaignNameColumnIndex] ?? "";
    if (AGGREGATE_TOTAL_ROW_RE.test(value.trim())) {
      excludedCount++;
    } else {
      keptRows.push(row);
    }
  }
  if (excludedCount === 0) return { table, excludedCount: 0 };
  return { table: { headers: table.headers, rows: keptRows }, excludedCount };
}

// Applies a finalized mapping to every raw row, producing the
// intermediate MappedRow shape (still raw strings) that normalize.ts
// then processes.
export function applyMapping(table: RawTable, mappings: DetectedMapping[]): MappedRow[] {
  const activeMappings = mappings.filter((m) => m.state === "mapped" && m.canonicalField);
  return table.rows.map((row) => {
    const mapped: MappedRow = {};
    for (const m of activeMappings) {
      const value = row[m.sourceColumnIndex];
      if (value !== undefined && value !== "") {
        mapped[m.canonicalField as CanonicalField] = value;
      }
    }
    return mapped;
  });
}
