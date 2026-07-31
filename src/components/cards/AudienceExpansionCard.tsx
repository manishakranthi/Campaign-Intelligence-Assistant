import { Card, CardHeading } from "./primitives";

interface AudienceExpansionResult {
  campaignId: string;
  isUnderperforming: boolean;
  reason: string;
  suggestedAngles: string[];
}

export function AudienceExpansionCard({ expansion }: { expansion: AudienceExpansionResult }) {
  return (
    <Card className="max-w-2xl">
      <CardHeading campaignId={expansion.campaignId} title="Audience Expansion Suggestions" />
      <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">{expansion.reason}</p>
      <ul className="flex flex-col gap-1.5">
        {expansion.suggestedAngles.map((angle, i) => (
          <li
            key={i}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
          >
            {angle}
          </li>
        ))}
      </ul>
    </Card>
  );
}
