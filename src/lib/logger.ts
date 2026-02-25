export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  ts: number;       // timestamp ms
  level: LogLevel;
  context: string;  // e.g. "background", "popup", "extractor"
  message: string;
}

const MAX_ENTRIES = 200;
const STORAGE_KEY = "qr_logs";
const DEV_SERVER  = "http://localhost:3747/log";

async function write(level: LogLevel, context: string, message: string) {
  const entry: LogEntry = { ts: Date.now(), level, context, message };

  // Mirror to devtools console
  const prefix = `[QuickRead:${context}]`;
  if (level === "error") console.error(prefix, message);
  else if (level === "warn") console.warn(prefix, message);
  else console.log(prefix, message);

  // Forward to local log server (dev only — silently ignored if not running)
  fetch(DEV_SERVER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).catch(() => {});

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const entries: LogEntry[] = (stored[STORAGE_KEY] as LogEntry[]) ?? [];
  entries.push(entry);

  // Keep only the last MAX_ENTRIES
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

  await chrome.storage.local.set({ [STORAGE_KEY]: entries });
}

export const logger = {
  info:  (context: string, message: string) => write("info",  context, message),
  warn:  (context: string, message: string) => write("warn",  context, message),
  error: (context: string, message: string) => write("error", context, message),
};

export async function getLogs(): Promise<LogEntry[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as LogEntry[]) ?? [];
}

export async function clearLogs() {
  await chrome.storage.local.remove(STORAGE_KEY);
}
