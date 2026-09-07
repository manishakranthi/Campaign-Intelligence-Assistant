import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Card,
  CardHeading,
  CrossPlatformCallout,
  DataTable,
  formatCurrency,
  formatPercent,
  PlatformBadge,
  SectionLabel,
} from "./primitives";
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

function formatSignedPercent(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;
}

/** This campaign's platforms always report CTR and CPM as a pair (see comparative-analysis.ts),
 * so pivoting the flat findings list into one row per platform puts both metrics side by side --
 * clearer at a glance than reading a "ctr"/"cpm" tag off each of two separate rows. */
interface PlatformPeerRow {
  platform: string;
  ctr: PeerComparisonFinding;
  cpm: PeerComparisonFinding;
}

function groupPeerComparisonsByPlatform(comparisons: PeerComparisonFinding[]): PlatformPeerRow[] {
  const byPlatform = new Map<string, Partial<Record<"ctr" | "cpm", PeerComparisonFinding>>>();
  for (const c of comparisons) {
    const entry = byPlatform.get(c.platform) ?? {};
    entry[c.metric] = c;
    byPlatform.set(c.platform, entry);
  }
  const rows: PlatformPeerRow[] = [];
  for (const [platform, entry] of byPlatform) {
    if (entry.ctr && entry.cpm) rows.push({ platform, ctr: entry.ctr, cpm: entry.cpm });
  }
  return rows;
}

function PeerComparisonTable({ comparisons }: { comparisons: PeerComparisonFinding[] }) {
  const rows = groupPeerComparisonsByPlatform(comparisons);
  return (
    <DataTable>
      <thead>
        <tr className="text-left">
          <th className="py-2 pl-3 pr-3 font-medium">Platform</th>
          <th className="py-2 pr-3 font-medium">Your CTR</th>
          <th className="py-2 pr-3 font-medium">Peer Avg CTR</th>
          <th className="py-2 pr-3 font-medium">CTR vs. Peers</th>
          <th className="py-2 pr-3 font-medium">Your CPM</th>
          <th className="py-2 pr-3 font-medium">Peer Avg CPM</th>
          <th className="py-2 pr-3 font-medium">CPM vs. Peers</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.platform}>
            <td className="py-2 pl-3 pr-3">
              <PlatformBadge platform={row.platform} />
            </td>
            <td className="py-2 pr-3 tabular-nums text-zinc-800 dark:text-zinc-200">
              {formatPercent(row.ctr.thisCampaignValue, 2)}
            </td>
            <td className="py-2 pr-3 tabular-nums text-zinc-500 dark:text-zinc-400">
              {formatPercent(row.ctr.peerAverage, 2)}{" "}
              <span className="text-[10px] text-zinc-400">({row.ctr.peerCount} peers)</span>
            </td>
            <td
              className={`py-2 pr-3 tabular-nums font-medium ${
                row.ctr.isBetterThanPeers ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatSignedPercent(row.ctr.percentDifference)}
            </td>
            <td className="py-2 pr-3 tabular-nums text-zinc-800 dark:text-zinc-200">
              {formatCurrency(row.cpm.thisCampaignValue)}
            </td>
            <td className="py-2 pr-3 tabular-nums text-zinc-500 dark:text-zinc-400">
              {formatCurrency(row.cpm.peerAverage)}{" "}
              <span className="text-[10px] text-zinc-400">({row.cpm.peerCount} peers)</span>
            </td>
            <td
              className={`py-2 pr-3 tabular-nums font-medium ${
                row.cpm.isBetterThanPeers ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatSignedPercent(row.cpm.percentDifference)}
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
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

/** @param bare Skips the card shell and heading -- used when composed inside a unified panel (see PanelSection) that already provides both. */
export function ComparativeAnalysisCard({
  comparison,
  bare = false,
}: {
  comparison: ComparativeAnalysisResult;
  bare?: boolean;
}) {
  const hasAny = comparison.peerComparisons.length > 0 || comparison.crossPlatformComparisons.length > 0;
  if (!hasAny) return null;

  const content = (
    <>
      {!bare && <CardHeading campaignId={comparison.campaignId} title={<>Comparative (&ldquo;Moat&rdquo;) Analysis</>} />}

      {comparison.crossPlatformComparisons.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          <SectionLabel>This platform vs. the rest of this campaign</SectionLabel>
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
          <SectionLabel>This campaign vs. peer campaigns</SectionLabel>
          <PeerComparisonChart comparisons={comparison.peerComparisons} />
          <PeerComparisonTable comparisons={comparison.peerComparisons} />
        </div>
      )}
    </>
  );

  if (bare) return content;
  return <Card className="max-w-3xl overflow-x-auto">{content}</Card>;
}
