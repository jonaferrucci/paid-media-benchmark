"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { CohortFilters, MetricKey } from "@/lib/types";
import { getVerticalComparison } from "@/lib/mock/benchmarks";
import { COMPARABLE_METRICS } from "@/lib/config/objectiveKpis";
import { METRIC_UNIT } from "@/lib/config/metrics";
import { formatMetricValue } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface VerticalComparisonChartProps {
  filters: CohortFilters;
}

export function VerticalComparisonChart({ filters }: VerticalComparisonChartProps) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<MetricKey>("cpm");
  const data = getVerticalComparison(filters, metric);
  const unit = METRIC_UNIT[metric];
  const metricLabel = t(`metrics.${metric}`);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink-900">
          {t("charts.byVerticalTitle", { metric: metricLabel })}
        </h3>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricKey)}
          className="rounded-full border border-line bg-canvas px-2 py-1 text-xs text-ink-700 outline-none focus-visible:border-primary"
        >
          {COMPARABLE_METRICS.map((m) => (
            <option key={m} value={m}>
              {t(`metrics.${m}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 8, bottom: 0 }}>
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={false}
              tickFormatter={(v) => formatMetricValue(v, unit)}
            />
            <YAxis
              type="category"
              dataKey="verticalLabel"
              tick={{ fontSize: 11, fill: "var(--color-text-primary)" }}
              axisLine={false}
              tickLine={false}
              width={120}
            />
            <Tooltip
              formatter={(value: number) => formatMetricValue(value, unit)}
              contentStyle={{
                fontSize: 12,
                borderRadius: 12,
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
              labelStyle={{ color: "var(--color-text-primary)" }}
            />
            <Bar dataKey="value" fill="var(--color-primary)" radius={[0, 8, 8, 0]} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
