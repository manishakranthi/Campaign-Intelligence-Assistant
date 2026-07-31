import {
  decodeTextFile,
  findColumnIndex,
  isBlankRow,
  parseNumber,
  parseNumberOrNull,
  ParseResult,
  splitDelimitedLine,
  splitLines,
} from "./shared";

// Google Ads' native "Campaign report" CSV export: UTF-16LE with BOM, tab-delimited, with a
// title row + a date-range row ("All time") before the real header row.
const METADATA_ROWS_TO_SKIP = 2;

export function parseGoogleAdsFile(buffer: ArrayBuffer): ParseResult {
  const text = decodeTextFile(buffer);
  const lines = splitLines(text);
  const warnings: string[] = [];

  const headerLine = lines[METADATA_ROWS_TO_SKIP];
  if (!headerLine) {
    return { rows: [], hints: {}, warnings: ["File doesn't have enough rows to contain a header."] };
  }
  const headers = splitDelimitedLine(headerLine, "\t");

  const campaignNameIdx = findColumnIndex(headers, "Campaign");
  const spendIdx = findColumnIndex(headers, "Cost");
  const impressionsIdx = findColumnIndex(headers, "Impr.");
  const clicksIdx = findColumnIndex(headers, "Clicks");
  const frequencyIdx = findColumnIndex(headers, "Avg. impr. freq. / user");
  const videoIdx = findColumnIndex(headers, "TrueView views", "Video played to 100%");
  const budgetIdx = findColumnIndex(headers, "Budget");

  if (spendIdx === -1 || impressionsIdx === -1 || clicksIdx === -1) {
    return {
      rows: [],
      hints: {},
      warnings: ["Couldn't find Cost/Impr./Clicks columns -- this doesn't look like a Google Ads campaign report export."],
    };
  }

  const dataLines = lines.slice(METADATA_ROWS_TO_SKIP + 1);
  const rows = [];
  const campaignNames = new Set<string>();
  let budgetHint: number | undefined;

  for (const line of dataLines) {
    const fields = splitDelimitedLine(line, "\t");
    if (isBlankRow(fields)) continue;

    rows.push({
      spend: parseNumber(fields[spendIdx]),
      impressions: parseNumber(fields[impressionsIdx]),
      clicks: parseNumber(fields[clicksIdx]),
      frequency: frequencyIdx !== -1 ? parseNumberOrNull(fields[frequencyIdx]) : null,
      videoMetric: videoIdx !== -1 ? parseNumber(fields[videoIdx]) : 0,
    });

    if (campaignNameIdx !== -1 && fields[campaignNameIdx]?.trim()) {
      campaignNames.add(fields[campaignNameIdx].trim());
    }
    if (budgetHint === undefined && budgetIdx !== -1 && fields[budgetIdx]?.trim()) {
      budgetHint = parseNumber(fields[budgetIdx]);
    }
  }

  if (campaignNames.size > 1) {
    warnings.push(
      `This file has ${campaignNames.size} different campaign names (e.g. "${Array.from(campaignNames)[0]}") -- all rows were combined as one campaign's totals. For accurate results, export a report scoped to a single campaign.`
    );
  }

  return {
    rows,
    hints: {
      campaignName: campaignNames.size === 1 ? Array.from(campaignNames)[0] : undefined,
      budget: budgetHint,
    },
    warnings,
  };
}
