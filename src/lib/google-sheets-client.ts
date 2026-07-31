import type { sheets_v4 } from "googleapis";

interface SheetsClient {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

let cachedClient: SheetsClient | null = null;

/**
 * Shared authenticated Sheets client, read/write scope. GoogleSheetsDataSource only reads, but
 * uploaded-campaign-store.ts appends and deletes rows in the same spreadsheet, so the scope has
 * to cover both -- keeping it in one place means it only needs to change here.
 */
export async function getSheetsClient(): Promise<SheetsClient> {
  if (cachedClient) return cachedClient;

  const { google } = await import("googleapis");
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!spreadsheetId || !clientEmail || !privateKey) {
    throw new Error(
      "Google Sheets is misconfigured: missing GOOGLE_SHEETS_SPREADSHEET_ID, " +
        "GOOGLE_SERVICE_ACCOUNT_EMAIL, or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY."
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  cachedClient = { sheets: google.sheets({ version: "v4", auth }), spreadsheetId };
  return cachedClient;
}
