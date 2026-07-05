import { addDays, formatDate, MOCK_TODAY } from "./mock-clock";
import { randomInRange, seededRandom } from "../seeded-random";

export interface InterestPoint {
  date: string;
  interest: number;
}

export interface GoogleTrendsResult {
  topic: string;
  interestOverTime: InterestPoint[];
  relatedQueries: string[];
  source: "live" | "fallback";
}

const GENERIC_MODIFIERS = ["best", "reviews", "near me", "discount code", "vs"];

/**
 * Deterministic stand-in for a live Google Trends response, used when the real call fails
 * (the unofficial google-trends-api wrapper is flaky/rate-limited) or in offline dev/demo runs.
 * Produces a plausible 12-week interest curve and a handful of related-query suggestions.
 */
export function buildFallbackTrends(topic: string): GoogleTrendsResult {
  const rng = seededRandom(`trends:${topic.toLowerCase()}`);
  const base = randomInRange(rng, 35, 65);
  const drift = randomInRange(rng, -1.5, 2.5);

  const interestOverTime: InterestPoint[] = [];
  for (let week = 11; week >= 0; week--) {
    const date = formatDate(addDays(MOCK_TODAY, -week * 7));
    const value = base + drift * (11 - week) + randomInRange(rng, -8, 8);
    interestOverTime.push({ date, interest: Math.max(0, Math.min(100, Math.round(value))) });
  }

  const topicWords = topic.toLowerCase().split(/\s+/).filter(Boolean);
  const relatedQueries = [
    `${topic} 2026`,
    ...GENERIC_MODIFIERS.slice(0, 3).map((mod) => `${topic} ${mod}`),
    topicWords.length > 1 ? topicWords[topicWords.length - 1] : `${topic} deals`,
  ];

  return { topic, interestOverTime, relatedQueries, source: "fallback" };
}
