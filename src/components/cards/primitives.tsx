import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{children}</h3>;
}

/** Soft pastel tones, kept muted in dark mode too (not the deep-saturated Tailwind 950 chips). */
const PLATFORM_STYLES: Record<string, string> = {
  META: "bg-[#E3EDFB] text-[#4A6C99] dark:bg-[#24304A] dark:text-[#A9C6EE]",
  LINKEDIN: "bg-[#E7E2FA] text-[#5C51A3] dark:bg-[#2A2440] dark:text-[#C0B4EF]",
  GOOGLE: "bg-[#FBF0CE] text-[#8F7228] dark:bg-[#372E17] dark:text-[#E4CB83]",
  TABOOLA: "bg-[#FBE2CE] text-[#9B5E2E] dark:bg-[#392A1B] dark:text-[#EEB98A]",
  STACKADAPT: "bg-[#F1DEFA] text-[#7F4E9B] dark:bg-[#302339] dark:text-[#DBB4EE]",
};

export function PlatformBadge({ platform }: { platform: string }) {
  const style = PLATFORM_STYLES[platform] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{platform}</span>;
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  live: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  "on-pace": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  "over-pacing": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "under-pacing": "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${style}`}>{status.replace("-", " ")}</span>;
}

export function DirectionArrow({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <span className="text-emerald-600 dark:text-emerald-400">&uarr;</span>;
  if (direction === "down") return <span className="text-red-600 dark:text-red-400">&darr;</span>;
  return <span className="text-zinc-400">&rarr;</span>;
}

export function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function formatCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function StatTile({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
      {sublabel && <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{sublabel}</div>}
    </div>
  );
}

/** Distinct treatment for cross-platform-correlated findings -- the moment meant to land hardest. */
export function CrossPlatformCallout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-violet-400 bg-gradient-to-br from-violet-50 to-indigo-50 p-4 shadow-sm dark:border-violet-500 dark:from-violet-950/40 dark:to-indigo-950/40">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-base">🔗</span>
        <span className="text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
          Cross-Platform Signal
        </span>
      </div>
      {children}
    </div>
  );
}
