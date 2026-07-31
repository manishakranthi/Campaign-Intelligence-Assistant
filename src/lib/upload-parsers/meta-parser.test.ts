import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseMetaFile } from "./meta-parser";

function loadFixture(): ArrayBuffer {
  const buffer = readFileSync(join(__dirname, "__fixtures__", "meta.xlsx"));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe("parseMetaFile", () => {
  it("parses the real Meta Raw Data Report .xlsx export", () => {
    const result = parseMetaFile(loadFixture());
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("fuzzy-matches Amount spent (USD) and parses Impressions/Link clicks/Frequency on the first data row", () => {
    const result = parseMetaFile(loadFixture());
    const first = result.rows[0];
    expect(first.spend).toBeCloseTo(14754.25, 2);
    expect(first.impressions).toBe(3504990);
    expect(first.clicks).toBe(7311);
    expect(first.frequency).toBeCloseTo(1.15030019, 5);
  });

  it("picks up Reporting starts/ends as flight-date hints", () => {
    const result = parseMetaFile(loadFixture());
    expect(result.hints.flightStartDate).toBe("2023-06-28");
    expect(result.hints.flightEndDate).toBe("2026-07-28");
  });
});
