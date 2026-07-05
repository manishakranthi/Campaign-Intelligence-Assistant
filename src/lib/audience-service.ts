import { GoogleTrendsResult, getTrendsSource, MetaAudienceInsightsResult } from "./trends-source";
import { getTicketingSource, TicketMetadata } from "./ticketing-source";

/** "SpringSaleApparel" -> "Spring Sale Apparel" */
function splitCamelCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

/**
 * Derives a search topic for Google Trends from the campaign's name segment and vertical,
 * e.g. "SpringSaleApparel" + "fitness apparel" -> "spring sale apparel fitness apparel"
 * deduped -> "spring sale apparel fitness".
 */
export function deriveTrendsTopic(ticket: Pick<TicketMetadata, "campaignName" | "vertical">): string {
  const nameWords = splitCamelCase(ticket.campaignName)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const verticalWords = ticket.vertical
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const seen = new Set<string>();
  const words: string[] = [];
  for (const word of [...nameWords, ...verticalWords]) {
    if (!seen.has(word)) {
      seen.add(word);
      words.push(word);
    }
  }
  return words.join(" ");
}

/**
 * Google Trends has no data for an overly specific phrase like "winter coat launch apparel"
 * (the full name+vertical phrase from deriveTrendsTopic), but usually does for the vertical
 * alone -- so that's tried first. Verticals with a "/" (e.g. "automotive / EV") are split to
 * their first segment since the full compound phrase is rarely a real search term either.
 */
export function deriveTrendsTopicCandidates(
  ticket: Pick<TicketMetadata, "campaignName" | "vertical">
): string[] {
  const verticalTopic = ticket.vertical
    .split("/")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const fullTopic = deriveTrendsTopic(ticket);

  return Array.from(new Set([verticalTopic, fullTopic].filter(Boolean)));
}

export interface TrendingAudienceResult {
  campaignId: string;
  topic: string;
  googleTrends: GoogleTrendsResult;
  metaAudienceInsights: MetaAudienceInsightsResult | null;
}

/**
 * Trending audience signals for a ticket: Google Trends always, plus Meta Audience Insights
 * when Meta (FB/IG) is one of the campaign's platforms.
 */
export async function getTrendingAudience(campaignId: string): Promise<TrendingAudienceResult | null> {
  const ticket = await getTicketingSource().getTicket(campaignId);
  if (!ticket) return null;

  const topic = deriveTrendsTopic(ticket);
  const trends = getTrendsSource();

  const [googleTrends, metaAudienceInsights] = await Promise.all([
    trends.getGoogleTrends(deriveTrendsTopicCandidates(ticket)),
    ticket.platforms.includes("META")
      ? trends.getMetaAudienceInsights(campaignId, ticket.vertical)
      : Promise.resolve(null),
  ]);

  return { campaignId, topic, googleTrends, metaAudienceInsights };
}
