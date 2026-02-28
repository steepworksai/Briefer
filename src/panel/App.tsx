import { useState, useEffect, useCallback } from "react";
import { Summary } from "./components/Summary";
import { TokenSetup } from "./components/TokenSetup";
import { LogViewer } from "./components/LogViewer";
import { DoodleMindMap } from "./components/DoodleMindMap";
import { History } from "./components/History";
import { Tour } from "./components/Tour";
import { logger } from "../lib/logger";
import { fetchDoodleImage } from "../lib/doodle";
import { saveEntry, deriveTopic } from "../lib/history";
import type { HistoryEntry } from "../lib/history";
import type { SummaryResult } from "../lib/api";
import {
  detectPlatform,
  extractDeepLearningTranscriptInPage,
} from "../lib/transcripts";
import "./App.css";

type SummaryState =
  | { status: "idle" }
  | { status: "loading"; platform?: string }
  | { status: "done"; result: SummaryResult; timeSaved: number; videoTitle?: string; platform?: string }
  | { status: "error"; message: string }
  | { status: "no-key" };

type DoodleState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; img: string }
  | { status: "error" };

function estimateReadingTime(wordCount: number): number {
  return Math.ceil(wordCount / 200);
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
  youtube:      "📺 YouTube",
  deeplearning: "🎓 DeepLearning.AI",
};

function formatSummaryText(result: SummaryResult): string {
  const lines: string[] = [];
  if (result.tldr)              lines.push(`TL;DR\n${result.tldr}`);
  if (result.keyPoints.length)  lines.push(`\nKey Points\n${result.keyPoints.map(p => `• ${p}`).join("\n")}`);
  if (result.takeaway)          lines.push(`\nTakeaway\n${result.takeaway}`);
  return lines.join("\n");
}

function cloneSummary(result: SummaryResult): SummaryResult {
  return {
    tldr: result.tldr,
    keyPoints: [...result.keyPoints],
    takeaway: result.takeaway,
  };
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load doodle image"));
    img.src = src;
  });
}

type StyledRun = { text: string; bold: boolean };

function parseMarkdownRuns(text: string): StyledRun[] {
  const parts = text.replace(/\r?\n/g, " ").split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  const runs: StyledRun[] = [];
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      runs.push({ text: part.slice(2, -2).replace(/\*([^*]+)\*/g, "$1"), bold: true });
    } else {
      runs.push({ text: part.replace(/\*([^*]+)\*/g, "$1"), bold: false });
    }
  }
  return runs;
}

function measureStyled(ctx: CanvasRenderingContext2D, text: string, bold: boolean, fontSize: number): number {
  ctx.font = `${bold ? 700 : 400} ${fontSize}px Arial, Helvetica, sans-serif`;
  return ctx.measureText(text).width;
}

function wrapMarkdownRuns(
  ctx: CanvasRenderingContext2D,
  runs: StyledRun[],
  maxWidth: number,
  fontSize: number,
): StyledRun[][] {
  const tokens: StyledRun[] = [];
  for (const run of runs) {
    const pieces = run.text.split(/(\s+)/).filter(Boolean);
    for (const piece of pieces) tokens.push({ text: piece, bold: run.bold });
  }

  const lines: StyledRun[][] = [];
  let line: StyledRun[] = [];
  let lineWidth = 0;

  const trimTrailingSpaces = () => {
    while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop();
  };

  for (const tk of tokens) {
    const isSpace = /^\s+$/.test(tk.text);
    const w = measureStyled(ctx, tk.text, tk.bold, fontSize);
    if (!isSpace && lineWidth > 0 && lineWidth + w > maxWidth) {
      trimTrailingSpaces();
      if (line.length) lines.push(line);
      line = [];
      lineWidth = 0;
    }
    if (line.length === 0 && isSpace) continue;
    line.push(tk);
    lineWidth += w;
  }

  trimTrailingSpaces();
  if (line.length) lines.push(line);
  return lines;
}

