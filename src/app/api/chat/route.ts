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

// Primary provider -- tried first when configured.
const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// llama-3.3-70b-versatile was retired from Groq's catalog (confirmed via GET /v1/models -- no
// longer listed) and started 404ing outright. gpt-oss-120b is Groq-hosted, verified against a
// live tool-calling request (returns proper tool_calls, not just plain text) -- also the fastest
// of the tool-calling-capable candidates tried. Note this free-tier key's token-per-minute cap
// (8000 TPM) is an account-wide limit that's identical across every model on it, confirmed via
// the x-ratelimit-* response headers -- swapping models here won't buy more headroom for a
// multi-tool conversation; only a paid tier or a funded OPENAI_API_KEY will.
const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Free-tier fallback for when Groq's per-minute/per-day quota is exhausted.
// OpenRouter is also an OpenAI-compatible chat-completions API, so it reuses the same call path.
// nemotron-nano-9b-v2:free was pulled from OpenRouter's catalog ("No endpoints found"). Picked a
// different model family than the NVIDIA NIM fallback below on purpose, so one vendor retiring a
// model doesn't take out two links of the chain at once; verified with a live tool-calling call.
const OPENROUTER_MODEL = "minimax/minimax-m3:free";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Second fallback, tried when both Groq and OpenRouter are exhausted. NVIDIA's own NIM API
// (build.nvidia.com) has a quota entirely separate from OpenRouter's account-wide free-tier cap,
// so it gives genuine extra headroom rather than sharing an already-exhausted pool.
// meta/llama-3.1-70b-instruct hit its documented end-of-life (410 Gone). Replaced with a model
// confirmed both present in GET /v1/models and working against a live tool-calling request.
const NVIDIA_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const MAX_TOOL_ITERATIONS = 10;

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
common entry point, sent by a button in the UI -- do NOT call list_tickets first, and first work
out whether the ask is general or narrow:

- GENERAL / open-ended (e.g. "Analyze campaign #10101.", "How's campaign #10101 doing?", the
  button-triggered full-analysis request, no specific question attached): go straight to
  get_campaign_performance for that ID: success means it's live, so continue immediately into the
  full live-ticket flow below in the SAME turn; a "no performance data" error means it's new, so
  continue immediately into the new-ticket (cold-start) flow below, also in the same turn. Never
  stop after just checking status -- always proceed straight into the matching flow without
  waiting for another user message.

- NARROW / specific (e.g. "What's the pacing on #10101?", "Any anomalies on #10118?", "Check
  creative fatigue for #10101", "What's the CTR on #10101?"): call ONLY the one or two tools that
  specific question actually needs -- never the full 8-step flow just because a Campaign ID was
  named. Do not call get_campaign_performance first "to check status" -- every analysis tool
  already handles a not-yet-live campaign on its own (it returns a clear "no data" result you can
  relay directly), so a separate status check first is a wasted extra round trip. Example: "what's
  the pacing on #10101" -> call get_pacing_status alone, nothing else, then answer.

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

The 8-step flow above is for a genuinely fresh look at a live campaign -- the first time in this
conversation you're asked about it, or when the user explicitly wants a general check-in (e.g.
"how's campaign #X doing", "give me a full analysis"). It is NOT the default for every message
after that. Once you've already gathered a campaign's data earlier in THIS conversation, do not
call the same tool again to answer a follow-up about that same campaign -- reuse the results
already in the conversation instead of re-fetching them. A narrow follow-up ("give me actions to
take", "what should I do next", "just the pacing", "any anomalies on this one?") should be
answered either straight from data you already have (zero tool calls), or with at most the one or
two tools that specific question actually needs -- never by re-running the full flow. "Give me
actions to take" specifically means: re-rank/restate the top actions (with their impact levels,
same as below) from what you already know about this campaign -- call no tools at all if you
already analyzed it earlier in this conversation.

If a ticket's dataGranularity (from list_tickets) is "aggregate" (a campaign created by uploading
a raw platform export rather than daily sheet data), skip get_trend_analysis and detect_anomalies
entirely -- they need day-by-day history this campaign doesn't have, and calling them just wastes
a round trip before they report back that there's not enough daily data. Still run
get_campaign_performance, get_comparative_analysis, get_pacing_status, and
recommend_budget_reallocation as normal -- those work fine on whole-period totals. Treat any
detect_creative_fatigue findings as best-effort/likely sparse for an aggregate campaign, not a
sign the campaign has no creative fatigue issues.

