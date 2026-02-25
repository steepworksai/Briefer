import { useState, useEffect } from "react";
import { getLogs, clearLogs, type LogEntry } from "../../lib/logger";

const LEVEL_COLOR: Record<string, string> = {
  info:  "#6b7280",
  warn:  "#d97706",
  error: "#dc2626",
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function exportLogs(entries: LogEntry[]) {
  const lines = entries.map(
    (e) => `[${new Date(e.ts).toISOString()}] [${e.level.toUpperCase()}] [${e.context}] ${e.message}`
  );
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quickread-logs-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function LogViewer() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const logs = await getLogs();
    setEntries([...logs].reverse()); // newest first
  }

  async function handleClear() {
    await clearLogs();
    setEntries([]);
  }

  return (
    <div className="log-viewer">
      <div className="log-viewer__toolbar">
        <span className="log-viewer__count">{entries.length} entries</span>
        <button onClick={() => exportLogs([...entries].reverse())}>Export</button>
        <button onClick={handleClear}>Clear</button>
        <button onClick={load}>Refresh</button>
      </div>

      {entries.length === 0 ? (
        <p className="log-viewer__empty">No logs yet.</p>
      ) : (
        <ul className="log-viewer__list">
          {entries.map((e, i) => (
            <li key={i} className="log-viewer__entry">
              <span className="log-viewer__time">{formatTime(e.ts)}</span>
              <span
                className="log-viewer__level"
                style={{ color: LEVEL_COLOR[e.level] }}
              >
                {e.level.toUpperCase()}
              </span>
              <span className="log-viewer__context">{e.context}</span>
              <span className="log-viewer__message">{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
