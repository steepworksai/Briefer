import { useState, useEffect } from "react";
import { Summary } from "./components/Summary";
import { Toolbar } from "./components/Toolbar";
import { TokenSetup } from "./components/TokenSetup";
import { LogViewer } from "./components/LogViewer";
import { SpeechPlayer } from "./components/SpeechPlayer";
import { logger } from "../lib/logger";
import type { SummaryResult, SummaryMode } from "../lib/api";
import "./App.css";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: SummaryResult; timeSaved: number }
  | { status: "error"; message: string }
  | { status: "no-key" };

function estimateReadingTime(wordCount: number): number {
  return Math.ceil(wordCount / 200); // avg reading speed
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

export default function App() {
  const [state, setState]   = useState<State>({ status: "idle" });
  const [showLogs, setShowLogs] = useState(false);
  const [mode, setMode]     = useState<SummaryMode>("exploratory");

  useEffect(() => {
    runSummary("exploratory");
  }, []);

  async function runSummary(selectedMode?: SummaryMode) {
    const activeMode = selectedMode ?? mode;
    setMode(activeMode);
    setState({ status: "loading" });
    await logger.info("popup", `Starting summarization [${activeMode}]`);

    const { geminiApiKey } = await chrome.storage.sync.get("geminiApiKey");
    if (!geminiApiKey) {
      await logger.warn("popup", "No API key found — showing token setup");
      setState({ status: "no-key" });
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error("No active tab");

      await logger.info("popup", `Extracting text from tab ${tab.id}: ${tab.url}`);

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageTextInPage,
      });

      const text: string = results[0]?.result ?? "";
      const wordCount = text.split(/\s+/).length;
      await logger.info("popup", `Extracted ${wordCount} words`);

      // Save raw text to logs/page-text.txt for future experimentation
      fetch("http://localhost:3747/save-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: tab.url, text, wordCount, ts: Date.now() }),
      }).catch(() => {}); // fire-and-forget, don't block if server is down

      if (wordCount < 20) {
        throw new Error("Not enough content found on this page to summarize.");
      }

      const timeSaved = estimateReadingTime(wordCount);

      const response = await chrome.runtime.sendMessage({
        type: "SUMMARIZE",
        payload: { text, apiKey: geminiApiKey, mode: activeMode },
      });

      if (!response.success) throw new Error(response.error);

      await logger.info("popup", "Summary received and rendered");
      setState({
        status: "done",
        result: response.result,
        timeSaved,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      await logger.error("popup", `Error: ${message}`);
      setState({ status: "error", message });
    }
  }

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
            <p>Summarizing page...</p>
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
