"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { KPIResult } from "@/lib/types";
import { getDistribution } from "@/lib/mock/benchmarks";
import { formatMetricValue } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface DistributionChartProps {
  kpi: KPIResult;
}

export function DistributionChart({ kpi }: DistributionChartProps) {
  const { t } = useTranslation();
  if (kpi.insufficientData) return null;
  const rawData = getDistribution(kpi);
  const distributionLabel: Record<string, string> = {
    p25: t("charts.p25"),
    median: t("charts.median"),
    p75: t("charts.p75"),
    yourResult: t("charts.yourResult"),
  };
  const data = rawData.map((point) => ({ ...point, displayLabel: distributionLabel[point.label] }));
  const metricLabel = t(`metrics.${kpi.metric}`);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="font-display text-sm font-semibold text-ink-900">
        {t("charts.distributionTitle", { metric: metricLabel })}
      </h3>
      <div className="mt-4 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="displayLabel"
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v) => formatMetricValue(v, kpi.unit)}
            />
            <Tooltip
              formatter={(value: number) => formatMetricValue(value, kpi.unit)}
              contentStyle={{
                fontSize: 12,
                borderRadius: 12,
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
              labelStyle={{ color: "var(--color-text-primary)" }}
            />
            <Bar dataKey="value" radius={[2, 2, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.label}
                  fill={entry.label === "yourResult" ? "var(--color-primary)" : "var(--color-coral)"}
                  fillOpacity={entry.label === "yourResult" ? 1 : 0.55}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-400">{t("charts.distributionFootnote")}</p>
    </div>
  );
}
