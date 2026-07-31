import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseTaboolaFile } from "./taboola-parser";

function loadFixture(): ArrayBuffer {
  const buffer = readFileSync(join(__dirname, "__fixtures__", "taboola.csv"));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe("parseTaboolaFile", () => {
  it("parses the real Taboola campaign export", () => {
    const result = parseTaboolaFile(loadFixture());
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("strips commas from Impressions and parses Spent/Clicks correctly on the first data row", () => {
    const result = parseTaboolaFile(loadFixture());
    const first = result.rows[0];
    expect(first.spend).toBeCloseTo(854.99, 2);
    expect(first.impressions).toBe(695756);
    expect(first.clicks).toBe(3176);
    expect(first.frequency).toBeNull();
    expect(first.videoMetric).toBe(0);
  });

  it("does not surface a budget hint (Estimated Daily Cap is deliberately not mapped)", () => {
    const result = parseTaboolaFile(loadFixture());
    expect(result.hints.budget).toBeUndefined();
  });
});
