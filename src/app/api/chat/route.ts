import { NextRequest, NextResponse } from "next/server";
import { getCampaignPerformance, listTicketsWithStatus } from "@/lib/campaign-service";
import { getTrendingAudience } from "@/lib/audience-service";
import { recommendBudgetReallocation, recommendInitialBudgetSplit } from "@/lib/budget-recommendation";
import { detectAnomalies } from "@/lib/anomaly-detection";
import { detectCreativeFatigue } from "@/lib/creative-fatigue";
import { getPacingStatus } from "@/lib/pacing";
import { getComparativeAnalysis } from "@/lib/comparative-analysis";
import { getTrendAnalysis, TrendAnalysisPeriod } from "@/lib/trend-analysis";
import { suggestAudienceExpansion } from "@/lib/audience-expansion";
import { formatDate, MOCK_TODAY } from "@/lib/mock-data/mock-clock";

export const runtime = "nodejs";

const MODEL = "llama-3.3-70b-versatile";
const MAX_TOOL_ITERATIONS = 10;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are the Campaign Intelligence Assistant, an AI advisor for cross-platform
ad campaigns running on Meta, LinkedIn, Google Ads, Taboola, and StackAdapt.

Today's date is ${formatDate(MOCK_TODAY)}. Use it to resolve any relative date/period language
the user gives you (e.g. "this month vs last month", "the week of May 5th") into explicit
YYYY-MM-DD date ranges when calling get_trend_analysis.

Campaign metadata -- budget, flight dates, objective, and goal -- lives in a ticketing system,
not the performance sheet. "new" means the flight hasn't started delivering yet and there's no
performance data; "live" means it's actively running and has performance data available via the
analysis tools below.

