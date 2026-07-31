import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseLinkedInFile } from "./linkedin-parser";

function loadFixture(): ArrayBuffer {
  const buffer = readFileSync(join(__dirname, "__fixtures__", "linkedin.csv"));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe("parseLinkedInFile", () => {
  it("parses the real LinkedIn Ad Set Performance Report, skipping the 4 metadata rows", () => {
    const result = parseLinkedInFile(loadFixture());
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("parses Total Spent/Impressions/Clicks correctly on the first data row", () => {
    const result = parseLinkedInFile(loadFixture());
    const first = result.rows[0];
    expect(first.spend).toBeCloseTo(1143.98, 2);
    expect(first.impressions).toBe(41582);
    expect(first.clicks).toBe(147);
    expect(first.frequency).toBeNull();
  });

  it("normalizes unpadded M/D/YYYY Ad Set Start/End Date hints to YYYY-MM-DD (earliest start, latest end across all ad sets)", () => {
    const result = parseLinkedInFile(loadFixture());
    expect(result.hints.flightStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.hints.flightEndDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.hints.flightStartDate! <= result.hints.flightEndDate!).toBe(true);
  });

  it("sums Total Budget across all ad-set rows as the budget hint", () => {
    const result = parseLinkedInFile(loadFixture());
    expect(result.hints.budget).toBeGreaterThan(0);
  });
});
