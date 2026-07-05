import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardTitle, CrossPlatformCallout, PlatformBadge } from "./primitives";
import { CHART_COLORS } from "./chart-theme";

interface PeerComparisonFinding {
  platform: string;
  metric: "ctr" | "cpm";
  thisCampaignValue: number;
  peerAverage: number;
  peerCount: number;
  percentDifference: number;
  isBetterThanPeers: boolean;
  description: string;
}

interface CrossPlatformComparisonFinding {
  platform: string;
  otherPlatforms: string[];
  ctrPercentDifference: number;
  cpmPercentDifference: number;
  description: string;
}

interface ComparativeAnalysisResult {
  campaignId: string;
  peerComparisons: PeerComparisonFinding[];
  crossPlatformComparisons: CrossPlatformComparisonFinding[];
}

interface PeerComparisonChartDatum {
  label: string;
  percentDifference: number;
  isBetterThanPeers: boolean;
  description: string;
}

function PeerComparisonTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PeerComparisonChartDatum }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="max-w-[240px] rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="font-medium text-zinc-900 dark:text-zinc-100">{d.label}</div>
      <div className="text-zinc-500 dark:text-zinc-400">{d.description}</div>
    </div>
  );
}

function PeerComparisonChart({ comparisons }: { comparisons: PeerComparisonFinding[] }) {
  const data: PeerComparisonChartDatum[] = comparisons.map((c) => ({
    label: `${c.platform} ${c.metric.toUpperCase()}`,
    percentDifference: c.percentDifference,
    isBetterThanPeers: c.isBetterThanPeers,
    description: c.description,
  }));

  return (
    <div className="mb-3 h-40 w-full min-w-[420px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <XAxis type="number" tick={{ fontSize: 11, fill: CHART_COLORS.neutral }} tickFormatter={(v) => `${v}%`} />
          <YAxis
            type="category"
            dataKey="label"
            width={80}
            tick={{ fontSize: 11, fill: CHART_COLORS.neutral }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<PeerComparisonTooltip />} cursor={{ fill: CHART_COLORS.neutral, opacity: 0.08 }} />
          <Bar dataKey="percentDifference" isAnimationActive={false} radius={3}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.isBetterThanPeers ? CHART_COLORS.positive : CHART_COLORS.negative} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ComparativeAnalysisCard({ comparison }: { comparison: ComparativeAnalysisResult }) {
  const hasAny = comparison.peerComparisons.length > 0 || comparison.crossPlatformComparisons.length > 0;
  if (!hasAny) return null;

  return (
    <Card className="max-w-2xl">
      <CardTitle>Campaign #{comparison.campaignId} -- Comparative (&ldquo;Moat&rdquo;) Analysis</CardTitle>

      {comparison.crossPlatformComparisons.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            This platform vs. the rest of this campaign
          </div>
          {comparison.crossPlatformComparisons.map((c) => (
            <CrossPlatformCallout key={c.platform}>
              <div className="mb-1 flex items-center gap-1.5">
                <PlatformBadge platform={c.platform} />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  vs. {c.otherPlatforms.join(", ")}
                </span>
              </div>
              <p className="text-sm text-zinc-800 dark:text-zinc-200">{c.description}</p>
            </CrossPlatformCallout>
          ))}
        </div>
      )}

      {comparison.peerComparisons.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            This campaign vs. peer campaigns
          </div>
          <PeerComparisonChart comparisons={comparison.peerComparisons} />
          {comparison.peerComparisons.map((c, i) => (
            <div
              key={`${c.platform}-${c.metric}-${i}`}
              className={`rounded-lg border px-3 py-2 text-sm ${
                c.isBetterThanPeers
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                  : "border-zinc-100 dark:border-zinc-800"
              }`}
            >
              <div className="mb-0.5 flex items-center gap-1.5">
                <PlatformBadge platform={c.platform} />
                <span className="text-xs uppercase text-zinc-400">{c.metric}</span>
              </div>
              <p className="text-zinc-700 dark:text-zinc-300">{c.description}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
