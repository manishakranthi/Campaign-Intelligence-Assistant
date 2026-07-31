import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-surface-border bg-surface p-4 shadow-[0_1px_3px_rgba(24,24,27,0.08),0_12px_28px_-12px_var(--accent-shadow)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_10px_24px_-12px_var(--accent-shadow)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
      <span className="h-1 w-1 shrink-0 rounded-full bg-accent" />
      {children}
    </h3>
  );
}

/**
 * Standard per-campaign card header: an ID chip (scannable, visually distinct from prose) plus a
 * clean title, replacing the old "Campaign #{id} -- {title}" string-concatenation convention used
 * across every analysis card.
 */
export function CardHeading({ campaignId, title }: { campaignId: string; title: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="rounded-md bg-zinc-200 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        #{campaignId}
      </span>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        <span className="h-1 w-1 shrink-0 rounded-full bg-accent" />
        {title}
      </h3>
    </div>
  );
}

/** Small-caps kicker for subsections within a card -- consistent weight/tracking/color everywhere it's used. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
      {children}
    </div>
  );
}

/**
 * A labeled section within a unified multi-section panel (see PanelSectionList) -- an h4 + accent
 * dot instead of a full CardHeading, since the panel itself already carries the campaign ID/title.
 */
export function PanelSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <h4 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        <span className="h-1 w-1 shrink-0 rounded-full bg-accent" />
        {title}
      </h4>
      {children}
    </div>
  );
}

/** Groups PanelSections with a divider between each -- one card shell instead of several stacked ones. */
export function PanelSectionList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">{children}</div>;
}

/** Rounded, contained table shell with a tinted header and zebra rows -- used in place of a bare `<table>`. */
export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[560px] border-collapse text-xs [&_tbody_tr:nth-child(even)]:bg-zinc-100/70 [&_tbody_tr:not(:last-child)]:border-b [&_tbody_tr:not(:last-child)]:border-zinc-200 [&_thead_th]:bg-zinc-100 [&_thead_th]:py-2 [&_thead_th]:font-medium [&_thead_th]:text-zinc-600 dark:[&_tbody_tr:nth-child(even)]:bg-zinc-800/30 dark:[&_tbody_tr:not(:last-child)]:border-zinc-800 dark:[&_thead_th]:bg-zinc-900/60 dark:[&_thead_th]:text-zinc-400">
        {children}
      </table>
    </div>
  );
}

/** Deeper, more saturated in light mode than a bare pastel tint reads as -- kept muted in dark mode (not the deep-saturated Tailwind 950 chips). */
const PLATFORM_STYLES: Record<string, string> = {
  META: "bg-[#CDE0FB] text-[#31527D] dark:bg-[#24304A] dark:text-[#A9C6EE]",
  LINKEDIN: "bg-[#D8CFF8] text-[#463A8C] dark:bg-[#2A2440] dark:text-[#C0B4EF]",
  GOOGLE: "bg-[#F8E7A8] text-[#715A17] dark:bg-[#372E17] dark:text-[#E4CB83]",
  TABOOLA: "bg-[#F8D3A8] text-[#7D451A] dark:bg-[#392A1B] dark:text-[#EEB98A]",
  STACKADAPT: "bg-[#EBCEF8] text-[#673078] dark:bg-[#302339] dark:text-[#DBB4EE]",
};

export function PlatformBadge({ platform }: { platform: string }) {
  const style = PLATFORM_STYLES[platform] ?? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{platform}</span>;
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-sky-200 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
  live: "bg-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  "on-pace": "bg-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  "over-pacing": "bg-amber-200 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  "under-pacing": "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${style}`}>{status.replace("-", " ")}</span>;
}

export function DirectionArrow({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <span className="text-emerald-600 dark:text-emerald-400">&uarr;</span>;
  if (direction === "down") return <span className="text-red-600 dark:text-red-400">&darr;</span>;
  return <span className="text-zinc-400">&rarr;</span>;
}

export function formatNumber(n: number): string {
  // Explicit locale (not undefined) -- this runs during both server render and client hydration,
  // and "undefined" resolves to each runtime's own default locale (Node's OS locale vs. the
  // browser's), which can format the same number as different text and break hydration.
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function StatTile({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="rounded-xl border border-teal-900/[0.14] bg-gradient-to-b from-teal-100/70 to-transparent px-3 py-2.5 transition-colors hover:border-accent/25 hover:from-teal-100 dark:border-zinc-800 dark:from-zinc-900/60 dark:hover:border-zinc-700 dark:hover:from-zinc-800/60">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-100">
        {value}
      </div>
      {sublabel && <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{sublabel}</div>}
    </div>
  );
}

/** Distinct treatment for cross-platform-correlated findings -- the moment meant to land hardest. */
export function CrossPlatformCallout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50/70 p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_8px_20px_-12px_rgba(139,92,246,0.25)] dark:border-violet-800/60 dark:from-violet-950/40 dark:to-indigo-950/30">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-base">🔗</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Cross-Platform Signal
        </span>
      </div>
      {children}
    </div>
  );
}
