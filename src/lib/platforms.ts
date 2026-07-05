export type PlatformKey = "META" | "LINKEDIN" | "GOOGLE" | "TABOOLA" | "STACKADAPT";

export const PLATFORM_KEYS: readonly PlatformKey[] = [
  "META",
  "LINKEDIN",
  "GOOGLE",
  "TABOOLA",
  "STACKADAPT",
];

/** Sheet tab display names, one per platform. */
export const PLATFORM_TAB_LABEL: Record<PlatformKey, string> = {
  META: "Meta",
  LINKEDIN: "LinkedIn",
  GOOGLE: "Google Ads",
  TABOOLA: "Taboola",
  STACKADAPT: "StackAdapt",
};

/** Campaign Name prefixes that can appear within each platform's tab. Meta's tab holds both FB and IG placement rows. */
export const PLATFORM_PREFIXES: Record<PlatformKey, readonly string[]> = {
  META: ["FB", "IG"],
  LINKEDIN: ["LI"],
  GOOGLE: ["GA"],
  TABOOLA: ["TB"],
  STACKADAPT: ["SA"],
};

export const PREFIX_TO_PLATFORM: Record<string, PlatformKey> = {
  FB: "META",
  IG: "META",
  LI: "LINKEDIN",
  GA: "GOOGLE",
  TB: "TABOOLA",
  SA: "STACKADAPT",
};

/** The [Video metric] column header differs per platform even though it represents the same "video engagement" concept. */
export const VIDEO_METRIC_LABEL: Record<PlatformKey, string> = {
  META: "3-Second Video Views",
  GOOGLE: "Thruplays",
  LINKEDIN: "Video Views",
  TABOOLA: "Video Views",
  STACKADAPT: "Video Views",
};
