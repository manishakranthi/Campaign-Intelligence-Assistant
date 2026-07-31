import { Card, CardHeading, DataTable, formatCurrency, formatNumber, formatPercent, PlatformBadge } from "./primitives";

interface PlatformSummary {
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  avgFrequency: number | null;
  videoMetricTotal: number;
  videoMetricLabel: string;
  days: number;
}

interface CampaignPerformance {
  campaignId: string;
  platforms: PlatformSummary[];
  combined: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpm: number;
    avgFrequency: number | null;
  };
}

export function PerformanceCard({ performance }: { performance: CampaignPerformance }) {
  return (
    <Card className="max-w-3xl overflow-x-auto">
      <CardHeading campaignId={performance.campaignId} title="Performance (raw)" />
      <DataTable>
        <thead>
          <tr className="text-left">
            <th className="py-2 pl-3 pr-3 font-medium">Platform</th>
            <th className="py-2 pr-3 font-medium">Spend</th>
            <th className="py-2 pr-3 font-medium">Impressions</th>
            <th className="py-2 pr-3 font-medium">Clicks</th>
            <th className="py-2 pr-3 font-medium">CTR</th>
            <th className="py-2 pr-3 font-medium">CPM</th>
            <th className="py-2 pr-3 font-medium">Frequency</th>
            <th className="py-2 pr-3 font-medium">Video Metric</th>
          </tr>
        </thead>
        <tbody>
          {performance.platforms.map((p) => (
            <tr key={p.platform}>
              <td className="py-2 pl-3 pr-3">
                <PlatformBadge platform={p.platform} />
              </td>
              <td className="py-2 pr-3 text-zinc-800 tabular-nums dark:text-zinc-200">{formatCurrency(p.spend)}</td>
              <td className="py-2 pr-3 text-zinc-800 tabular-nums dark:text-zinc-200">{formatNumber(p.impressions)}</td>
              <td className="py-2 pr-3 text-zinc-800 tabular-nums dark:text-zinc-200">{formatNumber(p.clicks)}</td>
              <td className="py-2 pr-3 text-zinc-800 tabular-nums dark:text-zinc-200">{formatPercent(p.ctr, 2)}</td>
              <td className="py-2 pr-3 text-zinc-800 tabular-nums dark:text-zinc-200">{formatCurrency(p.cpm)}</td>
              <td className="py-2 pr-3 text-zinc-800 tabular-nums dark:text-zinc-200">
                {p.avgFrequency !== null ? p.avgFrequency.toFixed(2) : "--"}
              </td>
              <td className="py-2 pr-3 text-zinc-800 tabular-nums dark:text-zinc-200">
                {formatNumber(p.videoMetricTotal)}
                <span className="ml-1 text-[10px] text-zinc-400">({p.videoMetricLabel})</span>
              </td>
            </tr>
          ))}
          <tr className="border-t border-zinc-200 !bg-accent-soft font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
            <td className="py-2 pl-3 pr-3">Combined</td>
            <td className="py-2 pr-3 tabular-nums">{formatCurrency(performance.combined.spend)}</td>
            <td className="py-2 pr-3 tabular-nums">{formatNumber(performance.combined.impressions)}</td>
            <td className="py-2 pr-3 tabular-nums">{formatNumber(performance.combined.clicks)}</td>
            <td className="py-2 pr-3 tabular-nums">{formatPercent(performance.combined.ctr, 2)}</td>
            <td className="py-2 pr-3 tabular-nums">{formatCurrency(performance.combined.cpm)}</td>
            <td className="py-2 pr-3 tabular-nums">
              {performance.combined.avgFrequency !== null ? performance.combined.avgFrequency.toFixed(2) : "--"}
            </td>
            <td className="py-2 pr-3 text-zinc-400">n/a</td>
          </tr>
        </tbody>
      </DataTable>
    </Card>
  );
}
