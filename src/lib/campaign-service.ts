import { getDataSource, PerformanceRow } from "./data-source";
import { PlatformKey } from "./platforms";
import { getTicketingSource, TicketMetadata } from "./ticketing-source";

export type TicketStatus = "new" | "live";

export interface TicketWithStatus extends TicketMetadata {
  status: TicketStatus;
}

/**
 * A ticket is "live" if its Campaign ID has any rows in the data source, "new" otherwise.
 * This is computed here by cross-referencing the two sources -- it is never stored on the
 * ticket itself, since the sheet is the only thing that can tell you a campaign has actually
 * started delivering.
 */
export async function listTicketsWithStatus(): Promise<TicketWithStatus[]> {
  const [tickets, knownIds] = await Promise.all([
    getTicketingSource().listTickets(),
    getDataSource().getKnownCampaignIds(),
  ]);
  return tickets.map((ticket) => ({
    ...ticket,
    status: knownIds.has(ticket.campaignId) ? "live" : "new",
  }));
}

export async function getTicketWithStatus(campaignId: string): Promise<TicketWithStatus | null> {
  const ticket = await getTicketingSource().getTicket(campaignId);
  if (!ticket) return null;
  const rows = await getDataSource().getRowsForCampaign(campaignId);
  return { ...ticket, status: rows.length > 0 ? "live" : "new" };
}

export interface PlatformPerformanceSummary {
  platform: PlatformKey;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  avgFrequency: number | null;
  videoMetricTotal: number;
  videoMetricLabel: string;
  videoEngagementRate: number;
  days: number;
}

export interface CampaignPerformance {
  campaignId: string;
  platforms: PlatformPerformanceSummary[];
  combined: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpm: number;
    avgFrequency: number | null;
  };
  /** Raw daily rows grouped by platform -- the material every downstream analysis tool works from. */
  rowsByPlatform: Partial<Record<PlatformKey, PerformanceRow[]>>;
}

function summarizePlatformRows(platform: PlatformKey, rows: PerformanceRow[]): PlatformPerformanceSummary {
  const spend = rows.reduce((sum, r) => sum + r.spend, 0);
  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const clicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const videoMetricTotal = rows.reduce((sum, r) => sum + r.videoMetric, 0);
  const withFrequency = rows.filter((r) => r.frequency !== null);

  return {
    platform,
    spend: Number(spend.toFixed(2)),
    impressions,
    clicks,
    ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    cpm: impressions > 0 ? Number(((spend / impressions) * 1000).toFixed(2)) : 0,
    avgFrequency:
      withFrequency.length > 0
        ? Number((withFrequency.reduce((sum, r) => sum + (r.frequency ?? 0), 0) / withFrequency.length).toFixed(2))
        : null,
    videoMetricTotal,
    videoMetricLabel: rows[0]?.videoMetricLabel ?? "",
    videoEngagementRate: impressions > 0 ? Number((videoMetricTotal / impressions).toFixed(4)) : 0,
    days: new Set(rows.map((r) => r.date)).size,
  };
}

/** Aggregates a Campaign ID's rows across every platform tab it appears in. Live campaigns only. */
export async function getCampaignPerformance(campaignId: string): Promise<CampaignPerformance | null> {
  const rows = await getDataSource().getRowsForCampaign(campaignId);
  if (rows.length === 0) return null;

  const rowsByPlatform: Partial<Record<PlatformKey, PerformanceRow[]>> = {};
  for (const row of rows) {
    (rowsByPlatform[row.platform] ??= []).push(row);
  }
  for (const platformRows of Object.values(rowsByPlatform)) {
    platformRows?.sort((a, b) => a.date.localeCompare(b.date));
  }

  const platforms = Object.entries(rowsByPlatform).map(([platform, platformRows]) =>
    summarizePlatformRows(platform as PlatformKey, platformRows ?? [])
  );

  const combinedSpend = platforms.reduce((sum, p) => sum + p.spend, 0);
  const combinedImpressions = platforms.reduce((sum, p) => sum + p.impressions, 0);
  const combinedClicks = platforms.reduce((sum, p) => sum + p.clicks, 0);
  const platformsWithFrequency = platforms.filter((p) => p.avgFrequency !== null);

  return {
    campaignId,
    platforms,
    combined: {
      spend: Number(combinedSpend.toFixed(2)),
      impressions: combinedImpressions,
      clicks: combinedClicks,
      ctr: combinedImpressions > 0 ? Number(((combinedClicks / combinedImpressions) * 100).toFixed(2)) : 0,
      cpm: combinedImpressions > 0 ? Number(((combinedSpend / combinedImpressions) * 1000).toFixed(2)) : 0,
      avgFrequency:
        platformsWithFrequency.length > 0
          ? Number(
              (
                platformsWithFrequency.reduce((sum, p) => sum + (p.avgFrequency ?? 0), 0) /
                platformsWithFrequency.length
              ).toFixed(2)
            )
          : null,
    },
    rowsByPlatform,
  };
}