When the user asks to browse/see campaigns generally (e.g. "show me my tickets", "which campaigns
do I have"), call list_tickets and present them grouped by status (new vs. live), including
Campaign ID, name, objective, and platforms.

When the user instead names a SPECIFIC Campaign ID (e.g. "Analyze campaign #10101.", "Give me
trending audience signals and an initial budget split for campaign #10118.") -- this is the most
common entry point, sent by a button in the UI -- do NOT call list_tickets first. Go straight to
get_campaign_performance for that ID: success means it's live, so continue immediately into the
live-ticket flow below in the SAME turn; a "no performance data" error means it's new, so continue
immediately into the new-ticket (cold-start) flow below, also in the same turn. Either way, never
stop after just checking status -- always proceed straight into the matching analysis flow without
waiting for another user message.

For a NEW ticket (not yet live), there is no performance history, so the flow is a cold-start
recommendation, not analysis:
1. Call get_trending_audience to surface Google Trends data (and Meta Audience Insights if Meta
   is one of the platforms) as context for what the target audience currently responds to.
2. Call recommend_initial_budget_split for a starting-point budget split across the ticket's
   platforms, based on its objective/goal type -- NOT this campaign's own data, since none exists.
   Be explicit that this is a pre-launch estimate to revisit once live data comes in.
3. Stop there -- don't attempt anomaly detection, pacing, or fatigue checks on a campaign with
   no performance data.

For a LIVE ticket, do full analysis, roughly in this order (skip steps that aren't relevant to
what the user actually asked, but default to this order when the user wants a general check-in):
1. get_campaign_performance -- raw spend/impressions/clicks/CTR/CPM/Frequency/video-engagement
   data by platform and combined. No interpretation yet, just the numbers.
2. get_trend_analysis -- this week vs. last week by default (or whatever period the user asks
   for), as a compact before/after comparison. This shows the shift; it doesn't explain it.
3. get_comparative_analysis -- the "moat" view: this campaign vs. peer campaigns on the same
   platform, AND this platform vs. the other platforms this same Campaign ID runs on. The
   cross-platform axis is the differentiator (only possible because data spans platforms) --
   call it out distinctly when it appears.
4. detect_anomalies -- overspend/underspend/CPM-spike/CTR-drop vs. each platform's own trailing
   7-day average. Pay special attention to any crossPlatformFindings -- a finding on one
   platform followed by a related shift on another platform for the SAME Campaign ID is a
   cross-platform-only insight worth calling out explicitly and distinctly; it's the moment
   that should land hardest, so don't bury it in a list with everything else.
5. detect_creative_fatigue -- Frequency saturation combined with CTR or video-engagement-rate
   decline. If Frequency is high/climbing, recommend audience expansion or slowing delivery, not
   just a creative refresh; if Frequency is fine but engagement is declining, recommend a
   creative refresh with concrete specifics (hook variations, format/angle diversification).
6. get_pacing_status -- vs. the ticket's flight dates, budget, and goal.
7. recommend_budget_reallocation -- specific dollar shifts across the platforms this campaign
   runs on, based on actual efficiency (never zero out a platform).
8. If the campaign is off-pace or under target vs. its goal, also call suggest_audience_expansion
   for new targeting angles from trending audience data -- not just "increase budget."

Close a full live-campaign analysis with a short, ranked list of the top 2-3 actions to take,
not an equal-weight recap of every tool's output.

If asked for something you don't have a tool for, say so plainly instead of guessing.

Every result you gather is already rendered to the user as a visual card or dashboard (tables,
charts, badges) before your reply appears. Do NOT restate that data in prose -- no re-listing
campaign tables, no repeating every metric already shown in a chart. Your reply should be a
short interpretive summary (2-4 sentences) or a ranked action list, not a recap. Never mention
internal tool or function names (e.g. "get_trend_analysis", "detect_anomalies", "list_tickets")
or quote raw JSON field names (e.g. "crossPlatformFindings") -- describe findings in plain
language a marketer would use instead.`;

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "list_tickets",
    description:
      "Lists every campaign ticket with its derived status (new = not yet live, no performance data; live = actively running), objective, goal, vertical, and platforms.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_campaign_performance",
    description:
      "Gets aggregated performance data (spend, impressions, clicks, CTR, CPM, Frequency, video engagement metric) for a live campaign, broken out by platform and combined. Only returns data for live campaigns.",
    parameters: {
      type: "object",
      properties: {
        campaignId: {
          type: "string",
          description: 'The Campaign ID to look up, e.g. "10101".',
        },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "get_trending_audience",
    description:
      "Gets trending audience signals for a ticket's target audience: Google Trends interest-over-time and related queries, plus Meta Audience Insights (mocked) when Meta is one of the campaign's platforms. Used for new/pre-launch tickets, but works for any ticket.",
    parameters: {
      type: "object",
      properties: {
        campaignId: {
          type: "string",
          description: 'The Campaign ID to look up, e.g. "10118".',
        },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "recommend_initial_budget_split",
    description:
      "Cold-start budget recommendation for a NEW (not-yet-live) ticket -- no performance history involved. Splits the ticket's overall budget across its platforms based on objective/goal type and platform benchmarks, clearly labeled as a pre-launch estimate.",
    parameters: {
      type: "object",
      properties: {
        campaignId: {
          type: "string",
          description: 'The Campaign ID to look up, e.g. "10118".',
        },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "get_trend_analysis",
    description:
      "Period-over-period comparison for a live campaign: this campaign vs. itself over time (not vs. peers/other platforms -- that's get_comparative_analysis). Defaults to trailing 7 days vs. the 7 days before that. Pass an explicit period (resolved from the user's natural-language request using today's date) for any other comparison window.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: 'The Campaign ID to look up, e.g. "10101".' },
        period: {
          type: "object",
          description: "Optional. Omit to default to trailing 7 days vs. the prior 7 days.",
          properties: {
            currentStart: { type: "string", description: "YYYY-MM-DD start of the more recent period." },
            currentEnd: { type: "string", description: "YYYY-MM-DD end of the more recent period." },
            priorStart: { type: "string", description: "YYYY-MM-DD start of the prior/comparison period." },
            priorEnd: { type: "string", description: "YYYY-MM-DD end of the prior/comparison period." },
          },
          required: ["currentStart", "currentEnd", "priorStart", "priorEnd"],
        },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "get_comparative_analysis",
    description:
      "The 'moat' comparison for a live campaign: this campaign vs. peer campaigns on the same platform, and this platform vs. the other platforms this same Campaign ID runs on (the cross-platform differentiator).",
    parameters: {
      type: "object",
      properties: { campaignId: { type: "string", description: 'The Campaign ID to look up, e.g. "10101".' } },
      required: ["campaignId"],
    },
  },
  {
    name: "detect_anomalies",
    description:
      "Live campaigns only. Flags overspend, underspend, CPM spikes, and CTR drops per platform vs. that platform's own trailing 7-day average, and merges findings on two different platforms within 1-5 days of each other into a cross-platform-correlated finding.",
    parameters: {
      type: "object",
      properties: { campaignId: { type: "string", description: 'The Campaign ID to look up, e.g. "10101".' } },
      required: ["campaignId"],
    },
  },
  {
    name: "detect_creative_fatigue",
    description:
      "Live campaigns only. Detects creative fatigue via Frequency saturation combined with CTR (static/carousel) or video-engagement-rate (video) decline, auto-classifying each platform's creative type from the data. Returns concrete, campaign-grounded recommendations with each finding.",
    parameters: {
      type: "object",
      properties: { campaignId: { type: "string", description: 'The Campaign ID to look up, e.g. "10101".' } },
      required: ["campaignId"],
    },
  },
  {
    name: "get_pacing_status",
    description:
      "Live campaigns only. Compares actual spend and goal-metric progress (impressions for awareness goals, clicks as a page-view proxy for PV goals) against the ticket's flight dates and budget, pro-rated for days elapsed.",
    parameters: {
      type: "object",
      properties: { campaignId: { type: "string", description: 'The Campaign ID to look up, e.g. "10101".' } },
      required: ["campaignId"],
    },
  },
  {
    name: "recommend_budget_reallocation",
    description:
      "Live campaigns only. Ranks this campaign's platforms by the efficiency metric appropriate to its goal type (CPM, cost-per-click, or cost-per-video-view) and recommends shifting 15-20% of the weakest platform's daily spend to the strongest, with dollar amounts. Never recommends zeroing out a platform.",
    parameters: {
      type: "object",
      properties: { campaignId: { type: "string", description: 'The Campaign ID to look up, e.g. "10101".' } },
      required: ["campaignId"],
    },
  },
  {
    name: "suggest_audience_expansion",
    description:
      "Live campaigns only, for campaigns that are off-pace or underperforming vs. their goal. Surfaces trending audience signals (Google Trends + Meta Audience Insights if applicable) as new targeting/creative angles, not just a budget increase.",
    parameters: {
      type: "object",
      properties: { campaignId: { type: "string", description: 'The Campaign ID to look up, e.g. "10101".' } },
      required: ["campaignId"],
    },
  },
];

/**
 * Human-readable labels used when injecting tool results back into the conversation, so the
 * model never sees (and can't echo back) a raw snake_case function name like "get_trend_analysis".
 */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  list_tickets: "Campaign tickets",
  get_campaign_performance: "Performance data",
  get_trending_audience: "Trending audience signals",
  recommend_initial_budget_split: "Initial budget split",
  get_trend_analysis: "Trend comparison",
  get_comparative_analysis: "Comparative (peer & cross-platform) analysis",
  detect_anomalies: "Anomaly check",
  detect_creative_fatigue: "Creative fatigue check",
  get_pacing_status: "Pacing status",
  recommend_budget_reallocation: "Budget reallocation recommendation",
  suggest_audience_expansion: "Audience expansion suggestions",
};

async function executeTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    switch (name) {
      case "list_tickets": {
        const tickets = await listTicketsWithStatus();
        return { output: tickets };
      }
      case "get_campaign_performance": {
        const campaignId = String(args.campaignId ?? "");
        const performance = await getCampaignPerformance(campaignId);
        if (!performance) {
          return {
            output: {
              error: `No performance data for Campaign ID ${campaignId}. It's likely a new/pre-launch ticket with no live sheet rows yet.`,
            },
          };
        }
        // rowsByPlatform is raw daily data other tools use internally -- it's not needed by the
        // model (which only sees the aggregated summary/combined fields) and is by far the
        // largest field returned here, so drop it before sending it back through the tool loop.
        const { rowsByPlatform: _rowsByPlatform, ...summary } = performance;
        return { output: summary };
      }
      case "get_trending_audience": {
        const campaignId = String(args.campaignId ?? "");
        const audience = await getTrendingAudience(campaignId);
        if (!audience) {
          return { output: { error: `No ticket found for Campaign ID ${campaignId}.` } };
        }
        return { output: audience };
      }
      case "recommend_initial_budget_split": {
        const campaignId = String(args.campaignId ?? "");
        const split = await recommendInitialBudgetSplit(campaignId);
        if (!split) {
          return { output: { error: `No ticket found for Campaign ID ${campaignId}.` } };
        }
        return { output: split };
      }
      case "get_trend_analysis": {
        const campaignId = String(args.campaignId ?? "");
        const period = args.period as TrendAnalysisPeriod | undefined;
        const trend = await getTrendAnalysis(campaignId, period);
        if (!trend) {
          return { output: { error: `No performance data for Campaign ID ${campaignId}.` } };
        }
        return { output: trend };
      }
      case "get_comparative_analysis": {
        const campaignId = String(args.campaignId ?? "");
        const comparison = await getComparativeAnalysis(campaignId);
        if (!comparison) {
          return { output: { error: `No performance data for Campaign ID ${campaignId}.` } };
        }
        return { output: comparison };
      }
      case "detect_anomalies": {
        const campaignId = String(args.campaignId ?? "");
        const anomalies = await detectAnomalies(campaignId);
        if (!anomalies) {
          return { output: { error: `No performance data for Campaign ID ${campaignId}.` } };
        }
        return { output: anomalies };
      }
      case "detect_creative_fatigue": {
        const campaignId = String(args.campaignId ?? "");
        const fatigue = await detectCreativeFatigue(campaignId);
        if (!fatigue) {
          return { output: { error: `No performance data for Campaign ID ${campaignId}.` } };
        }
        return { output: fatigue };
      }
      case "get_pacing_status": {
        const campaignId = String(args.campaignId ?? "");
        const pacing = await getPacingStatus(campaignId);
        if (!pacing) {
          return { output: { error: `No ticket/performance data for Campaign ID ${campaignId}.` } };
        }
        return { output: pacing };
      }
      case "recommend_budget_reallocation": {
        const campaignId = String(args.campaignId ?? "");
        const reallocation = await recommendBudgetReallocation(campaignId);
        if (!reallocation) {
          return { output: { error: `No ticket/performance data for Campaign ID ${campaignId}.` } };
        }
        return { output: reallocation };
      }
      case "suggest_audience_expansion": {
        const campaignId = String(args.campaignId ?? "");
        const expansion = await suggestAudienceExpansion(campaignId);
        if (!expansion) {
          return { output: { error: `No ticket/performance data for Campaign ID ${campaignId}.` } };
        }
        return { output: expansion };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool execution failed." };
  }
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function buildFallbackResponse(reason: string) {
  return NextResponse.json(
    {
      message: `I couldn't reach Groq right now (${reason}). Please verify the server configuration or try again shortly.`,
      fallback: true,
      toolResults: [],
    },
    { status: 200 }
  );
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

function buildSystemPrompt(): string {
  const toolJson = TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  return `${SYSTEM_PROMPT}

When you need to call a tool, format it as valid JSON on its own line like this:
<TOOL_CALL>
{"name": "tool_name", "args": {"param": "value"}}
</TOOL_CALL>

Available tools:
${JSON.stringify(toolJson, null, 2)}

Always use these tools when needed to gather data before responding.`;
}

function parseToolCalls(text: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];
  const regex = /<TOOL_CALL>\n?([\s\S]*?)\n?<\/TOOL_CALL>/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name && parsed.args) {
        toolCalls.push(parsed);
      }
    } catch (e) {
      console.error("Failed to parse tool call:", match[1], e);
    }
  }

  return toolCalls;
}

