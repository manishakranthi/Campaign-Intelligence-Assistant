/**
 * Campaign names in the sheet follow: {PlatformPrefix}_{CampaignID}_{CampaignName}_{GoalType}
 * e.g. FB_10293_SpringSale2026_PV -> prefix FB, id 10293, name "SpringSale2026", goal PV.
 *
 * The middle name segment may itself contain underscores (e.g. "Spring_Sale_2026"), so the
 * first token is always the platform prefix, the second is always the Campaign ID, the LAST
 * token is always the goal type code, and everything between is rejoined as the name.
 */

export type PlatformPrefix = "FB" | "IG" | "LI" | "GA" | "SA" | "TB";

const KNOWN_PREFIXES: readonly PlatformPrefix[] = ["FB", "IG", "LI", "GA", "SA", "TB"];

export interface ParsedCampaignName {
  /** Raw, unvalidated prefix as it appeared in the name (uppercased). */
  platformPrefix: string;
  /** True if platformPrefix is one of the known prefixes (FB, IG, LI, GA, SA, TB). */
  isKnownPrefix: boolean;
  campaignId: string;
  campaignName: string;
  /** Goal type code (e.g. "PV"), or null if it couldn't be determined. */
  goalType: string | null;
  /** The original, unparsed campaign name string. */
  raw: string;
  /** True if the name parsed cleanly with no fallbacks applied. */
  isWellFormed: boolean;
}

function isKnownPrefix(value: string): value is PlatformPrefix {
  return (KNOWN_PREFIXES as readonly string[]).includes(value);
}

/**
 * Parses a raw Campaign Name from the sheet into its component parts.
 * Never throws -- malformed input is handled defensively, with a console warning
 * and best-effort fallback values, since real exported data will occasionally be messy.
 */
export function parseCampaignName(rawInput: string): ParsedCampaignName {
  const raw = rawInput ?? "";
  const trimmed = raw.trim();

  if (!trimmed) {
    console.warn(`parseCampaignName: received empty campaign name`);
    return {
      platformPrefix: "",
      isKnownPrefix: false,
      campaignId: "",
      campaignName: "",
      goalType: null,
      raw,
      isWellFormed: false,
    };
  }

  const segments = trimmed.split("_").filter((segment) => segment.length > 0);

  if (segments.length < 3) {
    console.warn(
      `parseCampaignName: "${raw}" has too few "_"-delimited segments (expected at least ` +
        `PlatformPrefix_CampaignID_Name); falling back to best-effort parse`
    );
  }

  const platformPrefixRaw = segments[0] ?? "";
  const platformPrefix = platformPrefixRaw.toUpperCase();
  const knownPrefix = isKnownPrefix(platformPrefix);
  if (platformPrefixRaw && !knownPrefix) {
    console.warn(
      `parseCampaignName: "${raw}" has unrecognized platform prefix "${platformPrefixRaw}"`
    );
  }

  const campaignId = segments[1] ?? "";
  if (!campaignId) {
    console.warn(`parseCampaignName: "${raw}" is missing a Campaign ID segment`);
  }

  // Everything between index 2 and the last segment (exclusive) is the name.
  // If there are only 3 segments total (prefix, id, X), there's no separate goal
  // code available -- treat the remaining segment as the name and leave goal null.
  let campaignName: string;
  let goalType: string | null;

  if (segments.length >= 4) {
    campaignName = segments.slice(2, -1).join("_");
    goalType = segments[segments.length - 1];
  } else if (segments.length === 3) {
    campaignName = segments[2];
    goalType = null;
    console.warn(`parseCampaignName: "${raw}" has no distinguishable goal type segment`);
  } else {
    campaignName = segments.slice(2).join("_");
    goalType = null;
  }

  const isWellFormed =
    segments.length >= 4 && knownPrefix && campaignId.length > 0 && campaignName.length > 0;

  return {
    platformPrefix,
    isKnownPrefix: knownPrefix,
    campaignId,
    campaignName,
    goalType,
    raw,
    isWellFormed,
  };
}
