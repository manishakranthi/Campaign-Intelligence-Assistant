import { NextRequest, NextResponse } from "next/server";
import { PLATFORM_KEYS, PLATFORM_PREFIXES, PlatformKey, VIDEO_METRIC_LABEL } from "@/lib/platforms";
import { PLATFORM_PARSERS, ParsedUploadRow, ParseHints } from "@/lib/upload-parsers";
import { getUploadedCampaignStore } from "@/lib/uploaded-campaign-store";
import { getTicketingSource, TicketMetadata } from "@/lib/ticketing-source";
import type { PerformanceRow } from "@/lib/data-source";

export const runtime = "nodejs"; // required for the xlsx package

const FIRST_UPLOADED_CAMPAIGN_ID = 20001;

function deriveGoalAndObjective(goalTypeCode: string, goalAmount: number): { objective: string; goal: string } {
  if (goalTypeCode === "AWR") {
    return { objective: "Brand Awareness", goal: `${goalAmount.toLocaleString("en-US")} impressions` };
  }
  return { objective: "Page Views / Site Traffic", goal: `${goalAmount.toLocaleString("en-US")} page views` };
}

async function assignCampaignId(): Promise<string> {
  const existing = await getTicketingSource().listTickets();
  const taken = new Set(existing.map((t) => t.campaignId));
  let id = FIRST_UPLOADED_CAMPAIGN_ID;
  while (taken.has(String(id))) id++;
  return String(id);
}

interface PlatformFileResult {
  platform: PlatformKey;
  rowCount: number;
  hints: ParseHints;
  warnings: string[];
}