Close a full live-campaign analysis with a short list of the top 2-3 actions to take, ordered by
expected impact (highest first) and each one labeled with an impact level -- High, Medium, or Low
-- based on the size of the underlying finding: a large pacing shortfall, a high-confidence
cross-platform anomaly, or a budget shift with a meaningful efficiency gap is High; a minor
optimization with a small dollar/percentage effect is Low. Tell the user which action is most
worth doing first and briefly why, not an equal-weight recap of every tool's output.

If asked for something you don't have a tool for, say so plainly instead of guessing.

Never narrate about system performance -- don't mention timeouts, slow responses, retries, or
that a reply "didn't finish" or "got cut off," even if an earlier message in this conversation
reads that way. If a prior turn's content looks partial or incomplete, that's not something to
comment on or apologize for -- just answer the current question directly from whatever data is
actually present in the conversation, the same as you would for any other message.

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
      "Gets trending audience signals for a ticket's target audience: Google Trends interest-over-time and related queries, plus Meta interest-targeting audience-size data when Meta is one of the campaign's platforms. Used for new/pre-launch tickets, but works for any ticket.",
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

/** Converts our internal tool definitions into the native OpenAI-style `tools` request param. */
function buildToolsParam() {
  return TOOL_DEFINITIONS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

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

/** A single native tool call the model requested, as returned in `message.tool_calls[]`. */
interface AssistantToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** The assistant/tool turns the tool loop accumulates, in the native OpenAI tool-calling shape. */
type ConversationMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: AssistantToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

function buildFallbackResponse(reason: string) {
  return NextResponse.json(
    {
      message: `I couldn't reach an AI provider right now (${reason}). Please verify the server configuration or try again shortly.`,
      fallback: true,
      toolResults: [],
    },
    { status: 200 }
  );
}

interface LLMProvider {
  name: string;
  url: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
}

interface AssistantTurn {
  content: string | null;
  tool_calls?: AssistantToolCall[];
}

async function callChatCompletionsWithRetry(
  provider: LLMProvider,
  messages: ConversationMessage[],
  system: string,
  tools: ReturnType<typeof buildToolsParam>,
  deadlineAt: number,
  maxRetries: number = 3
): Promise<AssistantTurn> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Serverless hosts (Netlify, etc.) kill the whole function at a hard wall-clock limit,
    // returning a bare 502 to the client instead of letting us respond gracefully. Bound every
    // attempt to whatever's left of the request's own deadline (recomputed fresh each attempt,
    // so retries can't each claim a full budget and blow past it), not a fixed constant, so we
    // always return our own JSON fallback before the platform pulls the plug.
    const attemptTimeoutMs = Math.max(500, Math.min(15000, deadlineAt - Date.now()));
    try {
      console.log(`[${provider.name}] Attempt ${attempt + 1}/${maxRetries} for model: ${provider.model}`);

      const payload = {
        model: provider.model,
        messages: [{ role: "system", content: system }, ...messages],
        tools,
        max_tokens: 2048,
      };

      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
          ...provider.extraHeaders,
        },
        body: JSON.stringify(payload),
        // AbortSignal actually cancels the underlying request (unlike racing a setTimeout
        // promise, which just abandons it while it keeps running server-side) -- and it's the
        // only variant that reliably cut off a hanging fetch under this Next.js dev runtime.
        signal: AbortSignal.timeout(attemptTimeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`${provider.name} API error ${response.status}: ${errorText}`);
        (error as Error & { status?: number }).status = response.status;
        throw error;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: AssistantToolCall[] } }>;
      };

      const message = data.choices?.[0]?.message;
      console.log(`[${provider.name}] Success`);
      return { content: message?.content ?? null, tool_calls: message?.tool_calls };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const status = (err as Error & { status?: number }).status;
      console.error(`[${provider.name}] Attempt ${attempt + 1} failed:`, errorMsg);

      // Serverless functions run under a hard execution timeout (Netlify kills the invocation
      // outright, surfacing as a 502 to the client, not our graceful fallback JSON). A 429's
      // retry hint can be tens of seconds -- far longer than that budget -- so never block-and-
      // retry the SAME provider on a rate limit (this also covers OpenAI's insufficient_quota,
      // which comes back as a 429 and won't resolve itself no matter how long we wait). Fail
      // over to the next provider immediately instead; that's what the fallback chain is for.
      if (status === 429) {
        console.log(`[${provider.name}] Rate limited/quota exceeded -- skipping retries, failing over.`);
        throw err;
      }

      // Same logic for a timeout: retrying the SAME provider that just proved too slow burns
      // budget for no benefit -- fail over immediately instead.
      if (err instanceof Error && err.name === "TimeoutError") {
        console.log(`[${provider.name}] Timed out -- skipping retries, failing over.`);
        throw err;
      }

      if (attempt < maxRetries - 1) {
        // Non-429 errors (network blips, 5xx) get a short, capped backoff -- long enough to
        // smooth over a transient failure, short enough to stay well inside the function timeout.
        const waitTime = Math.min(500 * Math.pow(2, attempt), 2000);
        console.log(`[${provider.name}] Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        throw err;
      }
    }
  }

  throw new Error(`${provider.name}: max retries exceeded`);
}

// Module-level, so it persists across requests on a warm server instance (best-effort on
// serverless -- free when a warm instance handles the next request, harmless when a cold start
// resets it). A provider that fails with a 429 (rate limit/quota) is skipped for this cooldown
// window instead of being retried on the very next call, whether that's the next tool-loop
// iteration of the same request or the next request entirely. Without this, a provider that's
// out of quota for any reason -- a persistently dead key (e.g. OpenAI until billing is topped up)
// or a free-tier per-minute cap that just tripped (e.g. Groq's account-wide TPM limit) -- wastes
// a full round trip on every single call, indefinitely, starving whichever provider would have
// actually worked of time and (on Groq) of its own shared token budget. 60s is short enough that
// a per-minute rate-limit window has usually reset by the time it's tried again, long enough that
// a dead key doesn't get retried on every request in a fast back-to-back demo session.
const PROVIDER_COOLDOWN_MS = 60_000;
const providerCooldownUntil = new Map<string, number>();

/** Tries each provider in order, falling over to the next one only once the current one's own retries are exhausted. */
async function callLLMWithFallback(
  providers: LLMProvider[],
  messages: ConversationMessage[],
  system: string,
  tools: ReturnType<typeof buildToolsParam>,
  deadlineAt: number
): Promise<AssistantTurn & { provider: string }> {
  let lastError: unknown;
  for (const provider of providers) {
    const cooldownUntil = providerCooldownUntil.get(provider.name);
    if (cooldownUntil && Date.now() < cooldownUntil) continue;
    if (deadlineAt - Date.now() <= 500) {
      lastError = new Error("Request deadline exceeded before all providers could be tried.");
      break;
    }
    try {
      const turn = await callChatCompletionsWithRetry(provider, messages, system, tools, deadlineAt);
      providerCooldownUntil.delete(provider.name);
      return { ...turn, provider: provider.name };
    } catch (err) {
      lastError = err;
      console.error(`[LLM Fallback] ${provider.name} failed.`, err instanceof Error ? err.message : err);
      if ((err as Error & { status?: number }).status === 429) {
        providerCooldownUntil.set(provider.name, Date.now() + PROVIDER_COOLDOWN_MS);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All configured LLM providers failed");
}

/**
 * The client only persists each assistant turn's final text `content` across requests (see
 * page.tsx's sendChatMessage -- it strips toolResults before POSTing), never the raw tool_calls/
 * tool messages. So when a request times out before the model ever produces its own synthesis,
 * the bare "here's what I found" apology below used to be ALL that survived into the next turn's
 * conversation history -- meaning a follow-up like "give me actions to take" had zero real data
 * to work from, even though the tool calls genuinely succeeded and are visible in the dashboard.
 * This builds a compact, deterministic (no extra LLM call -- there's no time budget left for one)
 * recap straight from the already-fetched results, reusing the human-readable strings each
 * analysis module already produces (recommendation/reason/summary/description fields), so real
 * findings persist into the conversation instead of being silently dropped.
 */
function buildFallbackRecap(toolCallLog: { name: string; args: unknown; result: unknown }[]): string {
  const lines: string[] = [];

  for (const { name, result } of toolCallLog) {
    if (!result || typeof result !== "object" || "error" in (result as object)) continue;
    const r = result as Record<string, unknown>;

    switch (name) {
      case "get_campaign_performance": {
        const c = r.combined as Record<string, number | null> | undefined;
        if (c && typeof c.spend === "number") {
          lines.push(
            `Performance: $${Math.round(c.spend).toLocaleString("en-US")} spend, ` +
              `${(c.ctr as number).toFixed(2)}% CTR, $${(c.cpm as number).toFixed(2)} CPM.`
          );
        }
        break;
      }
      case "get_pacing_status": {
        if (typeof r.spendPacingDetail === "string") lines.push(r.spendPacingDetail);
        if (typeof r.goalPacingDetail === "string") lines.push(r.goalPacingDetail);
        break;
      }
      case "recommend_budget_reallocation": {
        if (r.applicable && typeof r.recommendation === "string") lines.push(r.recommendation);
        break;
      }
      case "detect_anomalies": {
        const cross = r.crossPlatformFindings as Array<{ description: string }> | undefined;
        const findings = r.findings as Array<{ description: string }> | undefined;
        if (cross && cross.length > 0) lines.push(cross[0].description);
        else if (findings && findings.length > 0) lines.push(findings[0].description);
        break;
      }
      case "detect_creative_fatigue": {
        const findings = r.findings as Array<{ summary: string }> | undefined;
        if (findings && findings.length > 0) lines.push(findings[0].summary);
        break;
      }
      case "suggest_audience_expansion": {
        if (typeof r.reason === "string") lines.push(r.reason);
        break;
      }
      case "get_trend_analysis": {
        const combined = r.combined as Array<{ metric: string; direction: string; percentChange: number | null; isMeaningful: boolean }> | undefined;
        const meaningful = combined?.find((m) => m.isMeaningful);
        if (meaningful && meaningful.percentChange !== null) {
          lines.push(`Trend: ${meaningful.metric} ${meaningful.direction} ${Math.abs(meaningful.percentChange).toFixed(0)}% vs. the prior period.`);
        }
        break;
      }
      default:
        break;
    }
  }

  // Cap at 4 lines -- this is a stopgap recap, not a full report; the PDF/dashboard already show everything gathered.
  return lines.slice(0, 4).join(" ");
}

export async function POST(req: NextRequest) {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const nvidiaKey = process.env.NVIDIA_API_KEY?.trim();

  // OpenAI is tried first (paid, most capable); Groq/OpenRouter/NVIDIA are free-tier fallbacks
  // used automatically if OpenAI is unavailable, rate-limited, or out of quota.
  const providers: LLMProvider[] = [];
  if (openaiKey) {
    providers.push({ name: "OpenAI", url: OPENAI_API_URL, apiKey: openaiKey, model: OPENAI_MODEL });
  }
  if (groqKey) {
    providers.push({ name: "Groq", url: GROQ_API_URL, apiKey: groqKey, model: GROQ_MODEL });
  }
  if (openRouterKey) {
    providers.push({
      name: "OpenRouter",
      url: OPENROUTER_API_URL,
      apiKey: openRouterKey,
      model: OPENROUTER_MODEL,
      // Optional but recommended by OpenRouter for their request-attribution dashboard.
      extraHeaders: {
        "HTTP-Referer": "https://campaign-intelligence-assistant.local",
        "X-Title": "Campaign Intelligence Assistant",
      },
    });
  }
  if (nvidiaKey) {
    providers.push({ name: "NVIDIA", url: NVIDIA_API_URL, apiKey: nvidiaKey, model: NVIDIA_MODEL });
  }

  if (providers.length === 0) {
    return buildFallbackResponse(
      "None of OPENAI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, or NVIDIA_API_KEY is configured on the server"
    );
  }

  console.log(
    "[LLM Auth] Configured providers:",
    providers.map((p) => p.name).join(" -> ")
  );

  let messages: ChatMessage[];
  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages)) throw new Error("messages must be an array");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const toolCallLog: { name: string; args: unknown; result: unknown }[] = [];
  const tools = buildToolsParam();
  // Netlify's synchronous Functions have a hard ~10s execution timeout the platform enforces
  // regardless of what our own code thinks its budget is -- when it kills the function mid-
  // response, the client gets a truncated/empty body (a raw "Unexpected end of JSON input" on
  // the client, not one of our own error messages). This MUST stay well under that real limit,
  // not just under some larger assumed budget -- confirmed this was set to 20000ms (over
  // Netlify's actual limit), which meant Netlify's kill always won the race before our own
  // graceful-timeout/partial-results handling below ever got a chance to run.
  const REQUEST_DEADLINE_MS = 8000;
  const deadlineAt = Date.now() + REQUEST_DEADLINE_MS;

  try {
    let finalText = "";
    const conversationMessages: ConversationMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let hitDeadline = false;
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      if (Date.now() >= deadlineAt) {
        console.log("[Tool Loop] Request deadline reached, stopping before another LLM call.");
        hitDeadline = true;
        break;
      }

      console.log(`[Tool Loop] Iteration ${i + 1}/${MAX_TOOL_ITERATIONS}`);

      let content: string | null;
      let toolCalls: AssistantToolCall[] | undefined;
      let provider: string;
      try {
        const turn = await callLLMWithFallback(providers, conversationMessages, SYSTEM_PROMPT, tools, deadlineAt);
        content = turn.content;
        toolCalls = turn.tool_calls;
        provider = turn.provider;
      } catch (err) {
        // Every provider failed for this iteration (most likely the deadline was hit mid-call).
        // If we've already gathered real tool results, showing those beats discarding them for
        // a bare apology -- only bail to the generic total-failure message with nothing to show.
        if (toolCallLog.length === 0) throw err;
        console.log(
          "[Tool Loop] LLM call failed with partial progress already made -- returning partial results.",
          err instanceof Error ? err.message : err
        );
        hitDeadline = true;
        break;
      }
      console.log(`[Tool Loop] Served by ${provider}`);
      console.log(`[Tool Loop] Found ${toolCalls?.length ?? 0} tool calls`);

      if (!toolCalls || toolCalls.length === 0) {
        finalText = content ?? "";
        console.log("[Tool Loop] No tool calls, breaking");
        break;
      }

      conversationMessages.push({ role: "assistant", content, tool_calls: toolCalls });

      for (const toolCall of toolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch (e) {
          console.error("Failed to parse tool call arguments:", toolCall.function.arguments, e);
          args = {};
        }

        const result = await executeTool(toolCall.function.name, args);
        const output = "output" in result ? result.output : result;
        toolCallLog.push({ name: toolCall.function.name, args, result: output });

        conversationMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(output),
        });
      }
    }

    if (!finalText) {
      // Deliberately neutral/factual phrasing below, with no "timeout"/"AI slowed down"/"didn't
      // finish" framing -- that language, once it's part of this reply's persisted content, was
      // observed getting echoed and escalated by the model on later turns (e.g. "the response hit
      // a timeout... the message body wasn't completed, so I don't have a ranked action list to
      // restate" -- a hallucinated narrative in a LATER turn that never actually timed out itself,
      // clearly anchored on this text's own prior wording). Presenting whatever data exists as
      // plain fact, with no meta-commentary about system performance, gives a later turn nothing
      // to latch onto and extend.
      if (hitDeadline && toolCallLog.length > 0) {
        const recap = buildFallbackRecap(toolCallLog);
        finalText = recap
          ? `Here's what's available for this campaign so far: ${recap}`
          : "I have some initial data gathered but nothing conclusive yet -- ask about a specific aspect (e.g. pacing, budget, or anomalies) and I'll look it up directly.";
      } else if (hitDeadline) {
        finalText = "I couldn't retrieve any data just now -- try asking about one specific thing (e.g. pacing on a specific campaign) in a moment.";
      } else {
        finalText = "I wasn't able to complete that request -- try asking about one campaign or one specific aspect at a time.";
      }
    }

    return NextResponse.json({ message: finalText, toolResults: toolCallLog });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorString = JSON.stringify(err, Object.getOwnPropertyNames(err));
    const providerNames = providers.map((p) => p.name).join(" and ");

    console.error("[LLM Error] Exception occurred:");
    console.error("[LLM Error] Message:", errorMessage);
    console.error("[LLM Error] Full:", errorString);

    let userFriendlyMessage = `I couldn't reach any AI provider right now (tried ${providerNames}). `;

    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
      userFriendlyMessage += "The last provider tried reported an invalid or expired API key.";
    } else if (errorMessage.includes("insufficient_quota")) {
      userFriendlyMessage += "The last provider tried is out of quota/billing credits.";
    } else if (errorMessage.includes("429") || errorMessage.includes("rate")) {
      userFriendlyMessage += "All configured providers are currently rate limited - wait a moment and try again.";
    } else if (errorMessage.includes("Model not found")) {
      userFriendlyMessage += "The configured model is not available for that provider's API key.";
    } else if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
      userFriendlyMessage += "The request timed out. Try again in 30 seconds.";
    } else if (errorMessage.includes("fetch") || errorMessage.includes("ECONNREFUSED")) {
      userFriendlyMessage += "Network error - check your internet connection and firewall.";
    } else {
      userFriendlyMessage += errorMessage;
    }

    // NextResponse.json directly here (not via buildFallbackResponse) -- userFriendlyMessage is
    // already a complete, specific sentence; wrapping it in buildFallbackResponse's own generic
    // template would double up the "I couldn't reach..." preamble.
    return NextResponse.json({ message: userFriendlyMessage, fallback: true, toolResults: [] }, { status: 200 });
  }
}
