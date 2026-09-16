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
  start_date: ["start date", "fecha inicio", "fecha de inicio", "inicio", "start"],
  end_date: ["end date", "fecha fin", "fecha de fin", "fin", "end"],
  currency: ["currency", "moneda", "divisa"],
  ad_spend: ["spend", "inversión", "inversion", "investment", "gasto", "presupuesto", "budget", "ad spend"],
  impressions: ["impressions", "impresiones", "imp"],
  reach: ["reach", "alcance"],
  clicks: ["clicks", "clics", "click"],
  link_clicks: ["link clicks", "clics en el enlace", "clics al enlace"],
  landing_page_views: ["landing page views", "vistas de landing", "lpv"],
  video_views: ["video views", "reproducciones", "vistas de video", "vistas de vídeo"],
  engagements: ["engagements", "interacciones"],
  conversions: ["conversions", "conversiones"],
  attributed_revenue: ["attributed revenue", "ingresos atribuidos", "revenue"],
  total_revenue: ["total revenue", "ingresos totales", "ingresos"],
};

function normalizeHeader(h: string): string {
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
