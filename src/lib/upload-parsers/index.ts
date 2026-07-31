import { PlatformKey } from "../platforms";
import { PlatformParser } from "./shared";
import { parseMetaFile } from "./meta-parser";
import { parseGoogleAdsFile } from "./google-ads-parser";
import { parseLinkedInFile } from "./linkedin-parser";
import { parseTaboolaFile } from "./taboola-parser";
import { parseStackAdaptFile } from "./stackadapt-parser";

export type { ParseResult, ParsedUploadRow, ParseHints, PlatformParser } from "./shared";

/**
 * Dispatched by the platform tag the user picks in the upload UI -- never by content-sniffing,
 * since campaign ID and platform are always known upfront (the app assigns campaignId, the user
 * tags each file with its platform).
 */
export const PLATFORM_PARSERS: Record<PlatformKey, PlatformParser> = {
  META: parseMetaFile,
  GOOGLE: parseGoogleAdsFile,
  LINKEDIN: parseLinkedInFile,
  TABOOLA: parseTaboolaFile,
  STACKADAPT: parseStackAdaptFile,
};
