"use client";

import { FormEvent, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToolResult, ToolResultCard } from "@/components/cards/ToolResultCard";
import { PlatformBadge } from "@/components/cards/primitives";
import { TicketSidebar } from "@/components/dashboard/TicketSidebar";
import { ANALYSIS_TOOL_NAMES, CampaignDashboard } from "@/components/dashboard/CampaignDashboard";

const PLATFORMS = ["META", "LINKEDIN", "GOOGLE", "TABOOLA", "STACKADAPT"];

function LogoMark() {
  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-md shadow-teal-500/30 ring-1 ring-teal-500/20 dark:from-teal-300 dark:to-teal-500">
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-accent-foreground">
        <rect x="3" y="10" width="3" height="7" rx="1" fill="currentColor" opacity="0.65" />
        <rect x="8.5" y="6" width="3" height="11" rx="1" fill="currentColor" opacity="0.85" />
        <rect x="14" y="2.5" width="3" height="14.5" rx="1" fill="currentColor" />
      </svg>
      <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm ring-2 ring-white dark:bg-zinc-950 dark:ring-zinc-950">
        <svg viewBox="0 0 16 16" fill="none" className="h-2.5 w-2.5">
          <path
            d="M8 1l1.2 3.8L13 6l-3.8 1.2L8 11l-1.2-3.8L3 6l3.8-1.2L8 1z"
            fill="url(#spark-gradient)"
          />
          <defs>
            <linearGradient id="spark-gradient" x1="3" y1="1" x2="13" y2="11">
              <stop offset="0" stopColor="#2dd4bf" />
              <stop offset="1" stopColor="#0d9488" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

type Message = {
  role: "user" | "assistant";
  content: string;
  toolResults?: ToolResult[];
};

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hi, I'm your Campaign Intelligence Assistant. Ask me about your campaign tickets, and I'll pull performance data, flag anomalies, and recommend budget moves across Meta, LinkedIn, Google Ads, Taboola, and StackAdapt.",
};

const LOADING_MESSAGES = [
  "Reading campaign tickets...",
  "Pulling performance data...",
  "Analyzing trends and anomalies...",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState(LOADING_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    await sendChatMessage(trimmed);
  }

  async function sendChatMessage(trimmed: string) {
    if (!trimmed || isLoading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);
    setLoadingLabel(LOADING_MESSAGES[0]);

    const loadingTimer = setInterval(() => {
      setLoadingLabel((prev) => {
        const idx = LOADING_MESSAGES.indexOf(prev);
        return LOADING_MESSAGES[(idx + 1) % LOADING_MESSAGES.length];
      });
    }, 2500);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.map(({ role, content }) => ({ role, content })) }),
      });

      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        const text = await res.text();
        console.error("Failed to parse response as JSON. Response text:", text);
        throw new Error("Server returned invalid JSON. Check browser console for details.");
      }

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong.");
      }

      setMessages([
        ...nextMessages,
        { role: "assistant", content: data.message, toolResults: data.toolResults ?? [] },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      clearInterval(loadingTimer);
      setIsLoading(false);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  function runFullAnalysis(campaignId: string) {
    void sendChatMessage(`Analyze campaign #${campaignId}.`);
  }

  function getAudienceIdeas(campaignId: string) {
    void sendChatMessage(`Give me trending audience signals and an initial budget split for campaign #${campaignId}.`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="relative flex items-center justify-between gap-4 bg-gradient-to-r from-white via-white to-teal-50/60 px-6 py-3.5 dark:from-zinc-950 dark:via-zinc-950 dark:to-teal-950/20">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <h1 className="text-base font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
              Campaign{" "}
              <span className="bg-gradient-to-r from-teal-500 to-teal-700 bg-clip-text text-transparent dark:from-teal-300 dark:to-teal-500">
                Intelligence
              </span>{" "}
              Assistant
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Cross-platform campaign advisor</p>
          </div>
        </div>
        <div className="hidden items-center gap-1.5 md:flex">
          {PLATFORMS.map((p) => (
            <PlatformBadge key={p} platform={p} />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent dark:via-zinc-800" />
      </header>

      <div className="flex min-h-0 flex-1">
        <TicketSidebar onRunFullAnalysis={runFullAnalysis} onGetAudienceIdeas={getAudienceIdeas} disabled={isLoading} />

        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {messages.map((message, i) => (
                <ChatTurn key={i} message={message} />
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 self-start rounded-2xl bg-white px-4 py-3 text-sm text-zinc-500 shadow-sm dark:bg-zinc-900 dark:text-zinc-400">
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.2s]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.1s]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-zinc-400" />
                  <span className="ml-1">{loadingLabel}</span>
                </div>
              )}
              {error && (
                <div className="self-start rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:bg-red-950 dark:text-red-300">
                  {error}
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={sendMessage}
            className="border-t border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="mx-auto flex max-w-4xl gap-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about a campaign, e.g. 'show me my tickets'"
                className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-accent dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

type DisplayItem =
  | { type: "dashboard"; campaignId: string; results: ToolResult[] }
  | { type: "card"; result: ToolResult };

/**
 * Groups a message's tool results by campaignId (from each call's args) so a full analysis
 * (>=2 of the analysis-tool results for the same campaign) renders as one CampaignDashboard
 * instead of a stack of individual cards. Everything else (cold-start tools, ad-hoc single
 * calls, list_tickets) renders as individual cards exactly as before.
 */
function groupToolResultsForDisplay(toolResults: ToolResult[]): DisplayItem[] {
  const cards = toolResults.filter((tr) => tr.result !== null && tr.result !== undefined);
  const analysisNames = ANALYSIS_TOOL_NAMES as readonly string[];

  const byCampaign = new Map<string, ToolResult[]>();
  for (const tr of cards) {
    const campaignId = (tr.args as { campaignId?: string } | undefined)?.campaignId;
    if (!campaignId) continue;
    const group = byCampaign.get(campaignId) ?? [];
    group.push(tr);
    byCampaign.set(campaignId, group);
  }

  const dashboardCampaigns = new Set(
    Array.from(byCampaign.entries())
      .filter(([, group]) => group.filter((tr) => analysisNames.includes(tr.name)).length >= 2)
      .map(([campaignId]) => campaignId)
  );

  const items: DisplayItem[] = [];
  const renderedDashboards = new Set<string>();

  for (const tr of cards) {
    const campaignId = (tr.args as { campaignId?: string } | undefined)?.campaignId;
    if (campaignId && dashboardCampaigns.has(campaignId)) {
      if (analysisNames.includes(tr.name)) {
        if (!renderedDashboards.has(campaignId)) {
          renderedDashboards.add(campaignId);
          const results = byCampaign.get(campaignId)!.filter((g) => analysisNames.includes(g.name));
          items.push({ type: "dashboard", campaignId, results });
        }
      } else {
        items.push({ type: "card", result: tr });
      }
    } else {
      items.push({ type: "card", result: tr });
    }
  }

  return items;
}

function ChatTurn({ message }: { message: Message }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900">
          {message.content}
        </div>
      </div>
    );
  }

  const items = groupToolResultsForDisplay(message.toolResults ?? []);

  return (
    <div className="flex flex-col items-start gap-2">
      {items.map((item, i) =>
        item.type === "dashboard" ? (
          <CampaignDashboard key={i} campaignId={item.campaignId} results={item.results} />
        ) : (
          <ToolResultCard key={i} toolResult={item.result} />
        )
      )}
      <div className="max-w-[80%] rounded-2xl bg-white px-4 py-3 text-sm text-zinc-800 shadow-sm dark:bg-zinc-900 dark:text-zinc-100">
        <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
