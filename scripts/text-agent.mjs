/**
 * text-agent.mjs
 * Watches logs/page-text.txt for new content saved by the extension.
 * When a new page is captured, automatically runs it through Gemini
 * in both modes (exploratory + deep) and saves results to logs/experiments/.
 *
 * Run: node scripts/text-agent.mjs
 */

import { watch, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname   = dirname(fileURLToPath(import.meta.url));
const TEXT_FILE   = resolve(__dirname, "../logs/page-text.txt");
const EXP_DIR     = resolve(__dirname, "../logs/experiments");
const ENV_FILE    = resolve(__dirname, "../.env");
const GEMINI_URL  = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// ─── Load API key from .env ───────────────────────────────────────────────────
function loadApiKey() {
  if (!existsSync(ENV_FILE)) return null;
  const lines = readFileSync(ENV_FILE, "utf-8").split("\n");
  for (const line of lines) {
    const [k, v] = line.split("=").map((s) => s.trim());
    if (k === "GEMINI_API_KEY" && v && v !== "your_gemini_key_here") return v;
  }
  return null;
}

// ─── Prompts (mirrors src/lib/api.ts) ────────────────────────────────────────
const EXPLORATORY_PROMPT = (text) => `
Summarize the following content clearly and concisely.

Your summary must:
1. Identify the main topic or central question.
2. Extract the core arguments, insights, or findings.
3. Highlight important examples, evidence, or data points.
4. Note any disagreements or alternative viewpoints (especially for discussions).

Structure the output using EXACTLY these section headers:

TLDR: <3-5 sentences>

MAIN TOPIC:
<1-2 sentences>

KEY POINTS:
- <point>
- <point>
- <point>

FACTS VS OPINIONS:
- FACT: <something verifiable or cited>
- OPINION: <something subjective or argued>
- ASSUMPTION: <something taken for granted without proof, if present>

EVIDENCE:
- <example or data point>
- <example or data point>

COUNTERARGUMENTS:
- <contrasting view, if present — write N/A if none>

TAKEAWAYS:
- <practical insight>
- <practical insight>

Rules:
- If a section does not apply to this content, write N/A and skip it.
- Match the language complexity to the source material.
- Avoid fluff and repetition. Focus on signal.

Content:
${text}
`.trim();

const DEEP_PROMPT = (text) => `
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
- No hard word limit. Use as many words as the content demands.

Content:
${text}
`.trim();

// ─── Gemini call ──────────────────────────────────────────────────────────────
async function callGemini(prompt, apiKey) {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ─── Run both modes and save results ─────────────────────────────────────────
async function runExperiment(content) {
  const apiKey = loadApiKey();
  if (!apiKey) {
    warn("No GEMINI_API_KEY in .env — skipping experiment");
    return;
  }

  // Parse header
  const urlMatch  = content.match(/^URL:\s*(.+)/m);
  const wordMatch = content.match(/^Words:\s*(\d+)/m);
  const pageUrl   = urlMatch?.[1]?.trim() ?? "unknown";
  const wordCount = wordMatch?.[1] ?? "?";
  const textStart = content.indexOf("─".repeat(80));
  const text      = textStart >= 0 ? content.slice(textStart + 80).trim() : content;

  info(`New page captured: ${wordCount} words`);
  info(`URL: ${pageUrl}`);
  info("Running exploratory mode...");

  let exploratoryResult = "";
  let deepResult = "";

  try {
    exploratoryResult = await callGemini(EXPLORATORY_PROMPT(text), apiKey);
    ok("Exploratory done");
  } catch (e) {
    warn(`Exploratory failed: ${e.message}`);
  }

  info("Running deep mode...");
  try {
    deepResult = await callGemini(DEEP_PROMPT(text), apiKey);
    ok("Deep done");
  } catch (e) {
    warn(`Deep failed: ${e.message}`);
  }

  // Save to logs/experiments/{timestamp}-{slug}.txt
  mkdirSync(EXP_DIR, { recursive: true });
  const slug = pageUrl
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]/gi, "-")
    .slice(0, 60);
  const ts       = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = resolve(EXP_DIR, `${ts}-${slug}.txt`);
  const divider  = "═".repeat(80);

  const output = [
    `EXPERIMENT RESULT`,
    `URL:   ${pageUrl}`,
    `Words: ${wordCount}`,
    `Date:  ${new Date().toISOString()}`,
    divider,
    "",
    "[ EXPLORATORY MODE — Quick Read ]",
    divider,
    exploratoryResult || "(failed)",
    "",
    "[ DEEP MODE — Deep Dive ]",
    divider,
    deepResult || "(failed)",
  ].join("\n");

  writeFileSync(filename, output, "utf8");
  ok(`Results saved → ${filename}`);
  console.log("");
}

// ─── File watcher ─────────────────────────────────────────────────────────────
let lastMtime = 0;

function checkFile() {
  if (!existsSync(TEXT_FILE)) return;
  const mtime = statSync(TEXT_FILE).mtimeMs;
  if (mtime <= lastMtime) return;
  lastMtime = mtime;
  const content = readFileSync(TEXT_FILE, "utf-8").trim();
  if (!content) return;
  runExperiment(content).catch((e) => warn(`Experiment error: ${e.message}`));
}

// ─── Output helpers ───────────────────────────────────────────────────────────
function info(msg)  { console.log(`\x1b[36mℹ  [text-agent]\x1b[0m ${msg}`); }
function ok(msg)    { console.log(`\x1b[32m✓  [text-agent]\x1b[0m ${msg}`); }
function warn(msg)  { console.log(`\x1b[33m⚠  [text-agent]\x1b[0m ${msg}`); }

// ─── Boot ─────────────────────────────────────────────────────────────────────
mkdirSync(EXP_DIR, { recursive: true });

if (!existsSync(TEXT_FILE)) {
  writeFileSync(TEXT_FILE, "");
  info(`Created ${TEXT_FILE}`);
}

lastMtime = statSync(TEXT_FILE).mtimeMs;

console.log(`\x1b[36m[text-agent]\x1b[0m Watching ${TEXT_FILE}`);
console.log(`\x1b[36m[text-agent]\x1b[0m Saving experiments to ${EXP_DIR}`);
console.log(`\x1b[36m[text-agent]\x1b[0m Waiting for the extension to capture a page...\n`);

watch(TEXT_FILE, { persistent: true }, (event) => {
  if (event === "change") checkFile();
});

// Poll every 2s as macOS watch fallback
setInterval(checkFile, 2000);
