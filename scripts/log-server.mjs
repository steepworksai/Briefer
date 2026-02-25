/**
 * log-server.mjs
 * Lightweight HTTP server that receives log entries from the extension
 * and writes them to logs/latest.log
 *
 * Run: node scripts/log-server.mjs
 */

import { createServer } from "http";
import { createWriteStream, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR   = resolve(__dirname, "../logs");
const LOG_FILE  = resolve(LOG_DIR, "latest.log");
const TEXT_FILE = resolve(LOG_DIR, "page-text.txt");
const PORT = 3747;

mkdirSync(LOG_DIR, { recursive: true });
const stream = createWriteStream(LOG_FILE, { flags: "a" });

function formatLine(entry) {
  const time = new Date(entry.ts).toISOString();
  const level = (entry.level ?? "info").toUpperCase().padEnd(5);
  const ctx   = (entry.context ?? "?").padEnd(10);
  return `[${time}] [${level}] [${ctx}] ${entry.message}`;
}

const server = createServer((req, res) => {
  // CORS so the extension (chrome-extension://) can POST here
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/log") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const entry = JSON.parse(body);
        const line  = formatLine(entry);
        stream.write(line + "\n");
        process.stdout.write(colorize(entry.level, line) + "\n");
      } catch {
        // ignore malformed entries
      }
      res.writeHead(200);
      res.end();
    });
    return;
  }

  if (req.method === "POST" && req.url === "/save-text") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { url, text, wordCount, ts } = JSON.parse(body);
        const header = `URL: ${url}\nWords: ${wordCount}\nSaved: ${new Date(ts).toISOString()}\n${"─".repeat(80)}\n\n`;
        writeFileSync(TEXT_FILE, header + text, "utf8");
        process.stdout.write(`\x1b[36m[log-server]\x1b[0m Saved ${wordCount} words from ${url}\n`);
        process.stdout.write(`\x1b[36m[log-server]\x1b[0m → ${TEXT_FILE}\n`);
      } catch {
        // ignore
      }
      res.writeHead(200);
      res.end();
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

function colorize(level, line) {
  const codes = { error: "\x1b[31m", warn: "\x1b[33m", info: "\x1b[0m" };
  const reset = "\x1b[0m";
  return (codes[level] ?? "") + line + reset;
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\x1b[36m[log-server]\x1b[0m Listening on http://localhost:${PORT}`);
  console.log(`\x1b[36m[log-server]\x1b[0m Writing to ${LOG_FILE}`);
  console.log(`\x1b[36m[log-server]\x1b[0m Waiting for extension logs...\n`);
});
