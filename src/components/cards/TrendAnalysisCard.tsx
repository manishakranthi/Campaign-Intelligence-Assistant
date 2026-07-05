import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardTitle, DirectionArrow, PlatformBadge } from "./primitives";
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

function formatValue(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString();
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
    <table className="w-full min-w-[420px] border-collapse text-xs">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          <th className="py-1 pr-3 font-medium">Metric</th>
          <th className="py-1 pr-3 font-medium">Prior</th>
          <th className="py-1 pr-3 font-medium">Current</th>
          <th className="py-1 pr-3 font-medium">Change</th>
        </tr>
      </thead>
      <tbody>
        {metrics.map((m) => (
          <tr key={m.metric} className="border-b border-zinc-100 dark:border-zinc-800">
            <td className={`py-1 pr-3 ${m.isMeaningful ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}>
              {m.metric}
            </td>
            <td className="py-1 pr-3 text-zinc-600 dark:text-zinc-400">{formatValue(m.prior)}</td>
            <td className="py-1 pr-3 text-zinc-800 dark:text-zinc-200">{formatValue(m.current)}</td>
            <td className="py-1 pr-3">
              <DirectionArrow direction={m.direction} />{" "}
              <span className={m.isMeaningful ? "font-semibold" : "text-zinc-500"}>
                {m.percentChange === null ? "n/a" : `${m.percentChange >= 0 ? "+" : ""}${m.percentChange.toFixed(1)}%`}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TrendAnalysisCard({ trend }: { trend: TrendAnalysisResult }) {
  return (
    <Card className="max-w-2xl overflow-x-auto">
      <CardTitle>
        Campaign #{trend.campaignId} -- Trend: {trend.currentPeriod.start} to {trend.currentPeriod.end} vs.{" "}
        {trend.priorPeriod.start} to {trend.priorPeriod.end}
      </CardTitle>
      <div className="mb-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Combined
        </div>
        <PercentChangeChart metrics={trend.combined} />
        <MetricTable metrics={trend.combined} />
      </div>
      {trend.byPlatform.map((p) => (
        <div key={p.platform} className="mb-3">
          <div className="mb-1 flex items-center gap-2">
            <PlatformBadge platform={p.platform} />
          </div>
          <MetricTable metrics={p.metrics} />
        </div>
      ))}
    </Card>
  );
}
