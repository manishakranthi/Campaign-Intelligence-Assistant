/**
 * Client-side PDF export for a chat turn's analysis results. Runs entirely in the browser (no
 * server round trip) so it works from data already gathered in the current conversation -- see
 * ToolResult in ToolResultCard.tsx, the same shape /api/chat's toolCallLog returns. This is a
 * presentation/export module (like the card components), not business logic, so unlike
 * src/lib's analysis modules it has no accompanying .test.ts.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ToolResult } from "@/components/cards/ToolResultCard";
import type { CampaignPerformance } from "@/lib/campaign-service";
import type { TrendAnalysisResult, TrendAnalysisInsufficientData, MetricComparison } from "@/lib/trend-analysis";
import type { ComparativeAnalysisResult } from "@/lib/comparative-analysis";
import type { AnomalyDetectionResult, AnomalyDetectionInsufficientData } from "@/lib/anomaly-detection";
import type { CreativeFatigueResult } from "@/lib/creative-fatigue";
import type { PacingResult } from "@/lib/pacing";
import type { BudgetReallocationResult, InitialBudgetSplitResult } from "@/lib/budget-recommendation";
import type { AudienceExpansionResult } from "@/lib/audience-expansion";
import type { TrendingAudienceResult } from "@/lib/audience-service";

interface TicketRow {
  campaignId: string;
  campaignName: string;
  status: "new" | "live";
  objective: string;
  goal: string;
  vertical: string;
  platforms: string[];
  flightStartDate: string;
  flightEndDate: string;
  overallBudget: number;
}

function isErrorResult(result: unknown): result is { error: string } {
  return typeof result === "object" && result !== null && "error" in result && typeof (result as { error: unknown }).error === "string";
}

function hasInsufficientData(result: unknown): result is { insufficientDailyData: true; message: string } {
  return typeof result === "object" && result !== null && "insufficientDailyData" in result;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

function formatSignedPercent(n: number | null, digits = 1): string {
  if (n === null) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

/** The first campaignId found across a chat turn's tool calls, or null (e.g. a bare list_tickets turn). */
export function extractCampaignId(toolResults: ToolResult[]): string | null {
  for (const tr of toolResults) {
    const id = (tr.args as { campaignId?: string } | undefined)?.campaignId;
    if (id) return id;
  }
  return null;
}

const TOOL_DISPLAY_ORDER = [
  "list_tickets",
  "get_campaign_performance",
  "get_trending_audience",
  "recommend_initial_budget_split",
  "get_trend_analysis",
  "get_comparative_analysis",
  "detect_anomalies",
  "detect_creative_fatigue",
  "get_pacing_status",
  "recommend_budget_reallocation",
  "suggest_audience_expansion",
] as const;

const SECTION_TITLES: Record<(typeof TOOL_DISPLAY_ORDER)[number], string> = {
  list_tickets: "Campaign Tickets",
  get_campaign_performance: "Performance Overview",
  get_trending_audience: "Trending Audience Signals",
  recommend_initial_budget_split: "Initial Budget Split (Pre-Launch Estimate)",
  get_trend_analysis: "Trend Analysis (Period over Period)",
  get_comparative_analysis: "Comparative (“Moat”) Analysis",
  detect_anomalies: "Anomaly Detection",
  detect_creative_fatigue: "Creative Fatigue",
  get_pacing_status: "Pacing Status",
  recommend_budget_reallocation: "Budget Reallocation Recommendation",
  suggest_audience_expansion: "Audience Expansion Suggestions",
};

/** Thin layout helper around jsPDF: tracks a vertical cursor and paginates automatically. */
class ReportWriter {
  readonly doc: jsPDF;
  readonly margin = 40;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly contentWidth: number;
  y: number;

  constructor() {
    this.doc = new jsPDF({ unit: "pt", format: "a4" });
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - this.margin * 2;
    this.y = this.margin;
  }

  private ensureSpace(height: number) {
    if (this.y + height > this.pageHeight - this.margin) {
      this.doc.addPage();
      this.y = this.margin;
    }
  }

  spacer(height = 6) {
    this.y += height;
  }

