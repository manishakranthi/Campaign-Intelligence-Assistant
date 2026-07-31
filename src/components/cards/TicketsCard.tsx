import { Card, CardTitle, PlatformBadge, SectionLabel, StatusBadge, formatCurrency } from "./primitives";

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

export function TicketsCard({ tickets }: { tickets: Ticket[] }) {
  const live = tickets.filter((t) => t.status === "live");
  const fresh = tickets.filter((t) => t.status === "new");

  return (
    <Card className="max-w-2xl">
      <CardTitle>Campaign Tickets ({tickets.length})</CardTitle>
      <div className="flex flex-col gap-4">
        {fresh.length > 0 && <TicketGroup title="New / Pre-launch" tickets={fresh} />}
        {live.length > 0 && <TicketGroup title="Live" tickets={live} />}
      </div>
    </Card>
  );
}

function TicketGroup({ title, tickets }: { title: string; tickets: Ticket[] }) {
  return (
    <div>
      <SectionLabel>
        {title} ({tickets.length})
      </SectionLabel>
      <div className="flex flex-col gap-1.5">
        {tickets.map((t) => (
          <div
            key={t.campaignId}
            className="flex flex-col gap-1 rounded-lg border border-zinc-200 px-3 py-2 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                <span className="shrink-0 rounded-md bg-zinc-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  #{t.campaignId}
                </span>
                <span className="truncate">{t.campaignName}</span>
              </span>
              <StatusBadge status={t.status} />
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {t.objective} &middot; goal: {t.goal}
            </div>
            <div className="flex flex-wrap gap-1">
              {t.platforms.map((p) => (
                <PlatformBadge key={p} platform={p} />
              ))}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                Flight: {t.flightStartDate} &rarr; {t.flightEndDate}
              </span>
              <span>Budget: {formatCurrency(t.overallBudget)}</span>
              <span>Vertical: {t.vertical}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
