"use client";

import { FormEvent, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isErrorResult, ToolResult, ToolResultCard } from "@/components/cards/ToolResultCard";
import { PlatformBadge } from "@/components/cards/primitives";
import { TicketSidebar } from "@/components/dashboard/TicketSidebar";
import { AttachFilesPopover } from "@/components/dashboard/AttachFilesPopover";
import { ANALYSIS_TOOL_NAMES, CampaignDashboard } from "@/components/dashboard/CampaignDashboard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PlatformKey, PLATFORM_TAB_LABEL } from "@/lib/platforms";
import { parseNumber, parseDateFlexible } from "@/lib/upload-parsers/shared";

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
  attachments?: { platform: PlatformKey; fileName: string }[];
};

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hi, I'm your Campaign Intelligence Assistant. Ask me about your campaign tickets, and I'll pull performance data, flag anomalies, and recommend budget moves across Meta, LinkedIn, Google Ads, Taboola, and StackAdapt. You can also attach platform export files (paperclip icon) to add a new campaign.",
};

const LOADING_MESSAGES = [
  "Reading campaign tickets...",
  "Pulling performance data...",
  "Analyzing trends and anomalies...",
];

/** Local, deterministic wizard for collecting the fields /api/upload needs -- not routed through the LLM. */
type UploadWizardStep = "vertical" | "objective" | "goalAmount" | "budget" | "flightStart" | "flightEnd" | "submitting";

