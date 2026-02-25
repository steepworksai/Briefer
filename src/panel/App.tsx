import { useState, useEffect } from "react";
import { Summary } from "./components/Summary";
import { Toolbar } from "./components/Toolbar";
import { TokenSetup } from "./components/TokenSetup";
import { LogViewer } from "./components/LogViewer";
import { SpeechPlayer } from "./components/SpeechPlayer";
import { logger } from "../lib/logger";
import type { SummaryResult, SummaryMode } from "../lib/api";
import {
  detectPlatform,
  extractYouTubeTranscriptInPage,
  extractDeepLearningTranscriptInPage,
} from "../lib/transcripts";
import "./App.css";

type State =
  | { status: "idle" }
  | { status: "loading"; platform?: string }
  | { status: "done"; result: SummaryResult; timeSaved: number; videoTitle?: string; platform?: string }
  | { status: "error"; message: string }
  | { status: "no-key" };

function estimateReadingTime(wordCount: number): number {
  return Math.ceil(wordCount / 200);
}

function buildReadableText(result: SummaryResult): string {
  const parts: string[] = [];
  parts.push(`TL;DR. ${result.tldr}`);
  if (result.mode === "exploratory") {
    if (result.keyPoints.length) parts.push(`Key points. ${result.keyPoints.join(". ")}`);
    if (result.takeaway)         parts.push(`Takeaway. ${result.takeaway}`);
  } else {
    if (result.coreProblem)        parts.push(`Core problem. ${result.coreProblem}`);
    if (result.solutionMechanism)  parts.push(`Solution. ${result.solutionMechanism}`);
    if (result.structuralShift)    parts.push(`Structural shift. ${result.structuralShift}`);
    if (result.whyItsBetter.length)  parts.push(`Why it's better. ${result.whyItsBetter.join(". ")}`);
    if (result.keyTakeaways.length)  parts.push(`Key takeaways. ${result.keyTakeaways.join(". ")}`);
  }
  return parts.join(" ");
}

// Runs inside the page via executeScript — must be self-contained, no imports
function extractPageTextInPage(): string {
  const noiseTags = new Set([
    "script","style","noscript","iframe","nav","header","footer",
    "aside","form","button","input","select","textarea","svg",
    "canvas","video","audio",
  ]);
  const noisePatterns = [
    /\bad[-_]?\b/i, /\badvert/i, /\bbanner/i, /\bsponsored/i,
    /\bpromo/i, /\bpopup/i, /\bmodal/i, /\bcookie/i,
    /\bnewsletter/i, /\bsubscribe/i, /\bsidebar/i, /\bwidget/i,
    /\bcomment/i, /\bfooter/i, /\bnavbar/i, /\bmenu/i,
    /\brelated/i, /\bsocial/i, /\bshare/i,
  ];

  const candidates = [
    document.querySelector("article"),
    document.querySelector('[role="main"]'),
    document.querySelector("main"),
    document.querySelector(".post-content"),
    document.querySelector(".article-body"),
    document.querySelector(".entry-content"),
    document.querySelector("#content"),
    document.querySelector("#main"),
    document.body,
  ];
  const container = (candidates.find((el) => el !== null) ?? document.body) as Element;
  const clone = container.cloneNode(true) as Element;

  for (const el of Array.from(clone.querySelectorAll("*"))) {
    const tag = el.tagName.toLowerCase();
    const combined = `${(el as HTMLElement).id ?? ""} ${(el as HTMLElement).className ?? ""}`;
    if (noiseTags.has(tag) || noisePatterns.some((p) => p.test(combined))) {
      el.remove();
    }
  }

  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube:       "📺 YouTube",
  deeplearning:  "🎓 DeepLearning.AI",
};