function decodeBase64ToBytes(data: string): Uint8Array {
  const raw = atob(data);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function escapePdfText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

type PdfImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  x: number;
  y: number;
  drawW: number;
  drawH: number;
};

type PdfPage = {
  stream: string;
  image?: PdfImage;
};

function makePdfDocument(params: {
  pageWidth: number;
  pageHeight: number;
  pages: PdfPage[];
}): Blob {
  const { pageWidth, pageHeight, pages } = params;
  const te = new TextEncoder();
  const parts: BlobPart[] = [];
  let offset = 0;
  const offsets: number[] = [0];

  const pushStr = (s: string) => {
    const b = te.encode(s);
    parts.push(b);
    offset += b.length;
  };
  const pushBytes = (b: Uint8Array) => {
    const copy = new ArrayBuffer(b.length);
    new Uint8Array(copy).set(b);
    parts.push(copy);
    offset += b.length;
  };

  const n = pages.length;
  const catalogId = 1;
  const pagesId = 2;
  const fontRegularId = 3;
  const fontBoldId = 4;
  let nextId = 5;
  const pageSpecs = pages.map((p) => {
    const pageId = nextId++;
    const contentId = nextId++;
    const imageId = p.image ? nextId++ : null;
    return { pageId, contentId, imageId, page: p };
  });
  const totalObjects = nextId - 1;

  pushStr("%PDF-1.4\n");

  offsets[catalogId] = offset;
  pushStr(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`);

  const kids: string[] = [];
  for (const spec of pageSpecs) kids.push(`${spec.pageId} 0 R`);
  offsets[pagesId] = offset;
  pushStr(`${pagesId} 0 obj\n<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${n} >>\nendobj\n`);

  offsets[fontRegularId] = offset;
  pushStr(`${fontRegularId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  offsets[fontBoldId] = offset;
  pushStr(`${fontBoldId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

  for (const spec of pageSpecs) {
    let contentStream = spec.page.stream;
    if (spec.page.image && spec.imageId) {
      const img = spec.page.image;
      contentStream += `q\n${img.drawW.toFixed(2)} 0 0 ${img.drawH.toFixed(2)} ${img.x.toFixed(2)} ${img.y.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    }

    offsets[spec.pageId] = offset;
    pushStr(
      `${spec.pageId} 0 obj\n` +
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >>` +
      (spec.imageId ? ` /XObject << /Im0 ${spec.imageId} 0 R >>` : "") +
      ` >> /Contents ${spec.contentId} 0 R >>\nendobj\n`,
    );

    offsets[spec.contentId] = offset;
    pushStr(`${spec.contentId} 0 obj\n<< /Length ${te.encode(contentStream).length} >>\nstream\n${contentStream}endstream\nendobj\n`);

    if (spec.page.image && spec.imageId) {
      const img = spec.page.image;
      offsets[spec.imageId] = offset;
      pushStr(`${spec.imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
      pushBytes(img.bytes);
      pushStr("\nendstream\nendobj\n");
    }
  }

  const xrefOffset = offset;
  pushStr(`xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= totalObjects; i++) {
    const at = offsets[i] ?? 0;
    pushStr(`${String(at).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size ${totalObjects + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(parts, { type: "application/pdf" });
}

async function buildSummaryPdf(result: SummaryResult, doodleSrc: string): Promise<Blob> {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 44;
  const bodySize = 13;
  const bodyLeading = 20;

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) throw new Error("Canvas is not available");
  const doodle = await loadImage(doodleSrc);
  const pages: PdfPage[] = [];
  let stream = "";
  let y = pageHeight - margin;
  let imageForPage: PdfImage | undefined;
  const textWidth = pageWidth - margin * 2;

  const pushCmd = (cmd: string) => { stream += `${cmd}\n`; };
  const setFill = (r: number, g: number, b: number) => pushCmd(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
  const commitPage = () => {
    pages.push({ stream, image: imageForPage });
    stream = "";
    imageForPage = undefined;
    y = pageHeight - margin;
  };
  const ensureSpace = (height: number) => {
    if (y - height < margin) commitPage();
  };
  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: [number, number, number], width = 1) => {
    pushCmd(`${color[0]} ${color[1]} ${color[2]} RG`);
    pushCmd(`${width.toFixed(2)} w`);
    pushCmd(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  };
  const writeText = (text: string, x: number, y0: number, size: number, bold = false) => {
    const clean = escapePdfText(text);
    if (!clean) return;
    pushCmd(`BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y0.toFixed(2)} Tm (${clean}) Tj ET`);
  };

  const writeRunsLine = (runs: StyledRun[], x: number, y0: number, size: number) => {
    let cx = x;
    for (const run of runs) {
      const txt = run.text;
      if (!txt) continue;
      writeText(txt, cx, y0, size, run.bold);
      cx += measureStyled(measureCtx, txt, run.bold, size);
    }
  };

  setFill(0.07, 0.14, 0.28);
  writeText("Briefer Summary Pack", margin, y, 30, true);
  y -= 36;
  setFill(0.28, 0.34, 0.43);
  writeText("AI Doodle + Full Summary", margin, y, 17, false);
  y -= 22;
  drawLine(margin, y, pageWidth - margin, y, [0.86, 0.90, 0.96], 1.4);
  y -= 18;

  const doodleCanvas = document.createElement("canvas");
  doodleCanvas.width = doodle.naturalWidth || doodle.width;
  doodleCanvas.height = doodle.naturalHeight || doodle.height;
  const dctx = doodleCanvas.getContext("2d");
  if (!dctx) throw new Error("Canvas is not available");
  dctx.fillStyle = "#ffffff";
  dctx.fillRect(0, 0, doodleCanvas.width, doodleCanvas.height);
  dctx.drawImage(doodle, 0, 0);
  const doodleBytes = decodeBase64ToBytes(doodleCanvas.toDataURL("image/jpeg", 0.92).split(",")[1]);

  const imgMaxW = textWidth;
  const imgMaxH = 410;
  const imgScale = Math.min(imgMaxW / doodleCanvas.width, imgMaxH / doodleCanvas.height);
  const drawW = doodleCanvas.width * imgScale;
  const drawH = doodleCanvas.height * imgScale;
  ensureSpace(drawH + 24);
  const imgX = (pageWidth - drawW) / 2;
  const imgY = y - drawH;
  imageForPage = {
    bytes: doodleBytes,
    width: doodleCanvas.width,
    height: doodleCanvas.height,
    x: imgX,
    y: imgY,
    drawW,
    drawH,
  };
  y = imgY - 24;

  const writeSection = (title: string) => {
    ensureSpace(28);
    setFill(0.11, 0.31, 0.84);
    writeText(title, margin, y, 20, true);
    y -= 28;
    setFill(0.12, 0.16, 0.22);
  };

  const writeParagraph = (text: string) => {
    const runs = parseMarkdownRuns(text || "");
    const wrapped = wrapMarkdownRuns(measureCtx, runs, textWidth, bodySize);
    for (const lineRuns of wrapped) {
      ensureSpace(bodyLeading);
      writeRunsLine(lineRuns, margin, y, bodySize);
      y -= bodyLeading;
    }
    y -= 8;
  };

  writeSection("TL;DR");
  writeParagraph(result.tldr || "No TL;DR available.");

  writeSection("Key Points");
  for (const kp of result.keyPoints) {
    writeParagraph(`• ${kp}`);
  }

  writeSection("Key Takeaway");
  writeParagraph(result.takeaway || "No takeaway available.");

  if (stream.trim() || imageForPage) commitPage();
  return makePdfDocument({
    pageWidth,
    pageHeight,
    pages,
  });
}

export default function App() {
  const [summaryState, setSummaryState] = useState<SummaryState>({ status: "idle" });
  const [doodleState,  setDoodleState]  = useState<DoodleState>({ status: "idle" });
  const [showLogs,     setShowLogs]     = useState(false);
  const [showHistory,  setShowHistory]  = useState(false);
  const [showTour,     setShowTour]     = useState(false);
  const [geminiKey,    setGeminiKey]    = useState("");
  const [copied,       setCopied]       = useState<"summary" | "doodle" | null>(null);
  const [pdfBusy,        setPdfBusy]        = useState(false);
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [draftSummary,   setDraftSummary]   = useState<SummaryResult | null>(null);
  const [zoomedDoodle, setZoomedDoodle] = useState<string | null>(null);

  useEffect(() => { runSummary(); }, []);

  useEffect(() => {
    if (!zoomedDoodle) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoomedDoodle(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomedDoodle]);

  function loadFromHistory(entry: HistoryEntry) {
    setSummaryState({ status: "done", result: entry.result, timeSaved: 0, videoTitle: entry.pageTitle || undefined, platform: entry.platform });
    setDoodleState({ status: "idle" });
    setIsEditingSummary(false);
    setDraftSummary(null);
    setShowHistory(false);
  }

  async function runSummary() {
    setSummaryState({ status: "loading" });
    setDoodleState({ status: "idle" });
    setIsEditingSummary(false);
    setDraftSummary(null);
    await logger.info("panel", "Starting summarization");

    const storage = await chrome.storage.sync.get(["geminiApiKey", "tourSeen"]);
    const geminiApiKey = storage.geminiApiKey as string | undefined;
    if (geminiApiKey) setGeminiKey(geminiApiKey);
    if (!storage.tourSeen) {
      setShowTour(true);
      setSummaryState({ status: "no-key" });
      return;
    }
    if (!geminiApiKey) {
      await logger.warn("panel", "No API key found — showing token setup");
      setSummaryState({ status: "no-key" });
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error("No active tab");

      const platform = detectPlatform(tab.url ?? "");
      setSummaryState({ status: "loading", platform: platform ?? undefined });
      await logger.info("panel", `Platform: ${platform ?? "web"} — tab ${tab.id}: ${tab.url}`);

      let text = "";
      let videoTitle: string | undefined;

      if (platform === "youtube") {
        videoTitle = tab.title ?? "YouTube Video";
        await logger.info("panel", `YouTube: sending URL to Gemini directly — "${videoTitle}"`);
        const videoResponse = await chrome.runtime.sendMessage({
          type: "SUMMARIZE_VIDEO",
          payload: { videoUrl: tab.url, apiKey: geminiApiKey },
        });
        if (!videoResponse.success) throw new Error(videoResponse.error);
        await logger.info("panel", "YouTube summary received");
        const result = videoResponse.result as SummaryResult;
        setSummaryState({ status: "done", result, timeSaved: 0, videoTitle, platform: "youtube" });
        runDoodle(result, geminiApiKey as string);
        saveEntry({ url: tab.url ?? "", pageTitle: videoTitle ?? "", topic: deriveTopic(result, videoTitle), platform: "youtube", result }).catch(() => {});
        return;

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
          const fallbackResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractPageTextInPage,
          });
          text = fallbackResults[0]?.result ?? "";
          if (!text || text.split(/\s+/).length < 20)
            throw new Error("Could not extract content from this DeepLearning.AI page.");
        }
      } else {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractPageTextInPage,
        });
        text = results[0]?.result ?? "";
      }

      const wordCount = text.split(/\s+/).length;
      await logger.info("panel", `Extracted ${wordCount} words`);

      fetch("http://localhost:3747/save-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: tab.url, text, wordCount, ts: Date.now() }),
      }).catch(() => {});

      if (wordCount < 20) throw new Error("Not enough content found on this page to summarize.");

      const timeSaved = estimateReadingTime(wordCount);
      const response = await chrome.runtime.sendMessage({
        type: "SUMMARIZE",
        payload: { text, apiKey: geminiApiKey },
      });
      if (!response.success) throw new Error(response.error);

      await logger.info("panel", "Summary received and rendered");
      const result = response.result as SummaryResult;
      setSummaryState({ status: "done", result, timeSaved, videoTitle, platform: platform ?? undefined });
      runDoodle(result, geminiApiKey as string);
      saveEntry({ url: tab.url ?? "", pageTitle: tab.title ?? "", topic: deriveTopic(result, tab.title), platform: platform ?? undefined, result }).catch(() => {});

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      await logger.error("panel", `Error: ${message}`);
      setSummaryState({ status: "error", message });
    }
  }

  const runDoodle = useCallback(async (result: SummaryResult, apiKey: string) => {
    setDoodleState({ status: "loading" });
    const img = await fetchDoodleImage(result, apiKey);
    setDoodleState(img ? { status: "done", img } : { status: "error" });
  }, []);

  async function regenerateDoodle() {
    if (summaryState.status !== "done") return;
    const key = geminiKey || (await chrome.storage.sync.get("geminiApiKey")).geminiApiKey as string;
    if (!key) return;
    const result = isEditingSummary && draftSummary ? draftSummary : summaryState.result;
    runDoodle(result, key);
  }

  function copyText(text: string, which: "summary" | "doodle") {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function saveDoodle(img: string) {
    const a = document.createElement("a");
    a.href = img;
    a.download = "briefer-doodle.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function saveSummaryPdf() {
    if (summaryState.status !== "done" || doodleState.status !== "done" || pdfBusy) return;
    setPdfBusy(true);
    try {
      const result = isEditingSummary && draftSummary ? draftSummary : summaryState.result;
      const pdfBlob = await buildSummaryPdf(result, doodleState.img);
      const url = URL.createObjectURL(pdfBlob);
      try {
        await chrome.tabs.create({ url });
      } catch {
        window.open(url, "_blank");
      }
      // Keep object URL alive long enough for preview tab load.
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not build PDF";
      logger.error("panel", `PDF export failed: ${message}`);
    } finally {
      setPdfBusy(false);
    }
  }

  const loadingPlatform = summaryState.status === "loading" ? summaryState.platform : undefined;
  const activeSummary = summaryState.status === "done"
    ? (isEditingSummary && draftSummary ? draftSummary : summaryState.result)
    : null;

  function startEditSummary() {
    if (summaryState.status !== "done") return;
    setDraftSummary(cloneSummary(summaryState.result));
    setIsEditingSummary(true);
  }

  function cancelEditSummary() {
    setIsEditingSummary(false);
    setDraftSummary(null);
  }

  function saveEditSummary() {
    if (summaryState.status !== "done" || !draftSummary) return;
    const next = cloneSummary(draftSummary);
    setSummaryState({
      ...summaryState,
      result: next,
    });
    setIsEditingSummary(false);
    setDraftSummary(null);
  }

  return (
    <div className="app">
      <header>
        <span className="logo">⚡ Briefer</span>
        <div className="header-actions">
          <button
            className={`logs-toggle${showHistory ? " logs-toggle--active" : ""}`}
            onClick={() => { setShowHistory(v => !v); setShowLogs(false); }}
            title="Saved summaries"
          >{showHistory ? "← Back" : "📚 History"}</button>
          <button
            className="logs-toggle"
            onClick={() => { setShowLogs(v => !v); setShowHistory(false); }}
            title="View logs"
          >{showLogs ? "← Back" : "Logs"}</button>
        </div>
      </header>

      {showHistory ? <History onLoad={loadFromHistory} /> :
       showLogs    ? <LogViewer /> : (
        <main>
          {summaryState.status === "idle" && null}

          {summaryState.status === "loading" && (
            <div className="loading">
              <div className="spinner" />
              <p>{loadingPlatform ? "Extracting transcript..." : "Summarizing page..."}</p>
            </div>
          )}

          {summaryState.status === "no-key" && (
            showTour
              ? <Tour onDone={() => { setShowTour(false); runSummary(); }} />
              : <TokenSetup onSaved={() => runSummary()} />
          )}

          {summaryState.status === "error" && (
            <div className="error">
              <p>Error: {summaryState.message}</p>
              <button onClick={() => runSummary()}>Retry</button>
            </div>
          )}

          {summaryState.status === "done" && (
            <>
              {summaryState.videoTitle && (
                <div className="video-header">
                  <span className="video-badge">
                    {PLATFORM_LABELS[summaryState.platform ?? ""] ?? "📺 Video"}
                  </span>
                  <p className="video-title">{summaryState.videoTitle}</p>
                </div>
              )}

              {/* ── AI Doodle ── */}
              <div className="panel-section">
                <div className="panel-section__header">
                  <span className="panel-section__title">✨ AI Doodle</span>
                  <div className="panel-section__actions">
                    <button
                      className="section-btn"
                      onClick={regenerateDoodle}
                      disabled={doodleState.status === "loading"}
                      title="Regenerate doodle"
                    >🔄</button>
                    {doodleState.status === "done" && (
                      <>
                        <button
                          className="section-btn"
                          onClick={() => saveDoodle(doodleState.img)}
                          title="Save as PNG"
                        >💾</button>
                        <button
                          className="section-btn section-btn--text"
                          onClick={saveSummaryPdf}
                          disabled={pdfBusy}
                          title="Preview AI doodle + full summary PDF"
                        >{pdfBusy ? "…" : "PDF"}</button>
                        <DoodleMindMap result={activeSummary ?? summaryState.result} />
                      </>
                    )}
                  </div>
                </div>

                {doodleState.status === "loading" && (
                  <div className="doodle-loading">
                    <div className="spinner" />
                    <p>Generating doodle…</p>
                  </div>
                )}
                {doodleState.status === "done" && (
                  <img
                    src={doodleState.img}
                    className="doodle-img"
                    alt="AI-generated sketchnote"
                    title="Click to zoom"
                    onClick={() => setZoomedDoodle(doodleState.img)}
                  />
                )}
                {doodleState.status === "error" && (
                  <div className="doodle-error">
                    Could not generate doodle — check Logs for details
                  </div>
                )}
              </div>

              {/* ── Summary ── */}
              <div className="panel-section">
                <div className="panel-section__header">
                  <span className="panel-section__title">📋 Summary</span>
                  <div className="panel-section__actions">
                    <button
                      className="section-btn"
                      onClick={() => runSummary()}
                      title="Regenerate summary"
                    >🔄</button>
                    <button
                      className={`section-btn${copied === "summary" ? " section-btn--copied" : ""}`}
                      onClick={() => copyText(formatSummaryText(activeSummary ?? summaryState.result), "summary")}
                      title="Copy to clipboard"
                    >{copied === "summary" ? "✓" : "📋"}</button>
                    {!isEditingSummary ? (
                      <button
                        className="section-btn"
                        onClick={startEditSummary}
                        title="Edit summary"
                      >✏️</button>
                    ) : (
                      <>
                        <button
                          className="section-btn"
                          onClick={saveEditSummary}
                          title="Save edits"
                        >✓</button>
                        <button
                          className="section-btn"
                          onClick={cancelEditSummary}
                          title="Cancel edits"
                        >✕</button>
                      </>
                    )}
                  </div>
                </div>
                <Summary
                  result={activeSummary ?? summaryState.result}
                  readingTimeSaved={summaryState.timeSaved}
                  editable={isEditingSummary}
                  onChange={setDraftSummary}
                />
              </div>
            </>
          )}
        </main>
      )}

      {zoomedDoodle && (
        <div className="img-lightbox" onClick={() => setZoomedDoodle(null)}>
          <img
            src={zoomedDoodle}
            className="img-lightbox__img"
            alt="AI-generated sketchnote"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
