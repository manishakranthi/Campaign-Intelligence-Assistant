import {
  decodeTextFile,
  earliestDate,
  findColumnIndex,
  isBlankRow,
  latestDate,
  parseDateFlexible,
  parseNumber,
  ParseResult,
  splitDelimitedLine,
  splitLines,
} from "./shared";

// LinkedIn's "Ad Set Performance Report": UTF-16LE with BOM, tab-delimited. 4 metadata lines
// (title, Report Start, Report End, Date Generated) precede the header; splitLines already drops
// the blank line between them and the header, so the header is at index 4 after filtering.
const METADATA_ROWS_TO_SKIP = 4;

export function parseLinkedInFile(buffer: ArrayBuffer): ParseResult {
  const text = decodeTextFile(buffer);
  const lines = splitLines(text);
  const warnings: string[] = [];

  const headerLine = lines[METADATA_ROWS_TO_SKIP];
  if (!headerLine) {
    return { rows: [], hints: {}, warnings: ["File doesn't have enough rows to contain a header."] };
  }
  const headers = splitDelimitedLine(headerLine, "\t");

  const campaignNameIdx = findColumnIndex(headers, "Campaign Name");
  const spendIdx = findColumnIndex(headers, "Total Spent");
  const impressionsIdx = findColumnIndex(headers, "Impressions");
  const clicksIdx = findColumnIndex(headers, "Clicks");
  const videoIdx = findColumnIndex(headers, "Video Views", "Video Plays");
  const budgetIdx = findColumnIndex(headers, "Total Budget");
  const startDateIdx = findColumnIndex(headers, "Ad Set Start Date");
  const endDateIdx = findColumnIndex(headers, "Ad Set End Date");

  if (spendIdx === -1 || impressionsIdx === -1 || clicksIdx === -1) {
    return {
      rows: [],
      hints: {},
      warnings: ["Couldn't find Total Spent/Impressions/Clicks columns -- this doesn't look like a LinkedIn Campaign Manager export."],
    };
  }

  const dataLines = lines.slice(METADATA_ROWS_TO_SKIP + 1);
  const rows = [];
  const campaignNames = new Set<string>();
  let budgetTotal = 0;
  const startDates: Array<string | undefined> = [];
  const endDates: Array<string | undefined> = [];

  for (const line of dataLines) {
    const fields = splitDelimitedLine(line, "\t");
    if (isBlankRow(fields)) continue;

    rows.push({
      spend: parseNumber(fields[spendIdx]),
      impressions: parseNumber(fields[impressionsIdx]),
      clicks: parseNumber(fields[clicksIdx]),
      frequency: null, // LinkedIn Ad Set reports don't include a frequency metric
      videoMetric: videoIdx !== -1 ? parseNumber(fields[videoIdx]) : 0,
    });

    if (campaignNameIdx !== -1 && fields[campaignNameIdx]?.trim()) {
      campaignNames.add(fields[campaignNameIdx].trim());
    }
    if (budgetIdx !== -1 && fields[budgetIdx]?.trim()) {
      budgetTotal += parseNumber(fields[budgetIdx]);
    }
    if (startDateIdx !== -1) startDates.push(parseDateFlexible(fields[startDateIdx]));
    if (endDateIdx !== -1) endDates.push(parseDateFlexible(fields[endDateIdx]));
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
      budget: budgetTotal > 0 ? Number(budgetTotal.toFixed(2)) : undefined,
      flightStartDate: earliestDate(startDates),
      flightEndDate: latestDate(endDates),
    },
    warnings,
  };
}