  h2(text: string) {
    this.ensureSpace(28);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(13);
    this.doc.setTextColor(31, 78, 121);
    this.doc.text(text, this.margin, this.y);
    this.y += 10;
    this.doc.setDrawColor(210, 210, 210);
    this.doc.line(this.margin, this.y, this.pageWidth - this.margin, this.y);
    this.y += 14;
  }

  h3(text: string) {
    this.ensureSpace(18);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10.5);
    this.doc.setTextColor(55, 65, 81);
    this.doc.text(text, this.margin, this.y);
    this.y += 14;
  }

  body(text: string, opts: { italic?: boolean } = {}) {
    this.doc.setFont("helvetica", opts.italic ? "italic" : "normal");
    this.doc.setFontSize(9.5);
    this.doc.setTextColor(51, 51, 51);
    const lines = this.doc.splitTextToSize(text, this.contentWidth) as string[];
    for (const line of lines) {
      this.ensureSpace(13);
      this.doc.text(line, this.margin, this.y);
      this.y += 13;
    }
    this.y += 3;
  }

  bullets(items: string[]) {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9.5);
    this.doc.setTextColor(51, 51, 51);
    for (const item of items) {
      const lines = this.doc.splitTextToSize(item, this.contentWidth - 14) as string[];
      lines.forEach((line, i) => {
        this.ensureSpace(13);
        this.doc.text(i === 0 ? `• ${line}` : `  ${line}`, this.margin, this.y);
        this.y += 13;
      });
    }
    this.y += 3;
  }

  /** Distinct treatment for cross-platform-correlated anomaly findings -- mirrors CrossPlatformCallout. */
  callout(label: string, text: string) {
    const lines = this.doc.splitTextToSize(text, this.contentWidth - 20) as string[];
    const boxHeight = 26 + lines.length * 13;
    this.ensureSpace(boxHeight + 10);
    this.doc.setFillColor(238, 232, 252);
    this.doc.setDrawColor(196, 181, 253);
    this.doc.roundedRect(this.margin, this.y, this.contentWidth, boxHeight, 4, 4, "FD");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(91, 33, 182);
    this.doc.text(label.toUpperCase(), this.margin + 10, this.y + 15);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9.5);
    this.doc.setTextColor(51, 51, 51);
    let ly = this.y + 30;
    for (const line of lines) {
      this.doc.text(line, this.margin + 10, ly);
      ly += 13;
    }
    this.y += boxHeight + 12;
  }

  table(head: string[], rows: (string | number)[][], fontSize = 8.5) {
    autoTable(this.doc, {
      startY: this.y,
      margin: { left: this.margin, right: this.margin },
      head: [head],
      body: rows,
      styles: { fontSize, cellPadding: 4, textColor: [51, 51, 51] },
      headStyles: { fillColor: [31, 78, 121], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
    const withAutoTable = this.doc as jsPDF & { lastAutoTable?: { finalY: number } };
    this.y = (withAutoTable.lastAutoTable?.finalY ?? this.y) + 16;
  }

  keyValueTable(pairs: [string, string][]) {
    this.table(["Metric", "Value"], pairs);
  }
}

function renderTickets(w: ReportWriter, tickets: TicketRow[]) {
  w.h2(SECTION_TITLES.list_tickets);
  w.table(
    ["ID", "Name", "Status", "Objective", "Goal", "Vertical", "Platforms"],
    tickets.map((t) => [t.campaignId, t.campaignName, t.status, t.objective, t.goal, t.vertical, t.platforms.join(", ")])
  );
}

function renderPerformance(w: ReportWriter, perf: CampaignPerformance) {
  w.h2(SECTION_TITLES.get_campaign_performance);
  w.keyValueTable([
    ["Spend", formatCurrency(perf.combined.spend)],
    ["Impressions", formatNumber(perf.combined.impressions)],
    ["Clicks", formatNumber(perf.combined.clicks)],
    ["CTR", formatPercent(perf.combined.ctr, 2)],
    ["CPM", formatCurrency(perf.combined.cpm)],
    ["Avg. Frequency", perf.combined.avgFrequency !== null ? perf.combined.avgFrequency.toFixed(2) : "n/a"],
  ]);
  w.h3("By Platform");
  w.table(
    ["Platform", "Spend", "Impressions", "Clicks", "CTR", "CPM", "Frequency", "Video Engagement"],
    perf.platforms.map((p) => [
      p.platform,
      formatCurrency(p.spend),
      formatNumber(p.impressions),
      formatNumber(p.clicks),
      formatPercent(p.ctr, 2),
      formatCurrency(p.cpm),
      p.avgFrequency !== null ? p.avgFrequency.toFixed(2) : "n/a",
      `${formatNumber(p.videoMetricTotal)} ${p.videoMetricLabel}`,
    ])
  );
}

function renderTrend(w: ReportWriter, trend: TrendAnalysisResult | TrendAnalysisInsufficientData) {
  w.h2(SECTION_TITLES.get_trend_analysis);
  if (hasInsufficientData(trend)) {
    w.body(trend.message, { italic: true });
    return;
  }
  w.body(
    `Comparing ${trend.currentPeriod.start} - ${trend.currentPeriod.end} (current) vs. ` +
      `${trend.priorPeriod.start} - ${trend.priorPeriod.end} (prior). Moves of 15% or more are flagged as meaningful.`
  );
  const metricRow = (m: MetricComparison) => [
    m.metric,
    m.prior,
    m.current,
    formatSignedPercent(m.percentChange),
    m.isMeaningful ? "Yes" : "No",
  ];
  w.h3("Combined");
  w.table(["Metric", "Prior", "Current", "% Change", "Meaningful?"], trend.combined.map(metricRow));
  for (const platformTrend of trend.byPlatform) {
    w.h3(platformTrend.platform);
    w.table(["Metric", "Prior", "Current", "% Change", "Meaningful?"], platformTrend.metrics.map(metricRow));
  }
}

function renderComparative(w: ReportWriter, comparison: ComparativeAnalysisResult) {
  w.h2(SECTION_TITLES.get_comparative_analysis);
  if (comparison.peerComparisons.length === 0 && comparison.crossPlatformComparisons.length === 0) {
    w.body("No peer or cross-platform comparison data available for this campaign.");
    return;
  }
  if (comparison.peerComparisons.length > 0) {
    w.h3("Vs. Peer Campaigns (Same Platform)");
    w.table(
      ["Platform", "Metric", "This Campaign", "Peer Avg", "Peer Count", "% Diff", "Better?"],
      comparison.peerComparisons.map((c) => [
        c.platform,
        c.metric.toUpperCase(),
        c.metric === "cpm" ? formatCurrency(c.thisCampaignValue) : formatPercent(c.thisCampaignValue, 2),
        c.metric === "cpm" ? formatCurrency(c.peerAverage) : formatPercent(c.peerAverage, 2),
        c.peerCount,
        formatSignedPercent(c.percentDifference),
        c.isBetterThanPeers ? "Yes" : "No",
      ])
    );
  }
  if (comparison.crossPlatformComparisons.length > 0) {
    w.h3("Vs. This Campaign's Other Platforms");
    w.table(
      ["Platform", "Vs.", "CTR", "Others' CTR", "CTR % Diff", "CPM", "Others' CPM", "CPM % Diff"],
      comparison.crossPlatformComparisons.map((c) => [
        c.platform,
        c.otherPlatforms.join(", "),
        formatPercent(c.ctrValue, 2),
        formatPercent(c.ctrOthersAverage, 2),
        formatSignedPercent(c.ctrPercentDifference),
        formatCurrency(c.cpmValue),
        formatCurrency(c.cpmOthersAverage),
        formatSignedPercent(c.cpmPercentDifference),
      ]),
      7.5
    );
  }
}

function renderAnomalies(w: ReportWriter, anomalies: AnomalyDetectionResult | AnomalyDetectionInsufficientData) {
  w.h2(SECTION_TITLES.detect_anomalies);
  if (hasInsufficientData(anomalies)) {
    w.body(anomalies.message, { italic: true });
    return;
  }
  if (anomalies.crossPlatformFindings.length > 0) {
    for (const finding of anomalies.crossPlatformFindings) {
      w.callout("Cross-Platform Signal", finding.description);
    }
  }
  if (anomalies.findings.length > 0) {
    w.table(
      ["Platform", "Type", "Window", "Days", "Benchmark", "Description"],
      anomalies.findings.map((f) => [f.platform, f.type, `${f.startDate} - ${f.endDate}`, f.days, f.benchmark, f.description]),
      7.5
    );
  } else if (anomalies.crossPlatformFindings.length === 0) {
    w.body("No anomalies detected against each platform's trailing 7-day average.");
  }
}

function renderFatigue(w: ReportWriter, fatigue: CreativeFatigueResult) {
  w.h2(SECTION_TITLES.detect_creative_fatigue);
  if (fatigue.findings.length === 0) {
    w.body("No creative fatigue detected.");
    return;
  }
  for (const finding of fatigue.findings) {
    w.h3(`${finding.platform} — ${finding.creativeType} creative (${finding.confidence} confidence)`);
    w.body(finding.summary);
    if (finding.recommendations.length > 0) w.bullets(finding.recommendations);
    w.spacer(4);
  }
}

function renderPacing(w: ReportWriter, pacing: PacingResult) {
  w.h2(SECTION_TITLES.get_pacing_status);
  w.keyValueTable([
    ["Flight", `${pacing.flightStartDate} - ${pacing.flightEndDate} (${pacing.flightLengthDays} days)`],
    ["Days Elapsed / Remaining", `${pacing.daysElapsed} / ${pacing.daysRemaining}`],
    ["Spend Pacing", pacing.spendPacingStatus],
    ["Spend To Date / Expected", `${formatCurrency(pacing.spendToDate)} / ${formatCurrency(pacing.expectedSpendToDate)}`],
    ["Goal Pacing", pacing.goalPacingStatus],
    ["Goal Progress / Expected", `${formatNumber(pacing.goalToDate)} / ${formatNumber(pacing.expectedGoalToDate)}`],
    ["Projected at Flight End", formatNumber(pacing.projectedGoalAtFlightEnd)],
  ]);
  w.body(pacing.spendPacingDetail);
  w.body(pacing.goalPacingDetail);
}

function renderReallocation(w: ReportWriter, reallocation: BudgetReallocationResult) {
  w.h2(SECTION_TITLES.recommend_budget_reallocation);
  if (reallocation.applicable) {
    w.table(
      ["Platform", `Efficiency (${reallocation.efficiencyLabel})`, "Total Spend", "Daily Spend"],
      reallocation.ranked.map((r) => [r.platform, r.efficiencyValue, formatCurrency(r.spend), formatCurrency(r.dailySpend)])
    );
  }
  w.body(reallocation.recommendation);
}

function renderBudgetSplit(w: ReportWriter, split: InitialBudgetSplitResult) {
  w.h2(SECTION_TITLES.recommend_initial_budget_split);
  w.body(split.rationale);
  w.table(
    ["Platform", "Share", "Amount"],
    split.allocations.map((a) => [a.platform, formatPercent(a.share * 100, 1), formatCurrency(a.amount)])
  );
  w.body(split.caveat, { italic: true });
}

function renderTrendingAudience(w: ReportWriter, audience: TrendingAudienceResult) {
  w.h2(SECTION_TITLES.get_trending_audience);
  w.body(`Topic: ${audience.topic}`);
  if (audience.googleTrends.relatedQueries.length > 0) {
    w.h3("Google Trends — Related Queries");
    w.bullets(audience.googleTrends.relatedQueries);
  }
  if (audience.metaAudienceInsights && audience.metaAudienceInsights.insights.length > 0) {
    w.h3(`Meta Audience Insights${audience.metaAudienceInsights.isMocked ? " (mocked)" : ""}`);
    w.bullets(audience.metaAudienceInsights.insights.map((i) => `${i.label}: ${i.detail}`));
  }
}

function renderAudienceExpansion(w: ReportWriter, expansion: AudienceExpansionResult) {
  w.h2(SECTION_TITLES.suggest_audience_expansion);
  w.body(expansion.reason);
  if (expansion.suggestedAngles.length > 0) {
    w.bullets(expansion.suggestedAngles);
  }
}

function renderSection(w: ReportWriter, name: (typeof TOOL_DISPLAY_ORDER)[number], result: unknown) {
  switch (name) {
    case "list_tickets":
      return renderTickets(w, result as TicketRow[]);
    case "get_campaign_performance":
      return renderPerformance(w, result as CampaignPerformance);
    case "get_trending_audience":
      return renderTrendingAudience(w, result as TrendingAudienceResult);
    case "recommend_initial_budget_split":
      return renderBudgetSplit(w, result as InitialBudgetSplitResult);
    case "get_trend_analysis":
      return renderTrend(w, result as TrendAnalysisResult | TrendAnalysisInsufficientData);
    case "get_comparative_analysis":
      return renderComparative(w, result as ComparativeAnalysisResult);
    case "detect_anomalies":
      return renderAnomalies(w, result as AnomalyDetectionResult | AnomalyDetectionInsufficientData);
    case "detect_creative_fatigue":
      return renderFatigue(w, result as CreativeFatigueResult);
    case "get_pacing_status":
      return renderPacing(w, result as PacingResult);
    case "recommend_budget_reallocation":
      return renderReallocation(w, result as BudgetReallocationResult);
    case "suggest_audience_expansion":
      return renderAudienceExpansion(w, result as AudienceExpansionResult);
  }
}

function addPageFooters(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Campaign Intelligence Assistant", 40, height - 20);
    doc.text(`Page ${i} of ${pageCount}`, width - 100, height - 20);
  }
}

export interface GenerateReportOptions {
  /** Null for a turn with no single-campaign focus (e.g. a bare "list my tickets" reply). */
  campaignId: string | null;
  toolResults: ToolResult[];
  /** The assistant's chat reply for this turn, included as a short summary up top. */
  summary?: string;
}

/**
 * Builds a PDF from data already gathered in the current conversation (no LLM/tool re-run) and
 * triggers a browser download. Mirrors the section order /api/chat's system prompt uses for a
 * full live-campaign analysis, so the PDF reads the same way the dashboard does.
 */
export function generateCampaignReportPdf({ campaignId, toolResults, summary }: GenerateReportOptions): void {
  const w = new ReportWriter();
  const generatedAt = new Date();

  w.doc.setFont("helvetica", "bold");
  w.doc.setFontSize(20);
  w.doc.setTextColor(15, 118, 110);
  w.doc.text("Campaign Intelligence Report", w.margin, w.y + 8);
  w.y += 30;

  w.doc.setFont("helvetica", "normal");
  w.doc.setFontSize(10);
  w.doc.setTextColor(90, 90, 90);
  w.doc.text(campaignId ? `Campaign #${campaignId}` : "All Tracked Campaigns", w.margin, w.y);
  w.y += 14;
  w.doc.text(`Generated ${generatedAt.toLocaleString("en-US")}`, w.margin, w.y);
  w.y += 20;
  w.doc.setDrawColor(200, 200, 200);
  w.doc.line(w.margin, w.y, w.pageWidth - w.margin, w.y);
  w.y += 22;

  if (summary && summary.trim()) {
    w.h3("Assistant Summary");
    w.body(summary.trim());
    w.spacer(8);
  }

  const byName = new Map(toolResults.map((tr) => [tr.name, tr] as const));
  let sectionsRendered = 0;

  for (const name of TOOL_DISPLAY_ORDER) {
    const tr = byName.get(name);
    if (!tr || tr.result === null || tr.result === undefined || isErrorResult(tr.result)) continue;
    renderSection(w, name, tr.result);
    sectionsRendered += 1;
  }

  if (sectionsRendered === 0) {
    w.body("No analysis results were available to include in this report.");
  }

  addPageFooters(w.doc);

  const idSlug = campaignId ? `campaign-${campaignId}` : "campaigns";
  const dateStamp = generatedAt.toISOString().slice(0, 10);
  w.doc.save(`${idSlug}-report-${dateStamp}.pdf`);
}
