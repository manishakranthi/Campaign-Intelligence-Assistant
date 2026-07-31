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

// StackAdapt's campaign export: UTF-8, comma-delimited, single header row, no metadata rows.
export function parseStackAdaptFile(buffer: ArrayBuffer): ParseResult {
  const text = decodeTextFile(buffer);
  const lines = splitLines(text);
  const warnings: string[] = [];

  const headerLine = lines[0];
  if (!headerLine) {
    return { rows: [], hints: {}, warnings: ["File doesn't have enough rows to contain a header."] };
  }
  const headers = splitDelimitedLine(headerLine, ",");

  const campaignNameIdx = findColumnIndex(headers, "Campaign Name");
  // "Media Cost" only, not +3rd Party Fees -- so "spend" means the same thing (what you paid the
  // platform for delivery) across all 5 parsers, matching Meta's "Amount spent"/Google's "Cost".
  const spendIdx = findColumnIndex(headers, "Media Cost");
  const impressionsIdx = findColumnIndex(headers, "Impressions");
  const clicksIdx = findColumnIndex(headers, "Clicks");
  const budgetIdx = findColumnIndex(headers, "Lifetime Budget");
  const flightStartIdx = findColumnIndex(headers, "Flight Date Start");
  const flightEndIdx = findColumnIndex(headers, "Flight Date End");

  if (spendIdx === -1 || impressionsIdx === -1 || clicksIdx === -1) {
    return {
      rows: [],
      hints: {},
      warnings: ["Couldn't find Media Cost/Impressions/Clicks columns -- this doesn't look like a StackAdapt campaign export."],
    };
  }

  const dataLines = lines.slice(1);
  const rows = [];
  const campaignNames = new Set<string>();
  let budgetHint: number | undefined;
  const startDates: Array<string | undefined> = [];
  const endDates: Array<string | undefined> = [];

  for (const line of dataLines) {
    const fields = splitDelimitedLine(line, ",");
    if (isBlankRow(fields)) continue;

    rows.push({
      spend: parseNumber(fields[spendIdx]),
      impressions: parseNumber(fields[impressionsIdx]),
      clicks: parseNumber(fields[clicksIdx]),
      frequency: null, // StackAdapt doesn't report frequency
      videoMetric: 0, // no video metric column in this export
    });

    if (campaignNameIdx !== -1 && fields[campaignNameIdx]?.trim()) {
      campaignNames.add(fields[campaignNameIdx].trim());
    }
    if (budgetHint === undefined && budgetIdx !== -1 && fields[budgetIdx]?.trim()) {
      budgetHint = parseNumber(fields[budgetIdx]);
    }
    if (flightStartIdx !== -1) startDates.push(parseDateFlexible(fields[flightStartIdx]));
    if (flightEndIdx !== -1) endDates.push(parseDateFlexible(fields[flightEndIdx]));
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
      flightStartDate: earliestDate(startDates),
      flightEndDate: latestDate(endDates),
    },
    warnings,
  };
}
