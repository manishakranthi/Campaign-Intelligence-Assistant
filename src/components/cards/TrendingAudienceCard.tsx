import { Card, CardTitle } from "./primitives";

interface InterestPoint {
  date: string;
  interest: number;
}

interface GoogleTrendsResult {
  topic: string;
  interestOverTime: InterestPoint[];
  relatedQueries: string[];
  source: "live" | "fallback";
}

interface MetaAudienceInsight {
  label: string;
  detail: string;
}

interface MetaAudienceInsightsResult {
  insights: MetaAudienceInsight[];
  isMocked: true;
  realIntegrationNote: string;
}

interface TrendingAudienceResult {
  campaignId: string;
  topic: string;
  googleTrends: GoogleTrendsResult;
  metaAudienceInsights: MetaAudienceInsightsResult | null;
}

export function TrendingAudienceCard({ audience }: { audience: TrendingAudienceResult }) {
  const points = audience.googleTrends.interestOverTime.slice(-6);
  const first = points[0]?.interest ?? 0;
  const last = points[points.length - 1]?.interest ?? 0;
  const trendWord = last > first + 3 ? "rising" : last < first - 3 ? "falling" : "flat";

  return (
    <Card className="max-w-2xl">
      <CardTitle>Trending Audience -- &ldquo;{audience.topic}&rdquo;</CardTitle>

      <div className="mb-3">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Google Trends (interest 0-100)
          {audience.googleTrends.source === "fallback" && (
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-normal normal-case text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              fallback data -- live call unavailable
            </span>
          )}
        </div>
        <div className="mb-1 flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          {points.map((p, i) => (
            <span key={p.date}>
              {p.interest}
              {i < points.length - 1 && <span className="mx-1 text-zinc-300 dark:text-zinc-600">&rarr;</span>}
            </span>
          ))}
          <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">({trendWord})</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {audience.googleTrends.relatedQueries.map((q) => (
            <span
              key={q}
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {q}
            </span>
          ))}
        </div>
      </div>

      {audience.metaAudienceInsights && (
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Meta Audience Insights
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-normal normal-case text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              mocked
            </span>
          </div>
          <ul className="mb-1.5 flex flex-col gap-1">
            {audience.metaAudienceInsights.insights.map((insight) => (
              <li key={insight.label} className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{insight.label}:</span> {insight.detail}
              </li>
            ))}
          </ul>
          <p className="text-xs italic text-zinc-500 dark:text-zinc-500">{audience.metaAudienceInsights.realIntegrationNote}</p>
        </div>
      )}
    </Card>
  );
}
