const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// ─── Prompt 1: Exploratory ────────────────────────────────────────────────────
const EXPLORATORY_PROMPT = (text: string) => `
Give me a quick, plain-English summary of the following content. Be brief and natural — no fluff.

TLDR: <2-3 sentences>

KEY POINTS:
- <point>
- <point>
- <point>

TAKEAWAY: <one sentence — the single most useful thing to remember>

Rules:
- Max 150 words total.
- Write like you're explaining to a friend. Skip jargon.
- Only include a point if it actually matters.

Content:
${text}
`.trim();

// ─── Prompt 2: Deep Extraction ────────────────────────────────────────────────
const DEEP_PROMPT = (text: string) => `
Summarize the following content in a high-depth format. Prioritise depth and precision over brevity.

Your summary must:
1. Clearly state the core problem being solved.
2. Explain the mechanism of the solution — how it works conceptually, not just what it is.
3. Identify the structural or architectural shift introduced.
4. Explain why this approach is better than the previous system or alternatives.
5. Highlight any design principles, tradeoffs, or abstractions involved.
6. Capture the organizational or strategic impact.

Do not restate marketing language. Focus on mechanisms, structural changes, and implications.

Structure the output using EXACTLY these section headers:

TLDR: <3-5 sentences>

CORE PROBLEM:
<what fundamental problem is being addressed>

SOLUTION MECHANISM:
<how it works conceptually — not just what it is>

STRUCTURAL SHIFT:
<what changes architecturally, organizationally, or systematically — write N/A if not applicable>

WHY IT'S BETTER:
- <advantage over previous approach>
- <advantage over alternatives>

KEY TAKEAWAYS:
- <high-signal insight>
- <high-signal insight>
- <high-signal insight>

Rules:
- If a section does not apply to this content type, write N/A and skip it.
- Match the language complexity to the source material.
- Do not pad sections — if there is nothing meaningful to say, write N/A.
- Total output must not exceed 250 words.

Content:
${text}
`.trim();

// ─── Result types ─────────────────────────────────────────────────────────────
export interface ExploratoryResult {
  mode: "exploratory";
  tldr: string;
  keyPoints: string[];
  takeaway: string;
}

export interface DeepResult {
  mode: "deep";
  tldr: string;
  coreProblem: string;
  solutionMechanism: string;
  structuralShift: string;
  whyItsBetter: string[];
  keyTakeaways: string[];
}

export type SummaryResult = ExploratoryResult | DeepResult;
export type SummaryMode   = "exploratory" | "deep";

// ─── API call ─────────────────────────────────────────────────────────────────
export async function summarize(
  text: string,
  apiKey: string,
  mode: SummaryMode
): Promise<SummaryResult> {
  const prompt = mode === "deep" ? DEEP_PROMPT(text) : EXPLORATORY_PROMPT(text);

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err?.error?.message ?? `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  return mode === "deep" ? parseDeep(raw) : parseExploratory(raw);
}

// ─── Parsers ──────────────────────────────────────────────────────────────────
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
    .filter((l) => l.length > 0);
}

function extractTldr(raw: string): string {
  return raw.match(/TLDR:\s*(.+?)(?=\n[A-Z]|$)/s)?.[1]?.trim() ?? "";
}

function parseExploratory(raw: string): ExploratoryResult {
  return {
    mode:      "exploratory",
    tldr:      extractTldr(raw),
    keyPoints: extractBullets(raw, "KEY POINTS").filter((l) => !/^n\/a$/i.test(l.trim())),
    takeaway:  extractSection(raw, "TAKEAWAY"),
  };
}

function isNA(text: string) {
  return /^n\/a$/i.test(text.trim());
}

function parseDeep(raw: string): DeepResult {
  const bullets = (header: string) =>
    extractBullets(raw, header).filter((l) => !isNA(l));

  return {
    mode:              "deep",
    tldr:              extractTldr(raw),
    coreProblem:       extractSection(raw, "CORE PROBLEM"),
    solutionMechanism: extractSection(raw, "SOLUTION MECHANISM"),
    structuralShift:   isNA(extractSection(raw, "STRUCTURAL SHIFT")) ? "" : extractSection(raw, "STRUCTURAL SHIFT"),
    whyItsBetter:      bullets("WHY IT'S BETTER"),
    keyTakeaways:      bullets("KEY TAKEAWAYS"),
  };
}