export default function App() {
  const [state, setState]       = useState<State>({ status: "idle" });
  const [showLogs, setShowLogs] = useState(false);
  const [mode, setMode]         = useState<SummaryMode>("exploratory");

  useEffect(() => {
    runSummary("exploratory");
  }, []);

  async function runSummary(selectedMode?: SummaryMode) {
    const activeMode = selectedMode ?? mode;
    setMode(activeMode);
    setState({ status: "loading" });
    await logger.info("panel", `Starting summarization [${activeMode}]`);

    const { geminiApiKey } = await chrome.storage.sync.get("geminiApiKey");
    if (!geminiApiKey) {
      await logger.warn("panel", "No API key found — showing token setup");
      setState({ status: "no-key" });
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error("No active tab");

      const platform = detectPlatform(tab.url ?? "");
      setState({ status: "loading", platform: platform ?? undefined });
      await logger.info("panel", `Platform: ${platform ?? "web"} — tab ${tab.id}: ${tab.url}`);

      let text = "";
      let videoTitle: string | undefined;

      // ── YouTube ─────────────────────────────────────────────────────────────
      if (platform === "youtube") {
        // Caption fetch happens inside the page (MAIN world) so YouTube's
        // signed URLs are called with the page's session — no CORS/expiry issues.
        const ytResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractYouTubeTranscriptInPage,
          world: "MAIN",
        });
        const ytInfo = ytResults[0]?.result;

        if (!ytInfo) throw new Error("Could not read YouTube player data. Try refreshing the page.");
        if (!ytInfo.transcript) throw new Error("This video has no captions available. QuickRead needs subtitles to summarize a video.");

        videoTitle = ytInfo.title;
        text = ytInfo.transcript;
        await logger.info("panel", `YouTube: fetched transcript for "${videoTitle}"`);

      // ── DeepLearning.AI ──────────────────────────────────────────────────────
      } else if (platform === "deeplearning") {
        const dlResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractDeepLearningTranscriptInPage,
        });
        const dlInfo = dlResults[0]?.result;

        if (dlInfo) {
          videoTitle = dlInfo.title;
          text = dlInfo.transcript;
          await logger.info("panel", `DeepLearning.AI: extracted transcript for "${videoTitle}"`);
        } else {
          // Transcript panel not visible or selectors missed — fall back to generic page text
          await logger.warn("panel", "DeepLearning.AI transcript extraction returned null; falling back to generic page text");
          const fallbackResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractPageTextInPage,
          });
          text = fallbackResults[0]?.result ?? "";
          if (!text || text.split(/\s+/).length < 20) {
            throw new Error("Could not extract content from this DeepLearning.AI page. Try opening the transcript panel first.");
          }
          await logger.info("panel", `DeepLearning.AI: using generic page text (${text.split(/\s+/).length} words)`);
        }

      // ── Regular web page ─────────────────────────────────────────────────────
      } else {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractPageTextInPage,
        });
        text = results[0]?.result ?? "";
      }

      const wordCount = text.split(/\s+/).length;
      await logger.info("panel", `Extracted ${wordCount} words`);

      // Save for experimentation
      fetch("http://localhost:3747/save-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: tab.url, text, wordCount, ts: Date.now() }),
      }).catch(() => {});

      if (wordCount < 20) {
        throw new Error("Not enough content found on this page to summarize.");
      }

      const timeSaved = estimateReadingTime(wordCount);
      const response = await chrome.runtime.sendMessage({
        type: "SUMMARIZE",
        payload: { text, apiKey: geminiApiKey, mode: activeMode },
      });

      if (!response.success) throw new Error(response.error);

      await logger.info("panel", "Summary received and rendered");
      setState({ status: "done", result: response.result, timeSaved, videoTitle, platform: platform ?? undefined });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      await logger.error("panel", `Error: ${message}`);
      setState({ status: "error", message });
    }
  }

  const loadingPlatform = state.status === "loading" ? state.platform : undefined;

  return (
    <div className="app">
      <header>
        <span className="logo">⚡ QuickRead</span>
        <button
          className="logs-toggle"
          onClick={() => setShowLogs((v) => !v)}
          title="View logs"
        >
          {showLogs ? "← Back" : "Logs"}
        </button>
      </header>

      {showLogs ? (
        <LogViewer />
      ) : (
      <main>
        {state.status === "idle" && null}

        {state.status === "loading" && (
          <div className="loading">
            <div className="spinner" />
            <p>{loadingPlatform ? `Extracting transcript...` : "Summarizing page..."}</p>
          </div>
        )}

        {state.status === "no-key" && (
          <TokenSetup onSaved={() => runSummary()} />
        )}

        {state.status === "error" && (
          <div className="error">
            <p>Error: {state.message}</p>
            <button onClick={() => runSummary()}>Retry</button>
          </div>
        )}

        {(state.status === "done" || state.status === "loading") && (
          <div className="mode-selector">
            <button
              className={`mode-btn ${mode === "exploratory" ? "mode-btn--active" : ""}`}
              onClick={() => runSummary("exploratory")}
            >
              🟢 Quick Read
            </button>
            <button
              className={`mode-btn ${mode === "deep" ? "mode-btn--active" : ""}`}
              onClick={() => runSummary("deep")}
            >
              🔵 Deep Dive
            </button>
          </div>
        )}

        {state.status === "done" && (
          <>
            {state.videoTitle && (
              <div className="video-header">
                <span className="video-badge">
                  {PLATFORM_LABELS[state.platform ?? ""] ?? "📺 Video"}
                </span>
                <p className="video-title">{state.videoTitle}</p>
              </div>
            )}
            <SpeechPlayer text={buildReadableText(state.result)} />
            <Summary result={state.result} readingTimeSaved={state.timeSaved} />
            <Toolbar summary={state.result.tldr} onRefresh={() => runSummary()} />
          </>
        )}
      </main>
      )}
    </div>
  );
}
