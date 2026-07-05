import { parseCampaignName } from "./parse-campaign-name";
import { PLATFORM_KEYS, PLATFORM_TAB_LABEL, PREFIX_TO_PLATFORM, VIDEO_METRIC_LABEL } from "./platforms";
import { generateMockPerformanceData, PerformanceRow } from "./mock-data/generate-performance-data";

export type { PerformanceRow };

export interface DataSource {
  /** Every performance row across every platform tab. */
  getAllRows(): Promise<PerformanceRow[]>;
  /** All rows for a given Campaign ID, across every platform tab it appears in. */
  getRowsForCampaign(campaignId: string): Promise<PerformanceRow[]>;
  /** Distinct Campaign IDs that have at least one row anywhere -- used to derive ticket status. */
  getKnownCampaignIds(): Promise<Set<string>>;
}

class MockDataSource implements DataSource {
  private rows: PerformanceRow[] | null = null;

  private load(): PerformanceRow[] {
    if (!this.rows) {
      this.rows = generateMockPerformanceData();
    }
    return this.rows;
  }

  async getAllRows(): Promise<PerformanceRow[]> {
    return this.load();
  }

  async getRowsForCampaign(campaignId: string): Promise<PerformanceRow[]> {
    return this.load().filter((row) => row.campaignId === campaignId);
  }

  async getKnownCampaignIds(): Promise<Set<string>> {
    return new Set(this.load().map((row) => row.campaignId));
  }
}

/**
 * Real Google Sheets implementation. Requires a service account with viewer access to the
 * spreadsheet, and the following env vars:
 *   GOOGLE_SHEETS_SPREADSHEET_ID
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 * Expects one tab per platform (see PLATFORM_TAB_LABEL) with the exact column order:
 * Date | Campaign Name | Spend | Impressions | Clicks | CTR | CPM | Frequency | Budget |
 * [Video metric] | Start Date | End Date
 */
class GoogleSheetsDataSource implements DataSource {
  private rows: PerformanceRow[] | null = null;

  private async load(): Promise<PerformanceRow[]> {
    if (this.rows) return this.rows;

    const { google } = await import("googleapis");
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!spreadsheetId || !clientEmail || !privateKey) {
      throw new Error(
        "Google Sheets data source is misconfigured: missing GOOGLE_SHEETS_SPREADSHEET_ID, " +
          "GOOGLE_SERVICE_ACCOUNT_EMAIL, or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY."
      );
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const rows: PerformanceRow[] = [];

    for (const platform of PLATFORM_KEYS) {
      const tabLabel = PLATFORM_TAB_LABEL[platform];
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabLabel}!A2:L`,
      });

      for (const line of res.data.values ?? []) {
        const [date, campaignName, spend, impressions, clicks, ctr, cpm, frequency, budget, videoMetric, startDate, endDate] = line;
        if (!date || !campaignName) continue;

        const parsed = parseCampaignName(String(campaignName));
        const derivedPlatform = PREFIX_TO_PLATFORM[parsed.platformPrefix] ?? platform;

        rows.push({
          date: String(date),
          platform: derivedPlatform,
          campaignId: parsed.campaignId,
          campaignNameSegment: parsed.campaignName,
          goalTypeCode: parsed.goalType,
          rawCampaignName: String(campaignName),
          spend: Number(spend) || 0,
          impressions: Number(impressions) || 0,
          clicks: Number(clicks) || 0,
          ctr: Number(ctr) || 0,
          cpm: Number(cpm) || 0,
          frequency: frequency !== undefined && frequency !== "" ? Number(frequency) : null,
          budget: Number(budget) || 0,
          videoMetric: Number(videoMetric) || 0,
          videoMetricLabel: VIDEO_METRIC_LABEL[derivedPlatform],
          startDate: String(startDate ?? ""),
          endDate: String(endDate ?? ""),
        });
      }
    }

    this.rows = rows;
    return rows;
  }

  async getAllRows(): Promise<PerformanceRow[]> {
    return this.load();
  }

  async getRowsForCampaign(campaignId: string): Promise<PerformanceRow[]> {
    return (await this.load()).filter((row) => row.campaignId === campaignId);
  }

  async getKnownCampaignIds(): Promise<Set<string>> {
    return new Set((await this.load()).map((row) => row.campaignId));
  }
}

let cachedSource: DataSource | null = null;

export function getDataSource(): DataSource {
  if (!cachedSource) {
    cachedSource =
      process.env.USE_REAL_SHEETS === "true" ? new GoogleSheetsDataSource() : new MockDataSource();
  }
  return cachedSource;
}