interface UploadWizardState {
  step: UploadWizardStep;
  vertical?: string;
  goalTypeCode?: "AWR" | "PV";
  goalAmount?: number;
  overallBudget?: number;
  flightStartDate?: string;
  flightEndDate?: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState(LOADING_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [pendingFiles, setPendingFiles] = useState<Partial<Record<PlatformKey, File>>>({});
  const [showAttachPopover, setShowAttachPopover] = useState(false);
  const [uploadWizard, setUploadWizard] = useState<UploadWizardState | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [ticketRefreshToken, setTicketRefreshToken] = useState(0);

  const hasPendingFiles = Object.keys(pendingFiles).length > 0;

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();

    if (uploadWizard) {
      if (!trimmed || isUploading) return;
      setInput("");
      advanceWizard(trimmed);
      return;
    }

    if (hasPendingFiles) {
      setInput("");
      startUploadWizard(trimmed);
      return;
    }

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

  function pushUserBubble(content: string) {
    setMessages((prev) => [...prev, { role: "user", content }]);
  }

  function pushAssistantBubble(content: string) {
    setMessages((prev) => [...prev, { role: "assistant", content }]);
  }

  function removeFile(platform: PlatformKey) {
    setPendingFiles((prev) => {
      const next = { ...prev };
      delete next[platform];
      return next;
    });
  }

  function cancelUpload() {
    setUploadWizard(null);
    setPendingFiles({});
    pushAssistantBubble("Upload cancelled.");
  }

  function startUploadWizard(noteText: string) {
    const attachments = Object.entries(pendingFiles).map(([platform, file]) => ({
      platform: platform as PlatformKey,
      fileName: (file as File).name,
    }));
    setMessages((prev) => [...prev, { role: "user", content: noteText, attachments }]);
    setUploadWizard({ step: "vertical" });
    pushAssistantBubble('Got the files. What vertical is this campaign in? (e.g. "fitness apparel")');
  }

  function handleQuickReply(text: string) {
    if (isUploading) return;
    advanceWizard(text);
  }

  function advanceWizard(reply: string) {
    if (!uploadWizard) return;
    const trimmedReply = reply.trim();

    if (trimmedReply.toLowerCase() === "cancel") {
      pushUserBubble(trimmedReply);
      cancelUpload();
      return;
    }

    pushUserBubble(trimmedReply);

    switch (uploadWizard.step) {
      case "vertical": {
        setUploadWizard({ ...uploadWizard, step: "objective", vertical: trimmedReply });
        pushAssistantBubble("What's the objective -- Brand Awareness or Page Views / Traffic?");
        break;
      }
      case "objective": {
        const lower = trimmedReply.toLowerCase();
        let goalTypeCode: "AWR" | "PV" | null = null;
        if (/aware|impression|brand/.test(lower)) goalTypeCode = "AWR";
        else if (/traffic|page.?view|\bpv\b|click/.test(lower)) goalTypeCode = "PV";

        if (!goalTypeCode) {
          pushAssistantBubble("Sorry, I need to know: is this Brand Awareness or Page Views / Traffic?");
          break;
        }
        const next: UploadWizardState = { ...uploadWizard, step: "goalAmount", goalTypeCode };
        setUploadWizard(next);
        pushAssistantBubble(
          goalTypeCode === "AWR" ? "What's the impressions goal? (e.g. 1000000)" : "What's the page-views goal? (e.g. 40000)"
        );
        break;
      }
      case "goalAmount": {
        const amount = parseNumber(trimmedReply);
        if (!amount || amount <= 0) {
          pushAssistantBubble("I need a number greater than zero, e.g. 500000.");
          break;
        }
        const next: UploadWizardState = { ...uploadWizard, step: "submitting", goalAmount: amount };
        setUploadWizard(next);
        void submitUpload(next);
        break;
      }
      case "budget": {
        const amount = parseNumber(trimmedReply);
        if (!amount || amount <= 0) {
          pushAssistantBubble("I need a number greater than zero, e.g. 150000.");
          break;
        }
        const next: UploadWizardState = { ...uploadWizard, step: "submitting", overallBudget: amount };
        setUploadWizard(next);
        void submitUpload(next);
        break;
      }
      case "flightStart": {
        const date = parseDateFlexible(trimmedReply);
        if (!date) {
          pushAssistantBubble("I need a date like 2026-05-10.");
          break;
        }
        setUploadWizard({ ...uploadWizard, step: "flightEnd", flightStartDate: date });
        pushAssistantBubble("And the flight end date?");
        break;
      }
      case "flightEnd": {
        const date = parseDateFlexible(trimmedReply);
        if (!date) {
          pushAssistantBubble("I need a date like 2026-07-22.");
          break;
        }
        const next: UploadWizardState = { ...uploadWizard, step: "submitting", flightEndDate: date };
        setUploadWizard(next);
        void submitUpload(next);
        break;
      }
    }
  }

  async function submitUpload(wizard: UploadWizardState) {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("vertical", wizard.vertical ?? "");
      formData.set("goalTypeCode", wizard.goalTypeCode ?? "");
      formData.set("goalAmount", String(wizard.goalAmount ?? ""));
      if (wizard.overallBudget) formData.set("overallBudget", String(wizard.overallBudget));
      if (wizard.flightStartDate) formData.set("flightStartDate", wizard.flightStartDate);
      if (wizard.flightEndDate) formData.set("flightEndDate", wizard.flightEndDate);
      for (const [platform, file] of Object.entries(pendingFiles)) {
        formData.set(`file_${platform}`, file as File);
      }

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        if (data.missingField === "budget" && wizard.overallBudget === undefined) {
          setUploadWizard({ ...wizard, step: "budget" });
          pushAssistantBubble("Couldn't tell the budget from the files -- what's the total budget for this campaign?");
          return;
        }
        if (data.missingField === "flightDates" && wizard.flightStartDate === undefined) {
          setUploadWizard({ ...wizard, step: "flightStart" });
          pushAssistantBubble("Couldn't tell the flight dates from the files -- what's the flight start date? (YYYY-MM-DD)");
          return;
        }
        pushAssistantBubble(data.error ?? "Upload failed.");
        setUploadWizard(null);
        setPendingFiles({});
        return;
      }

      const campaignId = data.ticket.campaignId as string;
      pushAssistantBubble(`Created campaign #${campaignId} -- ${data.ticket.campaignName}. Kicking off analysis now...`);
      setUploadWizard(null);
      setPendingFiles({});
      setTicketRefreshToken((t) => t + 1);
      runFullAnalysis(campaignId);
    } catch (err) {
      pushAssistantBubble(err instanceof Error ? err.message : "Upload failed.");
      setUploadWizard(null);
      setPendingFiles({});
    } finally {
      setIsUploading(false);
    }
  }

  const composeDisabled = isLoading || isUploading;
  const sendDisabled = composeDisabled || (uploadWizard ? !input.trim() : !input.trim() && !hasPendingFiles);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="relative flex items-center justify-between gap-4 bg-gradient-to-r from-surface via-teal-100/70 to-teal-200/80 px-6 py-4 dark:from-surface dark:via-teal-950/20 dark:to-teal-950/30">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
              Campaign{" "}
              <span className="bg-gradient-to-r from-teal-500 to-teal-700 bg-clip-text text-transparent dark:from-teal-300 dark:to-teal-500">
                Intelligence
              </span>{" "}
              Assistant
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Cross-platform campaign advisor</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 md:flex">
            {PLATFORMS.map((p) => (
              <PlatformBadge key={p} platform={p} />
            ))}
          </div>
          <div className="hidden h-5 w-px bg-zinc-200 md:block dark:bg-zinc-800" />
          <ThemeToggle />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent dark:via-zinc-800" />
      </header>

      <div className="flex min-h-0 flex-1">
        <TicketSidebar
          onRunFullAnalysis={runFullAnalysis}
          onGetAudienceIdeas={getAudienceIdeas}
          disabled={isLoading}
          refreshToken={ticketRefreshToken}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {messages.map((message, i) => (
                <ChatTurn key={i} message={message} />
              ))}
              {isLoading && (
                <div className="flex items-center gap-2.5 self-start rounded-2xl border border-zinc-200/70 bg-surface px-4 py-3 text-sm text-zinc-500 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_8px_20px_-12px_rgba(24,24,27,0.08)] dark:border-zinc-800 dark:text-zinc-400">
                  <span className="flex gap-1">
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.2s]" />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.1s]" />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                  </span>
                  <span>{loadingLabel}</span>
                </div>
              )}
              {isUploading && (
                <div className="flex items-center gap-2.5 self-start rounded-2xl border border-zinc-200/70 bg-surface px-4 py-3 text-sm text-zinc-500 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_8px_20px_-12px_rgba(24,24,27,0.08)] dark:border-zinc-800 dark:text-zinc-400">
                  <span className="flex gap-1">
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.2s]" />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.1s]" />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                  </span>
                  <span>Uploading and parsing files...</span>
                </div>
              )}
              {uploadWizard?.step === "objective" && (
                <div className="flex gap-2 self-start">
                  <button
                    type="button"
                    onClick={() => handleQuickReply("Brand Awareness")}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-accent hover:text-accent dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Brand Awareness
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickReply("Page Views / Traffic")}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-accent hover:text-accent dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Page Views / Traffic
                  </button>
                </div>
              )}
              {error && (
                <div className="self-start rounded-2xl border border-red-200/70 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_8px_20px_-12px_rgba(24,24,27,0.08)] dark:border-red-900/60 dark:bg-red-950 dark:text-red-300">
                  {error}
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={sendMessage}
            className="border-t border-zinc-200 bg-surface px-6 py-4 dark:border-zinc-800"
          >
            <div className="mx-auto flex max-w-4xl flex-col gap-2">
              {hasPendingFiles && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(pendingFiles).map(([platform, file]) => (
                    <span
                      key={platform}
                      className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent"
                    >
                      {PLATFORM_TAB_LABEL[platform as PlatformKey]}: {(file as File).name}
                      {!uploadWizard && (
                        <button
                          type="button"
                          onClick={() => removeFile(platform as PlatformKey)}
                          aria-label={`Remove ${platform}`}
                          className="text-accent/70 transition-colors hover:text-accent"
                        >
                          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
                            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {uploadWizard && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Answer above to continue the upload, or type &ldquo;cancel&rdquo;.
                  </span>
                  <button
                    type="button"
                    onClick={cancelUpload}
                    className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                  >
                    Cancel upload
                  </button>
                </div>
              )}
              <div className="relative flex gap-3">
                {showAttachPopover && (
                  <AttachFilesPopover
                    files={pendingFiles}
                    onChange={setPendingFiles}
                    onClose={() => setShowAttachPopover(false)}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setShowAttachPopover((v) => !v)}
                  disabled={composeDisabled || !!uploadWizard}
                  title="Attach campaign files"
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-zinc-300 text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
                >
                  <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                    <path
                      d="M8 2.5v8M4.5 6 8 2.5 11.5 6M3 13.5h10"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    uploadWizard
                      ? "Type your answer..."
                      : hasPendingFiles
                        ? "Add a note (optional), then hit Send to start"
                        : "Ask about a campaign, e.g. 'show me my tickets'"
                  }
                  className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition-shadow focus:border-accent focus:ring-4 focus:ring-accent-soft dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  disabled={composeDisabled}
                />
                <button
                  type="submit"
                  disabled={sendDisabled}
                  className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground shadow-sm shadow-accent/30 transition-all hover:-translate-y-px hover:shadow-md hover:shadow-accent/30 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
                >
                  Send
                </button>
              </div>
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
  const [downloading, setDownloading] = useState(false);

  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {message.attachments.map((a, i) => (
              <span
                key={i}
                className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {PLATFORM_TAB_LABEL[a.platform]}: {a.fileName}
              </span>
            ))}
          </div>
        )}
        {message.content && (
          <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900">
            {message.content}
          </div>
        )}
      </div>
    );
  }

  const items = groupToolResultsForDisplay(message.toolResults ?? []);
  const hasDownloadableResults = (message.toolResults ?? []).some(
    (tr) => tr.result !== null && tr.result !== undefined && !isErrorResult(tr.result)
  );

  async function handleDownloadReport() {
    if (downloading) return;
    setDownloading(true);
    try {
      const { generateCampaignReportPdf, extractCampaignId } = await import("@/lib/pdf-report");
      generateCampaignReportPdf({
        campaignId: extractCampaignId(message.toolResults ?? []),
        toolResults: message.toolResults ?? [],
        summary: message.content,
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {items.map((item, i) =>
        item.type === "dashboard" ? (
          <CampaignDashboard key={i} campaignId={item.campaignId} results={item.results} />
        ) : (
          <ToolResultCard key={i} toolResult={item.result} />
        )
      )}
      <div className="max-w-[80%] rounded-2xl border border-zinc-200/70 bg-surface px-4 py-3 text-sm text-zinc-800 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_8px_20px_-12px_rgba(24,24,27,0.08)] dark:border-zinc-800 dark:text-zinc-100">
        <div className="prose prose-sm prose-zinc max-w-none leading-relaxed prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-strong:font-semibold prose-a:text-accent dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      </div>
      {hasDownloadableResults && (
        <button
          type="button"
          onClick={handleDownloadReport}
          disabled={downloading}
          className="flex items-center gap-1.5 self-start rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-accent dark:hover:text-accent"
        >
          <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0">
            <path
              d="M8 2v7.5M4.5 6.5 8 10l3.5-3.5M3 13.5h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {downloading ? "Preparing PDF..." : "Download Report (PDF)"}
        </button>
      )}
    </div>
  );
}
