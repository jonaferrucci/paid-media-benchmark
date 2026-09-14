"use client";

import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { MONTHS_SHORT } from "@/lib/i18n/months";
import { seededRandom, randomInRange } from "@/lib/mock/random";

export function MiniTrend() {
  const { t, locale } = useTranslation();
  const rand = seededRandom("discovery-home-cpm-trend");
  let value = randomInRange(rand, 3.0, 3.6);
  const months = MONTHS_SHORT[locale].slice(3, 9);
  const data = months.map((period) => {
    value *= randomInRange(rand, 0.94, 1.06);
    return { period, value };
  });

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-ink-600">{t("market.trendTitle")}</p>
      <div className="mt-2 h-16">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Tooltip
              formatter={(v: number) => `USD ${v.toFixed(2)}`}
              labelFormatter={() => ""}
              contentStyle={{
                fontSize: 11,
                borderRadius: 10,
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
            />
            <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
