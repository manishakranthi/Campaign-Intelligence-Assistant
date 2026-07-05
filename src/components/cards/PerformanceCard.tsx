import { Card, CardTitle, formatCurrency, formatNumber, formatPercent, PlatformBadge } from "./primitives";

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
      <CardTitle>Campaign #{performance.campaignId} -- Performance (raw)</CardTitle>
      <table className="w-full min-w-[640px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <th className="py-1.5 pr-3 font-medium">Platform</th>
            <th className="py-1.5 pr-3 font-medium">Spend</th>
            <th className="py-1.5 pr-3 font-medium">Impressions</th>
            <th className="py-1.5 pr-3 font-medium">Clicks</th>
            <th className="py-1.5 pr-3 font-medium">CTR</th>
            <th className="py-1.5 pr-3 font-medium">CPM</th>
            <th className="py-1.5 pr-3 font-medium">Frequency</th>
            <th className="py-1.5 pr-3 font-medium">Video Metric</th>
          </tr>
        </thead>
        <tbody>
          {performance.platforms.map((p) => (
            <tr key={p.platform} className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="py-1.5 pr-3">
                <PlatformBadge platform={p.platform} />
              </td>
              <td className="py-1.5 pr-3 text-zinc-800 dark:text-zinc-200">{formatCurrency(p.spend)}</td>
              <td className="py-1.5 pr-3 text-zinc-800 dark:text-zinc-200">{formatNumber(p.impressions)}</td>
              <td className="py-1.5 pr-3 text-zinc-800 dark:text-zinc-200">{formatNumber(p.clicks)}</td>
              <td className="py-1.5 pr-3 text-zinc-800 dark:text-zinc-200">{formatPercent(p.ctr, 2)}</td>
              <td className="py-1.5 pr-3 text-zinc-800 dark:text-zinc-200">{formatCurrency(p.cpm)}</td>
              <td className="py-1.5 pr-3 text-zinc-800 dark:text-zinc-200">
                {p.avgFrequency !== null ? p.avgFrequency.toFixed(2) : "--"}
              </td>
              <td className="py-1.5 pr-3 text-zinc-800 dark:text-zinc-200">
                {formatNumber(p.videoMetricTotal)}
                <span className="ml-1 text-[10px] text-zinc-400">({p.videoMetricLabel})</span>
              </td>
            </tr>
          ))}
          <tr className="font-semibold text-zinc-900 dark:text-zinc-100">
            <td className="py-1.5 pr-3">Combined</td>
            <td className="py-1.5 pr-3">{formatCurrency(performance.combined.spend)}</td>
            <td className="py-1.5 pr-3">{formatNumber(performance.combined.impressions)}</td>
            <td className="py-1.5 pr-3">{formatNumber(performance.combined.clicks)}</td>
            <td className="py-1.5 pr-3">{formatPercent(performance.combined.ctr, 2)}</td>
            <td className="py-1.5 pr-3">{formatCurrency(performance.combined.cpm)}</td>
            <td className="py-1.5 pr-3">
              {performance.combined.avgFrequency !== null ? performance.combined.avgFrequency.toFixed(2) : "--"}
            </td>
            <td className="py-1.5 pr-3 text-zinc-400">n/a</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}
