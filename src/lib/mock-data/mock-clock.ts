/**
 * Mock performance data is generated relative to a fixed anchor date rather than the real
 * wall-clock date. This keeps the seeded scenarios (flight progress, anomaly windows, pacing
 * math) internally consistent no matter when the demo is actually run -- if we used `new Date()`,
 * every ticket's flight-date math and "trailing 7 days" windows would silently drift out of sync
 * with the hand-authored anomaly scenarios in generate-performance-data.ts.
 */
export const MOCK_TODAY = new Date("2026-07-05T00:00:00.000Z");

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}
