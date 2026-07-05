import { Card, CardTitle, PlatformBadge, StatusBadge, formatCurrency } from "./primitives";

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
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title} ({tickets.length})
      </div>
      <div className="flex flex-col gap-1.5">
        {tickets.map((t) => (
          <div
            key={t.campaignId}
            className="flex flex-col gap-1 rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                #{t.campaignId} -- {t.campaignName}
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
