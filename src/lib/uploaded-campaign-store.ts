import { getSheetsClient } from "./google-sheets-client";
import { parseCampaignName } from "./parse-campaign-name";
import { PLATFORM_KEYS, PLATFORM_TAB_LABEL, PlatformKey } from "./platforms";
import type { PerformanceRow } from "./data-source";
import type { TicketMetadata } from "./ticketing-source";

export interface UploadedCampaignRecord {
  ticket: TicketMetadata;
  rows: PerformanceRow[];
}

/** First uploaded-campaign ID -- also the marker cleanupUploadedCampaigns() uses to identify which rows are safe to delete, everywhere. */
export const FIRST_UPLOADED_CAMPAIGN_ID = 20001;

const TICKETS_TAB = "Tickets";
const TICKETS_HEADER = [
  "Campaign ID",
  "Campaign Name",
  "Flight Start Date",
  "Flight End Date",
  "Overall Budget",
  "Objective",
  "Goal",
  "Goal Type Code",
  "Goal Amount",
  "Vertical",
  "Platforms",
];

async function ensureTicketsTab(): Promise<void> {
  const { sheets, spreadsheetId } = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === TICKETS_TAB);
  if (exists) return;

  // Purely additive -- never touches any existing tab.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: TICKETS_TAB } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TICKETS_TAB}!A1:K1`,
    valueInputOption: "RAW",
    requestBody: { values: [TICKETS_HEADER] },
  });
}

function ticketToRow(t: TicketMetadata): (string | number)[] {
  return [
    t.campaignId,
    t.campaignName,
    t.flightStartDate,
    t.flightEndDate,
    t.overallBudget,
    t.objective,
    t.goal,
    t.goalTypeCode,
    t.goalAmount,
    t.vertical,
    t.platforms.join(","),
  ];
}

function rowToTicket(row: string[]): TicketMetadata | null {
  const [
    campaignId,
    campaignName,
    flightStartDate,
    flightEndDate,
    overallBudget,
    objective,
    goal,
    goalTypeCode,
    goalAmount,
    vertical,
    platforms,
  ] = row;
  if (!campaignId) return null;

  return {
    campaignId: String(campaignId),
    campaignName: campaignName ?? "",
    flightStartDate: flightStartDate ?? "",
    flightEndDate: flightEndDate ?? "",
    overallBudget: Number(overallBudget) || 0,
    objective: objective ?? "",
    goal: goal ?? "",
    goalTypeCode: goalTypeCode ?? "",
    goalAmount: Number(goalAmount) || 0,
    vertical: vertical ?? "",
    platforms: (platforms ?? "").split(",").filter(Boolean) as PlatformKey[],
    dataGranularity: "aggregate",
  };
}

