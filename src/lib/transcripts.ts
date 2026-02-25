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
export function extractYouTubeInfoInPage(): { captionUrl: string | null; title: string } | null {
  try {
    const player = (window as any).ytInitialPlayerResponse;
    if (!player) return null;

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
  const data = await resp.json();

  return (data.events ?? [])
    .flatMap((evt: any) => (evt.segs ?? []).map((s: any) => (s.utf8 ?? "").replace(/\n/g, " ")))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── DeepLearning.AI ──────────────────────────────────────────────────────────
// Runs inside the page via executeScript — must be self-contained, no imports
export function extractDeepLearningTranscriptInPage(): { title: string; transcript: string } | null {
  try {
    // Title: try multiple common selectors
    const titleEl =
      document.querySelector("h1") ??
      document.querySelector("[class*='title']") ??
      document.querySelector("title");
    const title = titleEl?.textContent?.trim() ?? "DeepLearning.AI Video";

    // Transcript: try selectors specific to the platform's transcript panel
    const transcriptSelectors = [
      "[class*='transcript']",
      "[data-purpose*='transcript']",
      ".phrase-text",
      "[class*='subtitle']",
      "[class*='caption']",
      "[class*='Transcript']",
    ];

    for (const sel of transcriptSelectors) {
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length > 0) {
        const text = els.map((el) => el.textContent?.trim()).filter(Boolean).join(" ");
        if (text.split(/\s+/).length > 20) return { title, transcript: text };
      }
    }

    // Fallback: extract main article/content area text (skip nav/header/footer)
    const noiseTags = new Set(["script","style","noscript","nav","header","footer","button","aside"]);
    const container =
      document.querySelector("[class*='content']") ??
      document.querySelector("main") ??
      document.querySelector("article") ??
      document.body;

    const clone = container!.cloneNode(true) as Element;
    for (const el of Array.from(clone.querySelectorAll("*"))) {
      if (noiseTags.has(el.tagName.toLowerCase())) el.remove();
    }

    const text = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
    return text.split(/\s+/).length > 20 ? { title, transcript: text } : null;
  } catch {
    return null;
  }
}