function removeToolCallsFromText(text: string): string {
  return text.replace(/<TOOL_CALL>\n?([\s\S]*?)\n?<\/TOOL_CALL>/g, "").trim();
}

async function callGroqWithRetry(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  system: string,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[Groq API] Attempt ${attempt + 1}/${maxRetries} for model: ${model}`);

      const payload = {
        model,
        messages: [{ role: "system", content: system }, ...messages],
        max_tokens: 2048,
      };

      const response = await Promise.race([
        fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout after 30s")), 30000)
        ),
      ]);

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Groq API error ${response.status}: ${errorText}`);
        (error as Error & { status?: number }).status = response.status;
        throw error;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const text = data.choices?.[0]?.message?.content ?? "";
      console.log("[Groq API] Success");
      return text;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Groq API] Attempt ${attempt + 1} failed:`, errorMsg);

      if (attempt < maxRetries - 1) {
        // Groq's 429s report an exact "please try again in Xs" -- a fixed exponential
        // backoff (capped at 10s) almost never waits long enough to clear a TPM rate limit,
        // so honor the hint when present instead of guessing.
        const status = (err as Error & { status?: number }).status;
        const retryHintMatch = errorMsg.match(/try again in ([\d.]+)s/i);
        const waitTime =
          status === 429 && retryHintMatch
            ? Math.min(Math.ceil(parseFloat(retryHintMatch[1]) * 1000) + 500, 45000)
            : Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`[Groq API] Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        throw err;
      }
    }
  }

  throw new Error("Max retries exceeded");
}


