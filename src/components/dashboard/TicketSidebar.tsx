"use client";

import { useEffect, useState } from "react";
import { PlatformBadge, formatCurrency } from "@/components/cards/primitives";

interface Ticket {
  campaignId: string;
  campaignName: string;
  flightStartDate: string;
  flightEndDate: string;
  overallBudget: number;
  objective: string;
  goal: string;
  vertical: string;
  platforms: string[];
  status: "new" | "live";
}

export function TicketSidebar({
  onRunFullAnalysis,
  onGetAudienceIdeas,
  disabled,
}: {
  onRunFullAnalysis: (campaignId: string) => void;
  onGetAudienceIdeas: (campaignId: string) => void;
  disabled?: boolean;
}) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tickets")
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((data) => setTickets(data.tickets))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tickets."));
  }, []);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3.5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Campaigns</h2>
        {tickets && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {tickets.length}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {error && <p className="px-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!tickets && !error && <SidebarSkeleton />}
        {tickets && (
          <div className="flex flex-col gap-5">
            <TicketGroup
              title="New / Pre-launch"
              dotClassName="bg-sky-500"
              tickets={tickets.filter((t) => t.status === "new")}
              expandedId={expandedId}
              onToggle={setExpandedId}
              onRunFullAnalysis={onRunFullAnalysis}
              onGetAudienceIdeas={onGetAudienceIdeas}
              disabled={disabled}
            />
            <TicketGroup
              title="Live"
              dotClassName="bg-emerald-500"
              tickets={tickets.filter((t) => t.status === "live")}
              expandedId={expandedId}
              onToggle={setExpandedId}
              onRunFullAnalysis={onRunFullAnalysis}
              onGetAudienceIdeas={onGetAudienceIdeas}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-1 pt-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" style={{ animationDelay: `${i * 100}ms` }} />
      ))}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
    >
      <path d="M7 5l6 5-6 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TicketGroup({
  title,
  dotClassName,
  tickets,
  expandedId,
  onToggle,
  onRunFullAnalysis,
  onGetAudienceIdeas,
  disabled,
}: {
  title: string;
  dotClassName: string;
  tickets: Ticket[];
  expandedId: string | null;
  onToggle: (campaignId: string | null) => void;
  onRunFullAnalysis: (campaignId: string) => void;
  onGetAudienceIdeas: (campaignId: string) => void;
  disabled?: boolean;
}) {
  if (tickets.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} />
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{tickets.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tickets.map((t) => {
          const isExpanded = expandedId === t.campaignId;
          return (
            <div
              key={t.campaignId}
              className={`rounded-xl border bg-white transition-all dark:bg-zinc-950 ${
                isExpanded
                  ? "border-accent/40 shadow-sm ring-1 ring-accent/15"
                  : "border-zinc-100 hover:border-zinc-200 dark:border-zinc-800 dark:hover:border-zinc-700"
              }`}
            >
              <button
                type="button"
                onClick={() => onToggle(isExpanded ? null : t.campaignId)}
                aria-expanded={isExpanded}
                className="flex w-full flex-col gap-1.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {t.campaignName}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">#{t.campaignId}</span>
                  </div>
                  <ChevronIcon open={isExpanded} />
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t.objective} &middot; goal: {t.goal}
                </div>
                <div className="flex flex-wrap gap-1">
                  {t.platforms.map((p) => (
                    <PlatformBadge key={p} platform={p} />
                  ))}
                </div>
              </button>
              {isExpanded && (
                <div className="flex flex-col gap-2.5 border-t border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <DetailStat label="Flight" value={`${t.flightStartDate} → ${t.flightEndDate}`} wide />
                    <DetailStat label="Budget" value={formatCurrency(t.overallBudget)} />
                    <DetailStat label="Vertical" value={t.vertical} />
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      t.status === "live" ? onRunFullAnalysis(t.campaignId) : onGetAudienceIdeas(t.campaignId)
                    }
                    className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-2 text-xs font-medium text-accent-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <SparkleIcon />
                    {t.status === "live" ? "Run Full Analysis" : "Get Audience & Budget Ideas"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailStat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/60 ${wide ? "col-span-2" : ""}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</div>
      <div className="mt-0.5 truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">{value}</div>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0">
      <path d="M8 1l1.2 3.8L13 6l-3.8 1.2L8 11l-1.2-3.8L3 6l3.8-1.2L8 1z" />
    </svg>
  );
}
