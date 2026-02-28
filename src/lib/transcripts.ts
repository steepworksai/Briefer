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
// Runs inside the page via executeScript — must be self-contained, no imports.
// Fetches the caption track entirely within the page context so that YouTube's
// signed caption URLs (which expire and are CORS-restricted outside the page)
// are always called with the correct session cookies and origin.
export async function extractYouTubeTranscriptInPage(): Promise<{ title: string; transcript: string } | null> {
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
        const m = s.textContent?.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
        if (m) {
          try {
            const parsed = JSON.parse(m[1]);
            if (playerMatchesUrl(parsed)) { player = parsed; break; }
          } catch { /* malformed JSON — skip */ }
        }
      }
    }

    if (!playerMatchesUrl(player)) return null;

    const title: string = player?.videoDetails?.title ?? "YouTube Video";
    const tracks: any[] =
      player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

    if (tracks.length === 0) return { title, transcript: "" };

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
    if (!raw) return { title, transcript: "" };

    // Detect whether the signed caption URL has already expired.
    // If so, return null immediately so App.tsx can surface a "refresh page" prompt
    // instead of the misleading "no captions available" message.
    const expireMatch = raw.match(/[?&]expire=(\d+)/);
    if (expireMatch) {
      const expireTs = parseInt(expireMatch[1], 10);
      if (expireTs < Math.floor(Date.now() / 1000)) {
        // Signed URL is expired — signal with null so caller can ask user to refresh
        return null;
      }
    }

    // Helper: parse a raw caption response string (JSON3 or XML) into plain text.
    const parseCaptionBody = (bodyText: string): string => {
      if (!bodyText || bodyText.trim().length === 0) return "";
      if (bodyText.trimStart().startsWith("{")) {
        try {
          const data = JSON.parse(bodyText);
          return (data.events ?? [])
            .flatMap((evt: any) => (evt.segs ?? []).map((s: any) => (s.utf8 ?? "").replace(/\n/g, " ")))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        } catch { return ""; }
      }
      if (bodyText.trimStart().startsWith("<")) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(bodyText, "application/xml");
        const textEls = Array.from(doc.querySelectorAll("text, p"));
        return textEls
          .map((el) => (el.textContent ?? "").replace(/\n/g, " ").trim())
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      }
      return "";
    };

    // Attempt 1: signed baseUrl + json3 format (from ytInitialPlayerResponse)
    const signedJson3Url = raw + (raw.includes("?") ? "&fmt=json3" : "?fmt=json3");
    const resp1 = await fetch(signedJson3Url);
    if (resp1.ok) {
      const body1 = await resp1.text();
      const t1 = parseCaptionBody(body1);
      if (t1.length > 0) return { title, transcript: t1 };
    }

    // Attempt 2: signed baseUrl without fmt (may return XML)
    const resp2 = await fetch(raw);
    if (resp2.ok) {
      const body2 = await resp2.text();
      const t2 = parseCaptionBody(body2);
      if (t2.length > 0) return { title, transcript: t2 };
    }

    // Attempt 3: YouTube public timedtext API.
    // Include kind=asr for auto-generated tracks; this is required for YouTube to
    // return the auto-generated caption data via the unsigned endpoint.
    const lang = (best.languageCode ?? "en").split("-")[0];
    const isAsr = best.kind === "asr";
    const timedtextUrl =
      `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(currentVideoId)}` +
      `&lang=${encodeURIComponent(lang)}` +
      (isAsr ? "&kind=asr" : "") +
      "&fmt=json3";
    const resp3 = await fetch(timedtextUrl);
    if (resp3.ok) {
      const body3 = await resp3.text();
      const t3 = parseCaptionBody(body3);
      if (t3.length > 0) return { title, transcript: t3 };
    }

    // All caption fetch attempts returned empty — video may have no accessible captions
    return { title, transcript: "" };
  } catch {
    return null;
  }
}

// Keep the old name as an alias so any other callers aren't broken
export const extractYouTubeInfoInPage = extractYouTubeTranscriptInPage;

/** @deprecated Use extractYouTubeTranscriptInPage which fetches captions in-page */
export async function fetchYouTubeTranscript(_captionUrl: string): Promise<string> {
  throw new Error("fetchYouTubeTranscript is deprecated; use extractYouTubeTranscriptInPage instead.");
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
