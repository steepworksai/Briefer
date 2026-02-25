// ─── Platform detection ───────────────────────────────────────────────────────
export type TranscriptPlatform = "youtube" | "deeplearning" | null;

export function detectPlatform(url: string): TranscriptPlatform {
  if (url.includes("youtube.com/watch") && url.includes("v=")) return "youtube";
  if (url.includes("learn.deeplearning.ai")) return "deeplearning";
  return null;
}

// ─── Result type ──────────────────────────────────────────────────────────────
export interface TranscriptResult {
  title: string;
  transcript: string;
  platform: TranscriptPlatform;
}

// ─── YouTube ─────────────────────────────────────────────────────────────────
// Runs inside the page via executeScript — must be self-contained, no imports
export async function extractYouTubeInfoInPage(): Promise<{ captionUrl: string | null; title: string } | null> {
  try {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Helper: validate that player data matches the current URL's video ID.
    // On YouTube SPA navigation ytInitialPlayerResponse can be stale.
    const currentVideoId = new URLSearchParams(window.location.search).get("v") ?? "";
    const playerMatchesUrl = (p: any) =>
      p && (!currentVideoId || (p?.videoDetails?.videoId ?? "") === currentVideoId);

    // Poll for up to 6 seconds (12 × 500ms) for a matching ytInitialPlayerResponse
    let player = (window as any).ytInitialPlayerResponse;
    if (!playerMatchesUrl(player)) {
      for (let attempt = 0; attempt < 12; attempt++) {
        await sleep(500);
        player = (window as any).ytInitialPlayerResponse;
        if (playerMatchesUrl(player)) break;
      }
    }

    // Fallback: scrape ytInitialPlayerResponse from inline <script> tags
    // (present on hard-load; may be more reliable than the window global after SPA nav)
    if (!playerMatchesUrl(player)) {
      const scripts = Array.from(document.querySelectorAll("script:not([src])"));
      for (const s of scripts) {
        const match = s.textContent?.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            if (playerMatchesUrl(parsed)) { player = parsed; break; }
          } catch { /* malformed JSON — skip */ }
        }
      }
    }

    if (!playerMatchesUrl(player)) return null;

    const title: string = player?.videoDetails?.title ?? "YouTube Video";
    const tracks: any[] =
      player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

    if (tracks.length === 0) return { captionUrl: null, title };

    // Prefer: manual English > auto-generated English > any track
    const rank = (t: any): number => {
      const lang: string = (t.languageCode ?? "").toLowerCase();
      const isAuto: boolean = t.kind === "asr";
      if (lang.startsWith("en") && !isAuto) return 0;
      if (lang.startsWith("en") && isAuto)  return 1;
      return 2;
    };

    const best = [...tracks].sort((a, b) => rank(a) - rank(b))[0];
    const raw: string = best.baseUrl ?? "";
    const captionUrl = raw
      ? raw + (raw.includes("?") ? "&fmt=json3" : "?fmt=json3")
      : null;

    return { captionUrl, title };
  } catch {
    return null;
  }
}

export async function fetchYouTubeTranscript(captionUrl: string): Promise<string> {
  const resp = await fetch(captionUrl);
  if (!resp.ok) throw new Error(`Caption fetch failed: ${resp.status}`);

  const bodyText = await resp.text();
  if (!bodyText || bodyText.trim().length === 0) {
    throw new Error("Caption response was empty. The captions URL may have expired — try refreshing the page.");
  }

  // YouTube caption URLs can return either JSON3 format or XML (ttml/srv3).
  // Try JSON first; fall back to XML text extraction.
  if (bodyText.trimStart().startsWith("{")) {
    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch (e) {
      throw new Error(`Caption JSON parse failed: ${(e as Error).message}`);
    }
    return (data.events ?? [])
      .flatMap((evt: any) => (evt.segs ?? []).map((s: any) => (s.utf8 ?? "").replace(/\n/g, " ")))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // XML fallback: extract all <text> element content from ttml/srv3 format
  if (bodyText.trimStart().startsWith("<")) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(bodyText, "application/xml");
    const textEls = Array.from(doc.querySelectorAll("text, p"));
    const extracted = textEls
      .map((el) => (el.textContent ?? "").replace(/\n/g, " ").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (extracted.length > 0) return extracted;
  }

  throw new Error("Caption response format not recognised (expected JSON3 or XML).");
}

// ─── DeepLearning.AI ──────────────────────────────────────────────────────────
// Runs inside the page via executeScript — must be self-contained, no imports
export async function extractDeepLearningTranscriptInPage(): Promise<{ title: string; transcript: string } | null> {
  try {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Title
    const titleEl =
      document.querySelector("h1") ??
      document.querySelector("[class*='title']") ??
      document.querySelector("title");
    const title = titleEl?.textContent?.trim() ?? "DeepLearning.AI Video";

    // ── Step 1: click "Show Transcript" if present ───────────────────────────
    const allButtons = Array.from(document.querySelectorAll("button"));
    const showBtn = allButtons.find(
      (b) => /show\s+transcript/i.test(b.textContent ?? "")
    );
    if (showBtn) {
      (showBtn as HTMLButtonElement).click();
      await sleep(1200); // wait for panel to animate open
    }

    // ── Step 2: extract transcript text ─────────────────────────────────────
    const transcriptSelectors = [
      "[class*='transcript']",
      "[class*='Transcript']",
      "[data-purpose*='transcript']",
      ".phrase-text",
      "[class*='subtitle']",
      "[class*='caption']",
    ];

    for (const sel of transcriptSelectors) {
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length > 0) {
        const text = els.map((el) => el.textContent?.trim()).filter(Boolean).join(" ");
        if (text.split(/\s+/).length > 20) return { title, transcript: text };
      }
    }

    // ── Step 3: fallback to main content area ────────────────────────────────
    const noiseTags = new Set(["script","style","noscript","nav","header","footer","button","aside"]);
    const container =
      document.querySelector("main") ??
      document.querySelector("article") ??
      document.querySelector("[class*='content']") ??
      document.querySelector("[class*='lesson']") ??
      document.body;

    const clone = container!.cloneNode(true) as Element;
    for (const el of Array.from(clone.querySelectorAll("*"))) {
      if (noiseTags.has(el.tagName.toLowerCase())) el.remove();
    }
    const text = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.split(/\s+/).length > 20) return { title, transcript: text };

    // ── Last resort ───────────────────────────────────────────────────────────
    const bodyText = (document.body.textContent ?? "").replace(/\s+/g, " ").trim();
    return bodyText.length > 50 ? { title, transcript: bodyText } : null;
  } catch {
    return null;
  }
}
