/**
 * log-agent.mjs
 * Watches logs/latest.log and reacts to new entries with suggestions.
 *
 * Run: node scripts/log-agent.mjs
 */

import { watch, readFileSync, statSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE  = resolve(__dirname, "../logs/latest.log");

// ─── Reaction rules ──────────────────────────────────────────────────────────
// Each rule: { match: RegExp, level: string, react: (line) => void }
const RULES = [
  {
    match: /No API key found/i,
    react: () => suggest(
      "No API key configured",
      "Open the side panel → it will show the token setup form.",
      "Paste your Gemini API key (AIza...) and click 'Save & Summarize'.",
      "Get a free key at https://aistudio.google.com/app/apikey"
    ),
  },
  {
    match: /https:\/\/api-inference\.huggingface\.co is no longer supported/i,
    react: () => suggest(
      "Deprecated HuggingFace endpoint",
      "Update HF_API_URL in src/lib/api.ts to:",
      "  https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn"
    ),
  },
  {
    match: /is not found for API version|not supported for generateContent/i,
    react: () => suggest(
      "Gemini model not found",
      "The model name in api.ts may be outdated.",
      "Current model: gemini-2.5-flash",
      "Check https://ai.google.dev/gemini-api/docs/models for latest model names."
    ),
  },
  {
    match: /401|unauthorized|Invalid credentials/i,
    react: () => suggest(
      "HuggingFace API auth failed (401)",
      "Your token may be invalid or expired.",
      "Get a new token → https://huggingface.co/settings/tokens/new?tokenType=read",
      "Then update it in the side panel token setup form."
    ),
  },
  {
    match: /429|rate limit|too many requests/i,
    react: () => suggest(
      "Rate limit hit (429)",
      "You've exceeded the free tier request limit.",
      "Wait a minute and retry, or upgrade your HuggingFace account."
    ),
  },
  {
    match: /Model .* is currently loading/i,
    react: () => suggest(
      "Model cold start",
      "The BART model is warming up (free tier sleeps after inactivity).",
      "The request will auto-retry — just wait 20-30 seconds."
    ),
  },
  {
    match: /Cannot access contents of the page/i,
    react: () => suggest(
      "Script injection blocked",
      "The extension can't read this page's content.",
      "This happens on: chrome:// pages, the Chrome Web Store, or PDF viewers.",
      "Try on a regular web page (news article, blog, docs)."
    ),
  },
  {
    match: /Not enough content found/i,
    react: () => suggest(
      "Page has too little text",
      "The page may be: a login wall, a SPA that loads content dynamically, or mostly images.",
      "Try scrolling the page fully first, then re-open the panel."
    ),
  },
  {
    match: /No active tab/i,
    react: () => suggest(
      "No active tab detected",
      "Make sure you have a web page open before clicking the extension icon.",
      "The panel can't summarize an empty tab or a new tab page."
    ),
  },
  {
    match: /Extracted (\d+) words/i,
    react: (line) => {
      const match = line.match(/Extracted (\d+) words/i);
      const count = match ? parseInt(match[1], 10) : 0;
      if (count > 3000) {
        info(`Large page detected (${count} words) — only first ~2100 words will be summarized (BART limit).`);
      }
    },
  },
  {
    match: /Summary generated successfully/i,
    react: () => ok("Summary pipeline completed successfully."),
  },
];

// ─── Output helpers ───────────────────────────────────────────────────────────
function suggest(title, ...lines) {
  console.log(`\n\x1b[33m⚠  ${title}\x1b[0m`);
  lines.forEach((l) => console.log(`   ${l}`));
}

function info(msg) {
  console.log(`\x1b[36mℹ  ${msg}\x1b[0m`);
}

function ok(msg) {
  console.log(`\x1b[32m✓  ${msg}\x1b[0m`);
}

// ─── File watcher ─────────────────────────────────────────────────────────────
let lastSize = 0;

function getNewLines() {
  if (!existsSync(LOG_FILE)) return [];
  const size = statSync(LOG_FILE).size;
  if (size <= lastSize) { lastSize = size; return []; }
  const buf  = readFileSync(LOG_FILE, "utf-8");
  const newContent = buf.slice(lastSize);
  lastSize = size;
  return newContent.split("\n").filter((l) => l.trim());
}

function processLines(lines) {
  for (const line of lines) {
    // Only react to WARN and ERROR lines
    if (!line.includes("[WARN") && !line.includes("[ERROR")) {
      // Still react to specific INFO patterns
      const infoRule = RULES.find(
        (r) => line.includes("[INFO") && r.match.test(line)
      );
      if (infoRule) infoRule.react(line);
      continue;
    }

    const rule = RULES.find((r) => r.match.test(line));
    if (rule) {
      console.log(`\x1b[90m→ ${line}\x1b[0m`);
      rule.react(line);
    } else {
      console.log(`\x1b[31m→ ${line}\x1b[0m`);
    }
  }
}

// Ensure the log file exists before watching
if (!existsSync(LOG_FILE)) {
  writeFileSync(LOG_FILE, "");
  console.log(`\x1b[36m[log-agent]\x1b[0m Created ${LOG_FILE}`);
}

// Seed lastSize from current file size on startup
lastSize = statSync(LOG_FILE).size;

console.log(`\x1b[36m[log-agent]\x1b[0m Watching ${LOG_FILE}`);
console.log(`\x1b[36m[log-agent]\x1b[0m Reacting to new log entries...\n`);

watch(LOG_FILE, { persistent: true }, (event) => {
  if (event === "change") {
    const lines = getNewLines();
    processLines(lines);
  }
});

// Also poll every 2s in case watch misses events (macOS quirk)
setInterval(() => {
  const lines = getNewLines();
  if (lines.length) processLines(lines);
}, 2000);
