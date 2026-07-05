import { getTrendingAudience, TrendingAudienceResult } from "./audience-service";
import { getPacingStatus } from "./pacing";

export interface AudienceExpansionResult {
  campaignId: string;
  isUnderperforming: boolean;
  reason: string;
  trendingAudience: TrendingAudienceResult | null;
  suggestedAngles: string[];
}

/**
 * Live campaigns only, intended for use when a campaign is underperforming vs. its goal:
 * surfaces trending audience signals as new targeting/creative angles, not just "increase budget."
 */
export async function suggestAudienceExpansion(campaignId: string): Promise<AudienceExpansionResult | null> {
  const pacing = await getPacingStatus(campaignId);
  if (!pacing) return null;

  const isUnderperforming = pacing.goalPacingStatus === "under-pacing" || pacing.spendPacingStatus === "under-pacing";
  const reason = isUnderperforming
    ? pacing.goalPacingDetail
    : `This campaign isn't currently under-pacing (goal pacing: ${pacing.goalPacingStatus}), but here are trending audience angles for context anyway.`;

  const trendingAudience = await getTrendingAudience(campaignId);

  const suggestedAngles: string[] = [];
  if (trendingAudience) {
    const topQueries = trendingAudience.googleTrends.relatedQueries.slice(0, 3);
    if (topQueries.length > 0) {
      suggestedAngles.push(
        `New targeting/creative angle from trending search interest: try messaging around ` +
          `"${topQueries.join('", "')}" -- currently trending related queries for "${trendingAudience.topic}".`
      );
    }
    if (trendingAudience.metaAudienceInsights) {
      for (const insight of trendingAudience.metaAudienceInsights.insights) {
        suggestedAngles.push(`Meta audience angle -- ${insight.label}: ${insight.detail}.`);
      }
    }
  }

  return { campaignId, isUnderperforming, reason, trendingAudience, suggestedAngles };
}