class UploadedCampaignStore {
  async add(record: UploadedCampaignRecord): Promise<void> {
    const { sheets, spreadsheetId } = await getSheetsClient();
    await ensureTicketsTab();

    // Group rows by platform tab and append into the exact same 12-column schema
    // GoogleSheetsDataSource already reads -- uploaded rows become indistinguishable from real
    // ones, so there's no separate read path needed for performance data.
    const byPlatform = new Map<PlatformKey, PerformanceRow[]>();
    for (const row of record.rows) {
      const list = byPlatform.get(row.platform) ?? [];
      list.push(row);
      byPlatform.set(row.platform, list);
    }

    for (const [platform, rows] of byPlatform) {
      const tabLabel = PLATFORM_TAB_LABEL[platform];
      const values = rows.map((r) => [
        r.date,
        r.rawCampaignName,
        r.spend,
        r.impressions,
        r.clicks,
        r.ctr,
        r.cpm,
        r.frequency ?? "",
        r.budget,
        r.videoMetric,
        r.startDate,
        r.endDate,
      ]);
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${tabLabel}!A:L`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values },
      });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TICKETS_TAB}!A:K`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [ticketToRow(record.ticket)] },
    });
  }

  async listTickets(): Promise<TicketMetadata[]> {
    // Reads degrade to "no uploaded campaigns" rather than throwing -- e.g. Sheets isn't
    // configured at all (tests, a fresh clone with no .env.local) or a transient API error.
    // Writes (add(), below) intentionally still throw: a failed upload should surface as an
    // error to the user, not silently vanish.
    try {
      const { sheets, spreadsheetId } = await getSheetsClient();
      await ensureTicketsTab();
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TICKETS_TAB}!A2:K` });
      return (res.data.values ?? [])
        .map((row) => rowToTicket(row as string[]))
        .filter((t): t is TicketMetadata => t !== null);
    } catch (err) {
      console.warn("[uploaded-campaign-store] listTickets failed, treating as no uploaded campaigns:", err instanceof Error ? err.message : err);
      return [];
    }
  }

  async getTicket(campaignId: string): Promise<TicketMetadata | null> {
    const tickets = await this.listTickets();
    return tickets.find((t) => t.campaignId === campaignId) ?? null;
  }

  async getKnownCampaignIds(): Promise<Set<string>> {
    return new Set((await this.listTickets()).map((t) => t.campaignId));
  }

  async hasCampaignId(campaignId: string): Promise<boolean> {
    return (await this.getKnownCampaignIds()).has(campaignId);
  }
}

let cachedStore: UploadedCampaignStore | null = null;

export function getUploadedCampaignStore(): UploadedCampaignStore {
  if (!cachedStore) {
    cachedStore = new UploadedCampaignStore();
  }
  return cachedStore;
}

/**
 * Deletes every row this app has ever appended for an uploaded campaign (campaignId >=
 * FIRST_UPLOADED_CAMPAIGN_ID) from every platform tab, plus every data row in the Tickets tab.
 * Called once per fresh server boot (see instrumentation.ts) -- this is what "removing uploaded
 * data after the session" means, since there's no per-user session to scope it to otherwise.
 * Never touches rows below that ID range, so real pre-existing data is untouched.
 */
export async function cleanupUploadedCampaigns(): Promise<void> {
  const { sheets, spreadsheetId } = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetIdByTitle = new Map(
    (meta.data.sheets ?? []).map((s) => [s.properties?.title ?? "", s.properties?.sheetId ?? 0])
  );

  const requests: object[] = [];

  for (const platform of PLATFORM_KEYS) {
    const tabLabel = PLATFORM_TAB_LABEL[platform];
    const sheetId = sheetIdByTitle.get(tabLabel);
    if (sheetId === undefined) continue;

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tabLabel}!A2:B` });
    const values = res.data.values ?? [];

    values.forEach((row, i) => {
      const campaignName = row[1];
      if (!campaignName) return;
      const id = Number(parseCampaignName(String(campaignName)).campaignId);
      if (Number.isFinite(id) && id >= FIRST_UPLOADED_CAMPAIGN_ID) {
        // Data starts at sheet row 2 -> 0-based row index 1, so row i (0-based within A2:B) is index i + 1.
        requests.push({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: i + 1, endIndex: i + 2 } } });
      }
    });
  }

  const ticketsSheetId = sheetIdByTitle.get(TICKETS_TAB);
  if (ticketsSheetId !== undefined) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TICKETS_TAB}!A2:A` });
    const rowCount = (res.data.values ?? []).length;
    if (rowCount > 0) {
      requests.push({
        deleteDimension: { range: { sheetId: ticketsSheetId, dimension: "ROWS", startIndex: 1, endIndex: 1 + rowCount } },
      });
    }
  }

  if (requests.length === 0) return;

  // Sort all deletions within each sheet from bottom to top so earlier deletes don't shift the
  // row indices of later ones still pending in the same batch.
  requests.sort((a, b) => {
    const rangeA = (a as { deleteDimension: { range: { sheetId: number; startIndex: number } } }).deleteDimension.range;
    const rangeB = (b as { deleteDimension: { range: { sheetId: number; startIndex: number } } }).deleteDimension.range;
    if (rangeA.sheetId !== rangeB.sheetId) return rangeA.sheetId - rangeB.sheetId;
    return rangeB.startIndex - rangeA.startIndex;
  });

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}
