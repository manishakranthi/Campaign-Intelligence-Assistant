import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseGoogleAdsFile } from "./google-ads-parser";

function loadFixture(): ArrayBuffer {
  const buffer = readFileSync(join(__dirname, "__fixtures__", "google-ads.csv"));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe("parseGoogleAdsFile", () => {
  it("parses the real Google Ads campaign report export", () => {
    const result = parseGoogleAdsFile(loadFixture());
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("strips thousands-commas from Impr. and parses Cost/Clicks correctly on the first data row", () => {
    const result = parseGoogleAdsFile(loadFixture());
    const first = result.rows[0];
    expect(first.impressions).toBe(96715);
    expect(first.spend).toBeCloseTo(1500.06, 2);
    expect(first.clicks).toBe(301);
  });

  it("warns when the file has multiple distinct campaign names", () => {
    const result = parseGoogleAdsFile(loadFixture());
    expect(result.warnings.some((w) => w.includes("different campaign names"))).toBe(true);
  });
});
