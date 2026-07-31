import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeading, DataTable, DirectionArrow, PlatformBadge, SectionLabel } from "./primitives";
import { CHART_COLORS } from "./chart-theme";

interface MetricComparison {
  metric: string;
  prior: number;
  current: number;
  percentChange: number | null;
  direction: "up" | "down" | "flat";
  isMeaningful: boolean;
}

interface TrendAnalysisResult {
  campaignId: string;
  priorPeriod: { start: string; end: string };
  currentPeriod: { start: string; end: string };
  combined: MetricComparison[];
  byPlatform: { platform: string; metrics: MetricComparison[] }[];
}

interface TrendAnalysisInsufficientData {
  campaignId: string;
  insufficientDailyData: true;
  message: string;
}

function formatValue(value: number): string {
  // Explicit locale -- see the comment on formatNumber in primitives.tsx for why "undefined" here
  // caused a server/client hydration mismatch.
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return value.toFixed(2);
}

function directionColor(direction: MetricComparison["direction"]): string {
  if (direction === "up") return CHART_COLORS.positive;
  if (direction === "down") return CHART_COLORS.negative;
  return CHART_COLORS.neutral;
}

function PercentChangeTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: MetricComparison }> }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="font-medium text-zinc-900 dark:text-zinc-100">{m.metric}</div>
      <div className="text-zinc-500 dark:text-zinc-400">
        {formatValue(m.prior)} &rarr; {formatValue(m.current)} ({m.percentChange !== null && m.percentChange >= 0 ? "+" : ""}
        {m.percentChange?.toFixed(1)}%)
      </div>
    </div>
  );
}

function PercentChangeChart({ metrics }: { metrics: MetricComparison[] }) {
  const data = metrics.filter((m) => m.percentChange !== null);
  if (data.length === 0) return null;

  return (
    <div className="mb-2 h-40 w-full min-w-[420px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <XAxis type="number" tick={{ fontSize: 11, fill: CHART_COLORS.neutral }} tickFormatter={(v) => `${v}%`} />
          <YAxis
            type="category"
            dataKey="metric"
            width={70}
            tick={{ fontSize: 11, fill: CHART_COLORS.neutral }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<PercentChangeTooltip />} cursor={{ fill: CHART_COLORS.neutral, opacity: 0.08 }} />
          <Bar dataKey="percentChange" isAnimationActive={false} radius={3}>
            {data.map((m) => (
              <Cell key={m.metric} fill={directionColor(m.direction)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricTable({ metrics }: { metrics: MetricComparison[] }) {
  return (
    <DataTable>
      <thead>
        <tr className="text-left">
          <th className="py-2 pl-3 pr-3 font-medium">Metric</th>
          <th className="py-2 pr-3 font-medium">Prior</th>
          <th className="py-2 pr-3 font-medium">Current</th>
          <th className="py-2 pr-3 font-medium">Change</th>
        </tr>
      </thead>
      <tbody>
        {metrics.map((m) => (
          <tr key={m.metric}>
            <td className={`py-2 pl-3 pr-3 ${m.isMeaningful ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}>
              {m.metric}
            </td>
            <td className="py-2 pr-3 text-zinc-600 tabular-nums dark:text-zinc-400">{formatValue(m.prior)}</td>
            <td className="py-2 pr-3 text-zinc-800 tabular-nums dark:text-zinc-200">{formatValue(m.current)}</td>
            <td className="py-2 pr-3 tabular-nums">
              <DirectionArrow direction={m.direction} />{" "}
              <span className={m.isMeaningful ? "font-semibold" : "text-zinc-500"}>
                {m.percentChange === null ? "n/a" : `${m.percentChange >= 0 ? "+" : ""}${m.percentChange.toFixed(1)}%`}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** @param bare Skips the card shell and heading -- used when composed inside a unified panel (see PanelSection) that already provides both. */
export function TrendAnalysisCard({
  trend,
  bare = false,
}: {
  trend: TrendAnalysisResult | TrendAnalysisInsufficientData;
  bare?: boolean;
}) {
  if ("insufficientDailyData" in trend) {
    const message = <p className="text-sm text-zinc-600 dark:text-zinc-400">{trend.message}</p>;
    if (bare) return message;
    return (
      <Card className="max-w-2xl">
        <CardHeading campaignId={trend.campaignId} title="Trend Comparison" />
        {message}
      </Card>
    );
  }

  const periodLabel = (
    <>
      {trend.currentPeriod.start} to {trend.currentPeriod.end} vs. {trend.priorPeriod.start} to{" "}
      {trend.priorPeriod.end}
    </>
  );

  const content = (
    <>
      {bare ? (
        <div className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">{periodLabel}</div>
      ) : (
        <CardHeading campaignId={trend.campaignId} title={<>Trend: {periodLabel}</>} />
      )}
      <div className="mb-4">
        <SectionLabel>Combined</SectionLabel>
        <PercentChangeChart metrics={trend.combined} />
        <MetricTable metrics={trend.combined} />
      </div>
      {trend.byPlatform.map((p) => (
        <div key={p.platform} className="mb-4 last:mb-0">
          <div className="mb-1.5 flex items-center gap-2">
            <PlatformBadge platform={p.platform} />
          </div>
          <MetricTable metrics={p.metrics} />
        </div>
      ))}
    </>
  );

  if (bare) return content;
  return (
    <Card className="max-w-2xl overflow-x-auto">
      {content}
    </Card>
  );
}
