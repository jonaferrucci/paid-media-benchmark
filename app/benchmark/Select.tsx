"use client";

import { ChevronDown } from "lucide-react";

export function Select({
  label,
  value,
  onChange,
  options,
  allowEmpty,
  emptyLabel = "\u2014",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
  emptyLabel?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-600">
        {label}
        {required && <span className="text-caution"> *</span>}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-line bg-surface py-2.5 pl-3 pr-8 text-sm text-ink-900 outline-none focus-visible:border-primary"
        >
          {allowEmpty && <option value="">{emptyLabel}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
      </div>
    </label>
  );
}
