"use client";

// Phase 9 production-blocker fix: shown when taxonomy loading fails
// server-side (see lib/contribute/taxonomies.ts's hasError flag), so
// the user never sees silently-empty dropdowns without explanation.
// Never renders any Supabase error message, code, or technical detail
// — those are logged server-side only (see taxonomies.ts).
export function TaxonomyLoadError() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
      <p className="font-display text-base font-semibold text-ink-900">
        No pudimos cargar las opciones del benchmark
      </p>
      <p className="mt-2 text-sm text-ink-600">
        Intentá nuevamente en unos segundos. Si el problema continúa, volvé a intentarlo más tarde.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        Reintentar
      </button>
    </div>
  );
}
