import { Card, CardTitle, PlatformBadge } from "./primitives";

interface FatigueFinding {
  platform: string;
  creativeType: "video" | "static";
  frequencySignal: "climbing-fast" | "elevated" | "none" | "unavailable";
  frequencyStart: number | null;
  frequencyEnd: number | null;
  engagementMetric: "ctr" | "video_engagement_rate";
  engagementDropPct: number;
  cpmRising: boolean;
  confidence: "high" | "medium";
  summary: string;
  recommendations: string[];
}

interface CreativeFatigueResult {
  campaignId: string;
  findings: FatigueFinding[];
}

export function CreativeFatigueCard({ fatigue }: { fatigue: CreativeFatigueResult }) {
  if (fatigue.findings.length === 0) return null;

  return (
    <Card className="max-w-2xl">
      <CardTitle>Campaign #{fatigue.campaignId} -- Creative Fatigue</CardTitle>
      <div className="flex flex-col gap-3">
        {fatigue.findings.map((f) => (
          <div
            key={f.platform}
            className={`rounded-lg border px-3 py-2.5 ${
              f.confidence === "high"
                ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
            }`}
          >
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <PlatformBadge platform={f.platform} />
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                {f.creativeType === "video" ? "Video creative" : "Static/carousel creative"}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                {f.confidence} confidence
              </span>
            </div>
            <p className="mb-2 text-sm text-zinc-800 dark:text-zinc-200">{f.summary}</p>
            <ul className="flex flex-col gap-1">
              {f.recommendations.map((r, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  <span className="text-zinc-400">&bull;</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
