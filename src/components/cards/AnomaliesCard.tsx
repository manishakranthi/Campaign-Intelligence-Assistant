import { Card, CardTitle, CrossPlatformCallout, PlatformBadge } from "./primitives";

interface AnomalyFinding {
  type: "overspend" | "underspend" | "cpm-spike" | "ctr-drop";
  platform: string;
  startDate: string;
  endDate: string;
  days: number;
  description: string;
}

interface CrossPlatformAnomalyFinding {
  primary: AnomalyFinding;
  linked: AnomalyFinding;
  daysBetween: number;
  description: string;
}

interface AnomalyDetectionResult {
  campaignId: string;
  findings: AnomalyFinding[];
  crossPlatformFindings: CrossPlatformAnomalyFinding[];
}

const TYPE_STYLES: Record<AnomalyFinding["type"], string> = {
  overspend: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
  underspend: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
  "cpm-spike": "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30",
  "ctr-drop": "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
};

const TYPE_LABELS: Record<AnomalyFinding["type"], string> = {
  overspend: "Overspend",
  underspend: "Underspend / Pacing Risk",
  "cpm-spike": "CPM Spike",
  "ctr-drop": "CTR Drop",
};

function FindingBlock({ finding }: { finding: AnomalyFinding }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${TYPE_STYLES[finding.type]}`}>
      <div className="mb-0.5 flex items-center gap-1.5">
        <PlatformBadge platform={finding.platform} />
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          {TYPE_LABELS[finding.type]}
        </span>
      </div>
      <p className="text-zinc-700 dark:text-zinc-300">{finding.description}</p>
    </div>
  );
}

export function AnomaliesCard({ anomalies }: { anomalies: AnomalyDetectionResult }) {
  const hasAny = anomalies.findings.length > 0 || anomalies.crossPlatformFindings.length > 0;
  if (!hasAny) return null;

  return (
    <Card className="max-w-2xl">
      <CardTitle>Campaign #{anomalies.campaignId} -- Anomaly Detection</CardTitle>
      <div className="flex flex-col gap-2">
        {anomalies.crossPlatformFindings.map((cf, i) => (
          <CrossPlatformCallout key={i}>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <PlatformBadge platform={cf.primary.platform} />
              <span className="text-zinc-500 dark:text-zinc-400">{TYPE_LABELS[cf.primary.type]}</span>
              <span className="text-zinc-400">&rarr; {cf.daysBetween}d later &rarr;</span>
              <PlatformBadge platform={cf.linked.platform} />
              <span className="text-zinc-500 dark:text-zinc-400">{TYPE_LABELS[cf.linked.type]}</span>
            </div>
            <p className="text-sm text-zinc-800 dark:text-zinc-200">{cf.description}</p>
          </CrossPlatformCallout>
        ))}
        {anomalies.findings.map((f, i) => (
          <FindingBlock key={i} finding={f} />
        ))}
      </div>
    </Card>
  );
}
