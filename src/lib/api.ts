const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// ─── Single unified prompt ────────────────────────────────────────────────────
const SUMMARY_PROMPT = (text: string) => `
Summarize the following content clearly and usefully.

TLDR: <2-3 plain English sentences — the core point>

KEY POINTS:
- <what it is or does>
- <how it works or why it matters>
- <what makes it useful or important>

TAKEAWAY: <one sentence — the single most memorable or actionable insight>

Rules:
- Max 200 words total.
- Be concrete and specific, not vague.
- Write like you're explaining to a smart friend.
- Skip marketing language and filler.
- If the content is technical, briefly explain the mechanism in Key Points.
- Only include a point if it actually adds something.

Content:
${text}
`.trim();

// ─── Video prompt (no Content: section — video is passed as fileData) ─────────
const VIDEO_PROMPT = `
Summarize this video clearly and usefully.

TLDR: <2-3 plain English sentences — the core point>

KEY POINTS:
- <what it covers or demonstrates>
- <how it works or why it matters>
- <the most useful or important thing shown>

TAKEAWAY: <one sentence — the single most memorable or actionable insight>

Rules:
- Max 200 words total.
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

// ─── Follow-up Q&A ───────────────────────────────────────────────────────────
export async function followUp(question: string, context: string, apiKey: string): Promise<string> {
  const prompt = `Based on this content summary:\n${context}\n\nAnswer this question concisely and helpfully:\n${question}`;

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 512 },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message ?? `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
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
