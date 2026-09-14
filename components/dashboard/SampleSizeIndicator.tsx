import { formatSampleSize } from "@/lib/format";

interface SampleSizeIndicatorProps {
  sampleSize: number;
  minimum?: number;
}

export function SampleSizeIndicator({ sampleSize, minimum = 10 }: SampleSizeIndicatorProps) {
  const below = sampleSize < minimum;
  return (
    <span
      className={
        below
          ? "text-caution"
          : "text-ink-400"
      }
    >
      Based on {formatSampleSize(sampleSize)} comparable datasets
    </span>
  );
}
