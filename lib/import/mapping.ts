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
  start_date: ["start date", "fecha inicio", "fecha de inicio", "inicio", "start", "reporting starts"],
  end_date: ["end date", "fecha fin", "fecha de fin", "fin", "end", "reporting ends"],
  currency: ["currency", "moneda", "divisa"],
  // "amount spent"/"importe gastado" (Meta) and bare "cost" (Google/
  // TikTok/Pinterest all label spend this way) are real platform-export
  // column names for the SAME ad_spend field Cucurucho already has —
  // not a new field.
  ad_spend: ["spend", "inversión", "inversion", "investment", "gasto", "presupuesto", "budget", "ad spend", "amount spent", "importe gastado", "cost"],
  // "Impr." is Google Ads' own abbreviation (the trailing "." is
  // stripped by normalizeHeader, same as any other punctuation).
  impressions: ["impressions", "impresiones", "imp", "impr"],
  reach: ["reach", "alcance"],
  // "Clicks (all)" (Meta) and "Pin clicks" (Pinterest — a click on the
  // pin itself, the same concept as a generic ad click) both mean the
  // same raw click count Cucurucho already tracks.
  clicks: ["clicks", "clics", "click", "clicks (all)", "pin clicks"],
  // "Outbound clicks" (Pinterest) is the same "click that leaves the
  // platform toward the advertiser's site" concept as Meta's own "link
  // clicks" — not a new metric.
  link_clicks: ["link clicks", "clics en el enlace", "clics al enlace", "outbound clicks"],
  landing_page_views: ["landing page views", "vistas de landing", "lpv"],
  video_views: ["video views", "reproducciones", "vistas de video", "vistas de vídeo"],
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
  attributed_revenue: ["attributed revenue", "ingresos atribuidos", "revenue", "purchase conversion value", "website purchases conversion value", "valor de conversión", "valor de conversion"],
  // "Facturación" (Mercado Libre Ads) buckets with the existing generic
  // "ingresos"/"total revenue" field, which already feeds the TACoS
  // (total-revenue-based) derived metric rather than ROAS/ACoS — a
  // deliberate, documented choice (see platformExports.ts) since a
  // marketplace "facturación" figure is typically broader than a single
  // ad's last-click attributed revenue.
  total_revenue: ["total revenue", "ingresos totales", "ingresos", "facturación", "facturacion"],
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
const IGNORED_HEADER_ALIASES: string[] = [
  // Derived/calculated metrics — never trusted from the source file.
  "ctr", "ctr (link click through rate)", "cpm", "cpc", "avg cpc", "cost / conv", "cost per conversion",
  "roas", "acos", "frequency", "frecuencia", "search impr share", "conv value",
  // A distinct, narrower definition than Cucurucho's own "video views"
  // (a 6-second-minimum view) — never conflated with the generic field.
  "6 second video views",
  // Row-identity / breakdown columns with no canonical field.
  "campaign", "campaign name", "nombre de la campaña", "campaña", "ad set name", "ad name",
  "ad group name", "campaign type", "day", "día",
];
// normalizeHeader is a hoisted function declaration (defined just
// below), so it's safely callable here even though this const is
// initialized first at module load — same normalization used
// everywhere else in this file and by platformExports.ts's detector.
const IGNORED_HEADER_SET = new Set(IGNORED_HEADER_ALIASES.map((h) => normalizeHeader(h)));

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
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
    // derived metric or a row-identity label (see IGNORED_HEADER_ALIASES
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
