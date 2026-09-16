"use client";

import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import { submitPublicMetricSnapshotAction, submitRateCardAction, type RateCardInput } from "@/lib/media/actions";
import type { MediaProfile } from "@/lib/media/catalog";
import { SUPPORTED_CURRENCIES, isSupportedCurrencyCode } from "@/lib/config/currencies";

const PRICING_UNITS: RateCardInput["pricingUnit"][] = [
  "per_integration", "per_spot", "per_mention", "per_day", "per_week", "per_month", "per_thousand", "package", "custom",
];

export function AddMetricSnapshotForm({ platformId, metricDefinitions }: { platformId: string; metricDefinitions: MediaProfile["metricDefinitions"] }) {
  const { t } = useTranslation();
  const { user } = useSupabaseUser();
  const [expanded, setExpanded] = useState(false);
  const [metricId, setMetricId] = useState(metricDefinitions[0]?.id ?? "");
  const [value, setValue] = useState("");
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  if (!user || metricDefinitions.length === 0) return null;
  if (status === "saved") {
    return <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-pistachio"><Check size={13} aria-hidden="true" /> {t("media.contributionSaved")}</p>;
  }
  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary">
        <Plus size={12} aria-hidden="true" /> {t("media.addMetricCta")}
      </button>
    );
  }

  async function handleSubmit() {
    const numValue = Number(value);
    if (!Number.isFinite(numValue) || numValue < 0 || !source.trim()) { setStatus("error"); return; }
    setStatus("saving");
    const result = await submitPublicMetricSnapshotAction({ platformId, metricDefinitionId: metricId, value: numValue, observedAt, source: source.trim() });
    setStatus(result.ok ? "saved" : "error");
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-ink-600">
          {t("media.metricLabel")}
          <select value={metricId} onChange={(e) => setMetricId(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink-900">
            {metricDefinitions.map((d) => <option key={d.id} value={d.id}>{d.display_label}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">
          {t("media.valueLabel")}
          <input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink-900" />
        </label>
        <label className="text-xs text-ink-600">
          {t("media.observedAtLabel")}
          <input type="date" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink-900" />
        </label>
        <label className="text-xs text-ink-600">
          {t("media.sourceLabel")}
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder={t("media.sourcePlaceholder")} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink-900" />
        </label>
      </div>
      {status === "error" && <p className="mt-2 text-xs text-caution">{t("media.contributionError")}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={handleSubmit} disabled={status === "saving"} className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{t("comparisons.save")}</button>
        <button onClick={() => setExpanded(false)} className="rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink-600">{t("comparisons.cancel")}</button>
      </div>
    </div>
  );
}

export function AddRateCardForm({ platformId, formats }: { platformId: string; formats: MediaProfile["formats"] }) {
  const { t } = useTranslation();
  const { user } = useSupabaseUser();
  const [expanded, setExpanded] = useState(false);
  const [formatId, setFormatId] = useState(formats[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<string>(SUPPORTED_CURRENCIES[0].code);
  const [pricingUnit, setPricingUnit] = useState<RateCardInput["pricingUnit"]>("per_integration");
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  if (!user || formats.length === 0) return null;
  if (status === "saved") {
    return <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-pistachio"><Check size={13} aria-hidden="true" /> {t("media.contributionPendingSaved")}</p>;
  }
  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary">
        <Plus size={12} aria-hidden="true" /> {t("media.addRateCardCta")}
      </button>
    );
  }

  async function handleSubmit() {
    const numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice < 0 || !isSupportedCurrencyCode(currency) || !source.trim()) { setStatus("error"); return; }
    setStatus("saving");
    const result = await submitRateCardAction({ platformId, mediaFormatId: formatId, price: numPrice, currency, pricingUnit, validFrom, source: source.trim() });
    setStatus(result.ok ? "saved" : "error");
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-ink-600">
          {t("media.formatLabel")}
          <select value={formatId} onChange={(e) => setFormatId(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink-900">
            {formats.map((f) => <option key={f.id} value={f.id}>{f.display_label}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-ink-600">
            {t("media.priceLabel")}
            <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink-900" />
          </label>
          <label className="text-xs text-ink-600">
            {t("media.currencyLabel")}
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink-900">
              {SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </label>
        </div>
        <label className="text-xs text-ink-600">
          {t("media.pricingUnitLabel")}
          <select value={pricingUnit} onChange={(e) => setPricingUnit(e.target.value as RateCardInput["pricingUnit"])} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink-900">
            {PRICING_UNITS.map((u) => <option key={u} value={u}>{t(`media.pricingUnit.${u}`)}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">
          {t("media.validFromLabel")}
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink-900" />
        </label>
        <label className="text-xs text-ink-600 sm:col-span-2">
          {t("media.sourceLabel")}
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder={t("media.sourcePlaceholder")} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink-900" />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-ink-400">{t("media.rateCardPendingNote")}</p>
      {status === "error" && <p className="mt-1 text-xs text-caution">{t("media.contributionError")}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={handleSubmit} disabled={status === "saving"} className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{t("comparisons.save")}</button>
        <button onClick={() => setExpanded(false)} className="rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink-600">{t("comparisons.cancel")}</button>
      </div>
    </div>
  );
}
