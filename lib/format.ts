type Unit = "currency" | "percentage" | "multiplier" | "count";

export function formatMetricValue(value: number, unit: Unit): string {
  switch (unit) {
    case "currency":
      return `USD ${value.toFixed(2)}`;
    case "percentage":
      return `${value.toFixed(2)}%`;
    case "multiplier":
      return `${value.toFixed(1)}x`;
    case "count":
      return formatCount(value);
    default:
      return value.toString();
  }
}

export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toString();
}

export function formatSampleSize(value: number): string {
  return value.toLocaleString("en-US");
}
