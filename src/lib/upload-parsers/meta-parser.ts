import * as XLSX from "xlsx";
import { findColumnIndex, formatDateUTC, ParseResult } from "./shared";

// Meta's "Raw Data Report" export: .xlsx, one sheet (name can vary by export, hence the fallback
// to the first sheet), single header row, no metadata rows.
export function parseMetaFile(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.includes("Raw Data Report")
    ? "Raw Data Report"
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const warnings: string[] = [];

  if (!sheet) {
    return { rows: [], hints: {}, warnings: ["Couldn't find a sheet to read in this workbook."] };
  }

  const json = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  const headerRow = json[0];
  if (!headerRow) {
    return { rows: [], hints: {}, warnings: ["Sheet doesn't have enough rows to contain a header."] };
  }
  const headers = headerRow.map((h) => String(h ?? ""));

  const campaignNameIdx = findColumnIndex(headers, "Campaign name");
  const spendIdx = findColumnIndex(headers, "Amount spent");
  const impressionsIdx = findColumnIndex(headers, "Impressions");
  const clicksIdx = findColumnIndex(headers, "Link clicks");
  const frequencyIdx = findColumnIndex(headers, "Frequency");
  const videoIdx = findColumnIndex(headers, "thruplay", "video", "3-second video");
  const reportingStartsIdx = findColumnIndex(headers, "Reporting starts");
  const reportingEndsIdx = findColumnIndex(headers, "Reporting ends");

  if (spendIdx === -1 || impressionsIdx === -1 || clicksIdx === -1) {
    return {
      rows: [],
      hints: {},
      warnings: ["Couldn't find Amount spent/Impressions/Link clicks columns -- this doesn't look like a Meta Ads Manager raw data export."],
    };
  }

  function cellToNumber(cell: unknown): number {
    if (typeof cell === "number") return Number.isFinite(cell) ? cell : 0;
    if (typeof cell === "string") {
      const cleaned = cell.replace(/[$,%\s]/g, "").trim();
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  // A blank/missing cell means "not reported for this row" (null), not a real value of 0 --
  // matters for frequency specifically, since campaign-service.ts only averages non-null values.
  function cellToNumberOrNull(cell: unknown): number | null {
    if (cell === undefined || cell === null || cell === "") return null;
    return cellToNumber(cell);
  }

  function cellToDate(cell: unknown): string | undefined {
    if (cell instanceof Date) return formatDateUTC(cell);
    if (typeof cell === "string" && /^\d{4}-\d{2}-\d{2}/.test(cell)) return cell.slice(0, 10);
    return undefined;
  }

  const rows = [];
  const campaignNames = new Set<string>();
  const startDates: Array<string | undefined> = [];
  const endDates: Array<string | undefined> = [];

  for (const line of json.slice(1)) {
    if (!line || line.length === 0) continue;

    rows.push({
      spend: cellToNumber(line[spendIdx]),
      impressions: cellToNumber(line[impressionsIdx]),
      clicks: cellToNumber(line[clicksIdx]),
      frequency: frequencyIdx !== -1 ? cellToNumberOrNull(line[frequencyIdx]) : null,
      videoMetric: videoIdx !== -1 ? cellToNumber(line[videoIdx]) : 0,
    });

    if (campaignNameIdx !== -1 && String(line[campaignNameIdx] ?? "").trim()) {
      campaignNames.add(String(line[campaignNameIdx]).trim());
    }
    if (reportingStartsIdx !== -1) startDates.push(cellToDate(line[reportingStartsIdx]));
    if (reportingEndsIdx !== -1) endDates.push(cellToDate(line[reportingEndsIdx]));
  }

  if (campaignNames.size > 1) {
    warnings.push(
      `This file has ${campaignNames.size} different campaign names (e.g. "${Array.from(campaignNames)[0]}") -- all rows were combined as one campaign's totals. For accurate results, export a report scoped to a single campaign.`
    );
  }

  const validStartDates = startDates.filter((d): d is string => Boolean(d));
  const validEndDates = endDates.filter((d): d is string => Boolean(d));

  return {
    rows,
    hints: {
      campaignName: campaignNames.size === 1 ? Array.from(campaignNames)[0] : undefined,
      flightStartDate: validStartDates.length > 0 ? validStartDates.reduce((min, d) => (d < min ? d : min)) : undefined,
      flightEndDate: validEndDates.length > 0 ? validEndDates.reduce((max, d) => (d > max ? d : max)) : undefined,
    },
    warnings,
  };
}