interface PlatformFileError {
  platform: PlatformKey;
  error: string;
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
  }

  const vertical = String(formData.get("vertical") ?? "").trim();
  const goalTypeCode = String(formData.get("goalTypeCode") ?? "").trim();
  const goalAmountRaw = formData.get("goalAmount");
  const goalAmount = goalAmountRaw ? Number(goalAmountRaw) : NaN;

  if (!vertical || (goalTypeCode !== "AWR" && goalTypeCode !== "PV") || !Number.isFinite(goalAmount) || goalAmount <= 0) {
    return NextResponse.json(
      { error: "vertical, goalTypeCode ('AWR' or 'PV'), and a positive goalAmount are required." },
      { status: 400 }
    );
  }

  const formCampaignName = String(formData.get("campaignName") ?? "").trim() || undefined;
  const formBudgetRaw = formData.get("overallBudget");
  const formBudget = formBudgetRaw ? Number(formBudgetRaw) : undefined;
  const formFlightStart = String(formData.get("flightStartDate") ?? "").trim() || undefined;
  const formFlightEnd = String(formData.get("flightEndDate") ?? "").trim() || undefined;

  const fileResults: PlatformFileResult[] = [];
  const fileErrors: PlatformFileError[] = [];
  const platformRows = new Map<PlatformKey, ParsedUploadRow[]>();
  const platformHints = new Map<PlatformKey, ParseHints>();

  for (const platform of PLATFORM_KEYS) {
    const file = formData.get(`file_${platform}`);
    if (!(file instanceof File)) continue;

    try {
      const buffer = await file.arrayBuffer();
      const result = PLATFORM_PARSERS[platform](buffer);

      if (result.rows.length === 0) {
        fileErrors.push({
          platform,
          error: result.warnings[0] ?? "No usable rows found in this file.",
        });
        continue;
      }

      fileResults.push({ platform, rowCount: result.rows.length, hints: result.hints, warnings: result.warnings });
      platformHints.set(platform, result.hints);
      platformRows.set(platform, result.rows);
    } catch (err) {
      fileErrors.push({ platform, error: err instanceof Error ? err.message : "Failed to parse this file." });
    }
  }

  if (fileResults.length === 0) {
    return NextResponse.json(
      { error: "None of the uploaded files could be parsed.", fileErrors },
      { status: 400 }
    );
  }

  // Merge hints with a fixed priority (explicit form input always wins over any file hint).
  const budgetPriority: PlatformKey[] = ["STACKADAPT", "GOOGLE", "LINKEDIN"];
  const flightPriority: PlatformKey[] = ["STACKADAPT", "LINKEDIN", "META"];

  const budgetHint = budgetPriority.map((p) => platformHints.get(p)?.budget).find((v) => v !== undefined);
  const flightStartHint = flightPriority.map((p) => platformHints.get(p)?.flightStartDate).find((v) => v !== undefined);
  const flightEndHint = flightPriority.map((p) => platformHints.get(p)?.flightEndDate).find((v) => v !== undefined);
  const campaignNameHint = fileResults.map((r) => r.hints.campaignName).find((v) => v !== undefined);

  const overallBudget = formBudget ?? budgetHint;
  const flightStartDate = formFlightStart ?? flightStartHint;
  const flightEndDate = formFlightEnd ?? flightEndHint;

  if (!overallBudget || overallBudget <= 0) {
    return NextResponse.json(
      {
        error: "Couldn't determine an overall budget from the uploaded files -- please enter one.",
        missingField: "budget" as const,
        fileErrors,
      },
      { status: 400 }
    );
  }
  if (!flightStartDate || !flightEndDate) {
    return NextResponse.json(
      {
        error: "Couldn't determine flight start/end dates from the uploaded files -- please enter them.",
        missingField: "flightDates" as const,
        fileErrors,
      },
      { status: 400 }
    );
  }

  const campaignId = await assignCampaignId();
  const campaignName = formCampaignName ?? campaignNameHint ?? `UploadedCampaign${campaignId}`;
  const { objective, goal } = deriveGoalAndObjective(goalTypeCode, goalAmount);
  const platforms = fileResults.map((r) => r.platform);

  const ticket: TicketMetadata = {
    campaignId,
    campaignName,
    flightStartDate,
    flightEndDate,
    overallBudget,
    objective,
    goal,
    goalTypeCode,
    goalAmount,
    vertical,
    platforms,
    dataGranularity: "aggregate",
  };

  // Now that campaignId/flight dates are known, build the real PerformanceRow[] per platform.
  // Every row from a platform's file gets the same pseudo-date (the flight start) -- these
  // exports are whole-period aggregates, not daily data (see campaign-service.ts's `days` fix,
  // which is why pacing/budget math still works fine off a single-date row set).
  const rows: PerformanceRow[] = [];
  for (const result of fileResults) {
    const platform = result.platform;
    const prefix = PLATFORM_PREFIXES[platform][0];
    const perPlatformBudget = platformHints.get(platform)?.budget ?? overallBudget / platforms.length;
    const rawRows = platformRows.get(platform) ?? [];

    for (const parsedRow of rawRows) {
      rows.push({
        date: flightStartDate,
        platform,
        campaignId,
        campaignNameSegment: campaignName.replace(/\s+/g, ""),
        goalTypeCode,
        rawCampaignName: `${prefix}_${campaignId}_${campaignName.replace(/\s+/g, "")}_${goalTypeCode}`,
        spend: parsedRow.spend,
        impressions: parsedRow.impressions,
        clicks: parsedRow.clicks,
        ctr: parsedRow.impressions > 0 ? (parsedRow.clicks / parsedRow.impressions) * 100 : 0,
        cpm: parsedRow.impressions > 0 ? (parsedRow.spend / parsedRow.impressions) * 1000 : 0,
        frequency: parsedRow.frequency,
        budget: perPlatformBudget,
        videoMetric: parsedRow.videoMetric,
        videoMetricLabel: VIDEO_METRIC_LABEL[platform],
        startDate: flightStartDate,
        endDate: flightEndDate,
      });
    }
  }

  await getUploadedCampaignStore().add({ ticket, rows });

  return NextResponse.json({
    ticket: { ...ticket, status: "live" as const },
    fileResults: fileResults.map(({ platform, rowCount, warnings }) => ({ platform, rowCount, warnings })),
    fileErrors,
  });
}
