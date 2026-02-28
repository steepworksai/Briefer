import type { SummaryResult } from "./api";

export type HistoryEntry = {
  id: string;
  url: string;
  pageTitle: string;
  topic: string;
  savedAt: number;
  platform?: string;
  result: SummaryResult;
};

const KEY = "summaryHistory";
const MAX_ENTRIES = 100;

const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","could",
  "should","may","might","shall","can","this","that","these",
  "those","it","its","how","why","what","when","where","who",
  "which","and","or","but","in","on","at","to","of","for",
  "with","by","from","as","into","through","about","after",
  "new","use","using","used","makes","make","made","get",
]);

export function deriveTopic(result: SummaryResult, pageTitle?: string): string {
  // Strip site suffix from title (e.g. "Article | Medium" → "Article")
  if (pageTitle) {
    const clean = pageTitle.split(/\s*[|\-–—]\s*/)[0].trim();
    if (clean.length >= 4 && clean.length <= 48) return clean;
  }
  // Fall back: first 4 meaningful words from TLDR
  const words = result.tldr
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z]/g, ""))
    .filter(w => w.length > 3 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 4);
  return words.join(" ") || "General";
}

export async function getHistory(): Promise<HistoryEntry[]> {
  return new Promise(resolve => {
    chrome.storage.local.get(KEY, data => {
      resolve((data[KEY] as HistoryEntry[]) ?? []);
    });
  });
}

export async function saveEntry(entry: Omit<HistoryEntry, "id" | "savedAt">): Promise<void> {
  const history = await getHistory();
  const newEntry: HistoryEntry = {
    ...entry,
    id: Date.now().toString(),
    savedAt: Date.now(),
  };
  // Deduplicate by URL — keep latest
  const deduped = history.filter(e => e.url !== entry.url);
  const trimmed = [newEntry, ...deduped].slice(0, MAX_ENTRIES);
  return new Promise(resolve => {
    chrome.storage.local.set({ [KEY]: trimmed }, resolve);
  });
}

export async function deleteEntry(id: string): Promise<void> {
  const history = await getHistory();
  return new Promise(resolve => {
    chrome.storage.local.set({ [KEY]: history.filter(e => e.id !== id) }, resolve);
  });
}

export async function updateTopic(id: string, topic: string): Promise<void> {
  const history = await getHistory();
  return new Promise(resolve => {
    chrome.storage.local.set({
      [KEY]: history.map(e => e.id === id ? { ...e, topic } : e),
    }, resolve);
  });
}

export async function clearHistory(): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.local.set({ [KEY]: [] }, resolve);
  });
}

export function groupByTopic(entries: HistoryEntry[]): Map<string, HistoryEntry[]> {
  const map = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const group = map.get(e.topic) ?? [];
    group.push(e);
    map.set(e.topic, group);
  }
  return map;
}