export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return buildFallbackResponse("GROQ_API_KEY is not configured on the server");
  }

  console.log("[Groq Auth] API key found, length:", apiKey.length);

  let messages: ChatMessage[];
  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages)) throw new Error("messages must be an array");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  console.log("[Groq Client] Initialized for model:", MODEL);

  const toolCallLog: { name: string; args: unknown; result: unknown }[] = [];

  try {
    let finalText = "";
    const conversationMessages = [
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      console.log(`[Tool Loop] Iteration ${i + 1}/${MAX_TOOL_ITERATIONS}`);
      
      const assistantMessage = await callGroqWithRetry(
        apiKey,
        MODEL,
        conversationMessages,
        buildSystemPrompt()
      );

      const toolCalls = parseToolCalls(assistantMessage);
      console.log(`[Tool Parse] Found ${toolCalls.length} tool calls`);

      if (toolCalls.length === 0) {
        finalText = removeToolCallsFromText(assistantMessage);
        console.log("[Tool Loop] No tool calls, breaking");
        break;
      }

      conversationMessages.push({
        role: "assistant",
        content: assistantMessage,
      });

      const toolResults: string[] = [];

      for (const toolCall of toolCalls) {
        const result = await executeTool(toolCall.name, toolCall.args);
        const output = "output" in result ? result.output : result;
        toolCallLog.push({ name: toolCall.name, args: toolCall.args, result: output });
        const label = TOOL_DISPLAY_NAMES[toolCall.name] ?? toolCall.name;
        toolResults.push(`${label}:\n${JSON.stringify(output)}`);
      }

      conversationMessages.push({
        role: "user",
        content: `Tool results:\n${toolResults.join("\n\n")}`,
      });
    }

    if (!finalText) {
      finalText =
        "I wasn't able to finish that request after several tool calls -- try rephrasing or asking about one campaign at a time.";
    }

    return NextResponse.json({ message: finalText, toolResults: toolCallLog });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorString = JSON.stringify(err, Object.getOwnPropertyNames(err));
    
    console.error("[Groq Error] Exception occurred:");
    console.error("[Groq Error] Message:", errorMessage);
    console.error("[Groq Error] Full:", errorString);

    let userFriendlyMessage = "I couldn't reach Groq right now. ";

    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
      userFriendlyMessage += "Your GROQ_API_KEY is invalid or expired.";
    } else if (errorMessage.includes("429") || errorMessage.includes("rate")) {
      userFriendlyMessage += "Rate limited - wait a moment and try again.";
    } else if (errorMessage.includes("Model not found")) {
      userFriendlyMessage += `Model "${MODEL}" is not available for your API configuration.`;
    } else if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
      userFriendlyMessage += "Request timed out. Try again in 30 seconds.";
    } else if (errorMessage.includes("fetch") || errorMessage.includes("ECONNREFUSED")) {
      userFriendlyMessage += "Network error - check your internet connection and firewall.";
    } else {
      userFriendlyMessage += errorMessage;
    }

    return buildFallbackResponse(userFriendlyMessage);
  }
}
