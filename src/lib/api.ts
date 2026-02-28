const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// ─── Single unified prompt ────────────────────────────────────────────────────
const SUMMARY_PROMPT = (text: string) => `
Summarize the following content comprehensively, extracting the maximum number of distinct key ideas.

TLDR: <2-3 plain English sentences — the core point>

KEY POINTS:
- <extract EVERY distinct idea, concept, mechanism, finding, or insight — aim for 8-12 points>
- <cover technical details, causes, effects, comparisons, and outcomes>
- <do not merge separate ideas — give each its own bullet>
- <be specific and concrete for each point>

TAKEAWAY: <one sentence — the single most memorable or actionable insight>

Rules:
- Extract as many KEY POINTS as needed — do NOT limit to 3 or 5, capture every important idea.
- Be concrete and specific, not vague.
- Write like you're explaining to a smart friend.
- Skip marketing language and filler.
- If the content is technical, explain the mechanism in Key Points.
- Only include a point if it actually adds something new.

Content:
${text}
`.trim();

// ─── Video prompt (no Content: section — video is passed as fileData) ─────────
const VIDEO_PROMPT = `
Summarize this video comprehensively, extracting the maximum number of distinct key ideas.

TLDR: <2-3 plain English sentences — the core point>

KEY POINTS:
- <extract EVERY distinct idea, concept, demonstration, or insight — aim for 8-12 points>
- <cover what is shown, how it works, why it matters, key comparisons and outcomes>
- <do not merge separate ideas — give each its own bullet>

TAKEAWAY: <one sentence — the single most memorable or actionable insight>

Rules:
- Extract as many KEY POINTS as needed — do NOT limit to 3 or 5.
- Be concrete and specific, not vague.
- Write like you're explaining to a smart friend.
- Skip filler and restatements.
`.trim();

// ─── Result type ──────────────────────────────────────────────────────────────
export interface SummaryResult {
  tldr: string;
  keyPoints: string[];
  takeaway: string;
}

// ─── Text summarization ───────────────────────────────────────────────────────
export async function summarize(text: string, apiKey: string): Promise<SummaryResult> {
  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: SUMMARY_PROMPT(text) }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message ?? `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parse(raw);
}

// ─── Video summarization (YouTube URL passed directly to Gemini) ──────────────
export async function summarizeVideo(videoUrl: string, apiKey: string): Promise<SummaryResult> {
  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { fileData: { fileUri: videoUrl, mimeType: "video/*" } },
          { text: VIDEO_PROMPT },
        ],
      }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message ?? `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parse(raw);
}

// ─── Parser ───────────────────────────────────────────────────────────────────
function extractSection(raw: string, header: string): string {
  const regex = new RegExp(
    `${header}[:\\s]*([\\s\\S]*?)(?=\\n[A-Z][A-Z\\s&']+:|$)`,
    "i"
  );
  return raw.match(regex)?.[1]?.trim() ?? "";
}

function extractBullets(raw: string, header: string): string[] {
  return extractSection(raw, header)
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter((l) => l.length > 0 && !/^n\/a$/i.test(l));
}

function extractTldr(raw: string): string {
  return raw.match(/TLDR:\s*(.+?)(?=\n[A-Z]|$)/s)?.[1]?.trim() ?? "";
}

function parse(raw: string): SummaryResult {
  return {
    tldr:      extractTldr(raw),
    keyPoints: extractBullets(raw, "KEY POINTS"),
    takeaway:  extractSection(raw, "TAKEAWAY"),
  };
}
