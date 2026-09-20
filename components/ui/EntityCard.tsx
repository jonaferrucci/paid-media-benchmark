"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

// Phase 20C shared card pattern (item B of the product-experience brief).
// One consistent recognition shape — avatar, name, one line of context,
// a status badge, a primary action — reused (not identically dimensioned)
// across the homepage, media catalog, planner, contribution entry points,
// and benchmark platform selection. Secondary detail (provenance,
// validity windows, price history, etc.) lives in the `detail` slot,
// revealed on hover *and* keyboard focus of the same interactive root —
// never a hover-only affordance — so nothing here is only reachable with
// a mouse.
interface EntityCardProps {
  avatar: ReactNode;
  title: string;
  meta?: string;
  badge?: ReactNode;
  /** Always-visible primary content (e.g. price/availability) — never hidden behind hover. */
  body?: ReactNode;
  /** Secondary content revealed on hover *and* keyboard focus of the card itself. */
  detail?: ReactNode;
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
  selectable?: boolean;
  disabled?: boolean;
  footer?: ReactNode;
  accentClassName?: string;
  className?: string;
}

const BASE_CLASS =
  "group relative flex w-full flex-col gap-2 rounded-2xl border bg-surface p-4 text-left shadow-sm outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function EntityCard({
  avatar,
  title,
  meta,
  badge,
  body: bodyContent,
  detail,
  href,
  onSelect,
  selected = false,
  selectable = false,
  disabled = false,
  footer,
  accentClassName = "",
  className = "",
}: EntityCardProps) {
  const stateClass = selected
    ? "border-primary ring-1 ring-primary bg-primary-soft/20"
    : "border-line hover:border-primary/50 hover:bg-surface2/40";

  const cardBody = (
    <>
      <div className="flex items-start justify-between gap-2">
        {/* POST-MVP MOBILE PASS §15: this card is shared across the
            homepage, media catalog, planner, and benchmark platform
            selection — a media/campaign name is primary identity, never
            secondary metadata, so it wraps (up to 2 lines) instead of
            truncating to "Meta A…" everywhere this card is used. The
            avatar row switches to items-start so a 2-line title doesn't
            look vertically mis-centered against the fixed-size avatar. */}
        <div className="flex min-w-0 items-start gap-2.5">
          {avatar}
          <div className="min-w-0">
            <p className="line-clamp-2 font-display text-sm font-semibold text-ink-900">{title}</p>
            {meta && <p className="truncate text-xs text-ink-500">{meta}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {badge}
          {selectable && selected && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white" aria-hidden="true">
              <Check size={12} />
            </span>
          )}
        </div>
      </div>

      {bodyContent}

      {detail && (
        <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-150 group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr] group-focus-within:grid-rows-[1fr]">
          <div className="overflow-hidden">
            <div className="border-t border-line/70 pt-2 text-xs text-ink-500">{detail}</div>
          </div>
        </div>
      )}

      {footer}
    </>
  );

  const combinedClass = `${BASE_CLASS} ${stateClass} ${accentClassName} ${className}`;

  if (href) {
    return (
      <Link href={href} className={combinedClass} aria-current={selected ? "true" : undefined}>
        {cardBody}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selectable ? selected : undefined}
      className={`${combinedClass} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {cardBody}
    </button>
  );
}
