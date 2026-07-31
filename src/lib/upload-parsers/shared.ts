/** Result every per-platform parser returns -- see PlatformParser below. */
export interface ParsedUploadRow {
  spend: number;
  impressions: number;
  clicks: number;
  frequency: number | null;
  videoMetric: number;
}

export interface ParseHints {
  campaignName?: string;
  budget?: number;
  flightStartDate?: string;
  flightEndDate?: string;
}

export interface ParseResult {
  rows: ParsedUploadRow[];
  hints: ParseHints;
  warnings: string[];
}

export type PlatformParser = (buffer: ArrayBuffer) => ParseResult;

/** UTF-16LE (Google Ads/LinkedIn native exports) vs UTF-8 (Taboola/StackAdapt), by BOM sniffing. */
function detectEncoding(bytes: Uint8Array): "utf-16le" | "utf-8" {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : "utf-8";
}

/**
 * Decodes a raw upload buffer to text. TextDecoder's default ignoreBOM=false strips a leading
 * BOM automatically for both encodings (EF BB BF for utf-8, FF FE for utf-16le), so no manual
 * BOM slicing is needed.
 */
export function decodeTextFile(buffer: ArrayBuffer): string {
  const encoding = detectEncoding(new Uint8Array(buffer));
  return new TextDecoder(encoding).decode(buffer);
}

export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/).filter((line) => line.length > 0);
}

/**
 * Quote-aware delimited-line splitter -- a naive `.split(delimiter)` breaks on quoted values
 * containing the delimiter itself, e.g. `"96,715"` in a comma-delimited file or `"2,241,858"`
 * inside a tab-delimited file (both appear in real Google Ads/Taboola exports).
 */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/** Case-insensitive exact match first, then substring fallback -- so e.g. "Amount spent" matches "Amount spent (USD)" regardless of currency suffix. */
export function findColumnIndex(headers: string[], ...candidates: string[]): number {
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const target = candidate.trim().toLowerCase();
    const exactIndex = normalizedHeaders.indexOf(target);
    if (exactIndex !== -1) return exactIndex;
  }
  for (const candidate of candidates) {
    const target = candidate.trim().toLowerCase();
    const fuzzyIndex = normalizedHeaders.findIndex((h) => h.includes(target));
    if (fuzzyIndex !== -1) return fuzzyIndex;
  }
  return -1;
}

/**
 * Like parseNumber, but a blank/missing cell means "not reported for this row" (null) rather
 * than a real value of 0 -- important for frequency specifically, since campaign-service.ts
 * averages only the rows where frequency !== null, and a blank cell wrongly counted as 0 would
 * drag that average down.
 */
export function parseNumberOrNull(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = raw.replace(/[$,%\s]/g, "").trim();
  if (cleaned === "") return null;
  return parseNumber(raw);
}

/** Strips $, commas, %, and whitespace -- covers every numeric format seen across all 5 platforms' real exports. */
export function parseNumber(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const cleaned = raw.replace(/[$,%\s]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "n/a" || cleaned === "--") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Normalizes YYYY/MM/DD (StackAdapt), M/D/YYYY (LinkedIn, unpadded), and YYYY-MM-DD to YYYY-MM-DD. */
export function parseDateFlexible(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();

  const isoLike = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoLike) {
    const [, year, month, day] = isoLike;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const usLike = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usLike) {
    const [, month, day, year] = usLike;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return undefined;
}

/** Formats a JS Date (e.g. from xlsx's cellDates:true) as YYYY-MM-DD in UTC, avoiding local-timezone drift. */
export function formatDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Earliest of the given date strings (already YYYY-MM-DD), ignoring undefined entries. */
export function earliestDate(dates: Array<string | undefined>): string | undefined {
  const valid = dates.filter((d): d is string => Boolean(d));
  return valid.length > 0 ? valid.reduce((min, d) => (d < min ? d : min)) : undefined;
}

/** Latest of the given date strings (already YYYY-MM-DD), ignoring undefined entries. */
export function latestDate(dates: Array<string | undefined>): string | undefined {
  const valid = dates.filter((d): d is string => Boolean(d));
  return valid.length > 0 ? valid.reduce((max, d) => (d > max ? d : max)) : undefined;
}

/** A row is skippable if every metric is zero AND there's no campaign name -- guards against a trailing blank line, not real zero-value data. */
export function isBlankRow(fields: string[]): boolean {
  return fields.every((f) => f.trim() === "");
}
