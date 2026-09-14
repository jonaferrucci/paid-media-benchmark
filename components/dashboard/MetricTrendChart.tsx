"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { CohortFilters, MetricKey } from "@/lib/types";
import { getTrend } from "@/lib/mock/benchmarks";
import { COMPARABLE_METRICS } from "@/lib/config/objectiveKpis";
import { METRIC_UNIT } from "@/lib/config/metrics";
import { formatMetricValue } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface MetricTrendChartProps {
  filters: CohortFilters;
}

export function MetricTrendChart({ filters }: MetricTrendChartProps) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<MetricKey>("cpm");
  const data = getTrend(filters, metric);
  const unit = METRIC_UNIT[metric];
  const metricLabel = t(`metrics.${metric}`);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink-900">
          {t("charts.trendTitle", { metric: metricLabel })}
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
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v) => formatMetricValue(v, unit)}
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
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-400">
        {t("charts.trendFootnote", { metric: metricLabel })}
      </p>
    </div>
  );
}
