import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStackAdaptFile } from "./stackadapt-parser";

function loadFixture(): ArrayBuffer {
  const buffer = readFileSync(join(__dirname, "__fixtures__", "stackadapt.csv"));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe("parseStackAdaptFile", () => {
  it("parses the real StackAdapt campaign export", () => {
    const result = parseStackAdaptFile(loadFixture());
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("strips $ and commas from Media Cost/Impressions on the first data row", () => {
    const result = parseStackAdaptFile(loadFixture());
    const first = result.rows[0];
    expect(first.spend).toBeCloseTo(1173.47, 2);
    expect(first.impressions).toBe(316787);
    expect(first.clicks).toBe(776);
    expect(first.frequency).toBeNull();
  });

  it("picks up Flight Date Start/End as hints, normalized to YYYY-MM-DD", () => {
    const result = parseStackAdaptFile(loadFixture());
    expect(result.hints.flightStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.hints.flightEndDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("picks up Lifetime Budget as the budget hint", () => {
    const result = parseStackAdaptFile(loadFixture());
    expect(result.hints.budget).toBe(3750);
  });
});
