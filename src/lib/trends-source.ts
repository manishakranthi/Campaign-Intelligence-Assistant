import { buildFallbackTrends, GoogleTrendsResult } from "./mock-data/mock-trends";
import { getMockMetaAudienceInsights, MetaAudienceInsight } from "./mock-data/mock-meta-audience";

export type { GoogleTrendsResult, MetaAudienceInsight };

export interface MetaAudienceInsightsResult {
  campaignId: string;
  insights: MetaAudienceInsight[];
  isMocked: true;
  /** What it would take to make this a real Meta Marketing API call instead of a mock. */
  realIntegrationNote: string;
}

export interface TrendsSource {
  /** Tries each candidate topic in order, returning the first with real Google Trends data. */
  getGoogleTrends(candidates: string[]): Promise<GoogleTrendsResult>;
  getMetaAudienceInsights(campaignId: string, vertical: string): Promise<MetaAudienceInsightsResult>;
}

const META_INTEGRATION_NOTE =
  "Real data would come from the Meta Marketing API (Graph API /act_{ad_account_id}/insights " +
  "and the interest/targeting browse endpoints). It requires: a connected Facebook Business " +
  "Manager account, an app with the ads_read permission approved via App Review, and a valid " +
  "long-lived access token for that ad account. None of that is wired up here -- this returns " +
  "a clearly-labeled mocked response instead.";

class LiveTrendsSource implements TrendsSource {
  /** Process-lifetime cache -- verticals repeat across tickets, no need to re-scrape or re-mock. */
  private cache = new Map<string, GoogleTrendsResult>();

  async getGoogleTrends(candidates: string[]): Promise<GoogleTrendsResult> {
    const cacheKey = candidates.join("|");
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    for (const candidate of candidates) {
      const cachedCandidate = this.cache.get(candidate);
      if (cachedCandidate) {
        this.cache.set(cacheKey, cachedCandidate);
        return cachedCandidate;
      }

      const result = await this.fetchLiveTrends(candidate);
      if (result) {
        this.cache.set(candidate, result);
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    // Every candidate came back empty/failed -- fall back using the most specific (last) one,
    // so the mocked data at least reads as campaign-flavored rather than generically vertical.
    const fallback = buildFallbackTrends(candidates[candidates.length - 1] ?? candidates[0] ?? "");
    this.cache.set(cacheKey, fallback);
    return fallback;
  }

  private async fetchLiveTrends(topic: string): Promise<GoogleTrendsResult | null> {
    try {
      const googleTrends = (await import("google-trends-api")).default;
      const [interestRaw, relatedRaw] = await Promise.all([
        googleTrends.interestOverTime({ keyword: topic }),
        googleTrends.relatedQueries({ keyword: topic }),
      ]);

      const interestJson = JSON.parse(interestRaw);
      const timelineData: Array<{ time: string; value: number[] }> =
        interestJson?.default?.timelineData ?? [];
      if (timelineData.length === 0) {
        console.warn(`fetchLiveTrends: no timeline data for "${topic}", trying next candidate.`);
        return null;
      }

      const interestOverTime = timelineData.slice(-12).map((point) => ({
        date: new Date(Number(point.time) * 1000).toISOString().slice(0, 10),
        interest: Number(point.value?.[0] ?? 0),
      }));

      const relatedJson = JSON.parse(relatedRaw);
      const rankedList: Array<{ rankedKeyword?: Array<{ query?: string }> }> =
        relatedJson?.default?.rankedList ?? [];
      const relatedQueries = rankedList
        .flatMap((list) => list.rankedKeyword ?? [])
        .map((item) => item.query)
        .filter((query): query is string => Boolean(query))
        .slice(0, 5);

      return { topic, interestOverTime, relatedQueries, source: "live" };
    } catch (err) {
      console.warn(`fetchLiveTrends: live Google Trends call failed for "${topic}", trying next candidate.`, err);
      return null;
    }
  }

  async getMetaAudienceInsights(campaignId: string, vertical: string): Promise<MetaAudienceInsightsResult> {
    return {
      campaignId,
      insights: getMockMetaAudienceInsights(vertical),
      isMocked: true,
      realIntegrationNote: META_INTEGRATION_NOTE,
    };
  }
}

let cachedSource: TrendsSource | null = null;

export function getTrendsSource(): TrendsSource {
  if (!cachedSource) {
    cachedSource = new LiveTrendsSource();
  }
  return cachedSource;
}
