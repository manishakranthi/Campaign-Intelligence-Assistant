import { decodeTextFile, findColumnIndex, isBlankRow, parseNumber, ParseResult, splitDelimitedLine, splitLines } from "./shared";

// Taboola's campaign export: UTF-8 (with BOM), comma-delimited, single header row, no metadata rows.
export function parseTaboolaFile(buffer: ArrayBuffer): ParseResult {
  const text = decodeTextFile(buffer);
  const lines = splitLines(text);
  const warnings: string[] = [];

  const headerLine = lines[0];
  if (!headerLine) {
    return { rows: [], hints: {}, warnings: ["File doesn't have enough rows to contain a header."] };
  }
  const headers = splitDelimitedLine(headerLine, ",");

  const campaignNameIdx = findColumnIndex(headers, "Campaign Name");
  const spendIdx = findColumnIndex(headers, "Spent");
  const impressionsIdx = findColumnIndex(headers, "Impressions");
  const clicksIdx = findColumnIndex(headers, "Clicks");
  // Deliberately not mapping "Estimated Daily Cap" to a budget hint -- it's a daily cap, not a
  // lifetime/overall budget, and would corrupt the pacing math if treated as one.

  if (spendIdx === -1 || impressionsIdx === -1 || clicksIdx === -1) {
    return {
      rows: [],
      hints: {},
      warnings: ["Couldn't find Spent/Impressions/Clicks columns -- this doesn't look like a Taboola campaign export."],
    };
  }

  const dataLines = lines.slice(1);
  const rows = [];
  const campaignNames = new Set<string>();

  for (const line of dataLines) {
    const fields = splitDelimitedLine(line, ",");
    if (isBlankRow(fields)) continue;

    rows.push({
      spend: parseNumber(fields[spendIdx]),
      impressions: parseNumber(fields[impressionsIdx]),
      clicks: parseNumber(fields[clicksIdx]),
      frequency: null, // Taboola doesn't report frequency
      videoMetric: 0, // no video metric column in the standard campaign export
    });

    if (campaignNameIdx !== -1 && fields[campaignNameIdx]?.trim()) {
      campaignNames.add(fields[campaignNameIdx].trim());
    }
  }

  if (campaignNames.size > 1) {
    warnings.push(
      `This file has ${campaignNames.size} different campaign names (e.g. "${Array.from(campaignNames)[0]}") -- all rows were combined as one campaign's totals. For accurate results, export a report scoped to a single campaign.`
    );
  }

  return {
    rows,
    hints: { campaignName: campaignNames.size === 1 ? Array.from(campaignNames)[0] : undefined },
    warnings,
  };
}
