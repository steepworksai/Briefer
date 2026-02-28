import { useState, useEffect, useRef } from "react";
import type { HistoryEntry } from "../../lib/history";
import {
  getHistory, deleteEntry, updateTopic, clearHistory, groupByTopic,
} from "../../lib/history";

interface Props {
  onLoad: (entry: HistoryEntry) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function domain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

function matchesSearch(entry: HistoryEntry, q: string): boolean {
  const s = q.toLowerCase();
  return (
    entry.topic.toLowerCase().includes(s) ||
    entry.pageTitle.toLowerCase().includes(s) ||
    entry.url.toLowerCase().includes(s) ||
    entry.result.tldr.toLowerCase().includes(s)
  );
}

export function History({ onLoad }: Props) {
  const [entries, setEntries]       = useState<HistoryEntry[]>([]);
  const [search, setSearch]         = useState("");
  const [collapsed, setCollapsed]   = useState<Set<string>>(new Set());
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editTopic, setEditTopic]   = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);
  useEffect(() => { if (editingId) editRef.current?.focus(); }, [editingId]);

  async function load() {
    setEntries(await getHistory());
  }

  async function handleDelete(id: string) {
    await deleteEntry(id);
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  async function handleClear() {
    if (!confirm("Clear all saved summaries?")) return;
    await clearHistory();
    setEntries([]);
  }

  async function commitTopicEdit(id: string) {
    const topic = editTopic.trim();
    if (topic) {
      await updateTopic(id, topic);
      setEntries(prev => prev.map(e => e.id === id ? { ...e, topic } : e));
    }
    setEditingId(null);
  }

  const filtered = search
    ? entries.filter(e => matchesSearch(e, search))
    : entries;

  const groups = groupByTopic(filtered);
  const topicOrder = Array.from(groups.keys()).sort();

  function toggleCollapse(topic: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(topic) ? next.delete(topic) : next.add(topic);
      return next;
    });
  }

  if (entries.length === 0) {
    return (
      <div className="history-empty">
        <span>📚</span>
        <p>No saved summaries yet.</p>
        <p className="history-empty__sub">Summaries are saved automatically.</p>
      </div>
    );
  }

  return (
    <div className="history">
      <div className="history__toolbar">
        <input
          className="history__search"
          type="text"
          placeholder="Search topics, titles…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="history__clear" onClick={handleClear} title="Clear all">🗑</button>
      </div>

      {filtered.length === 0 && (
        <div className="history-empty">
          <p>No results for "{search}"</p>
        </div>
      )}

      <div className="history__groups">
        {topicOrder.map(topic => {
          const group = groups.get(topic)!;
          const isOpen = !collapsed.has(topic);
          return (
            <div key={topic} className="history__topic">
              <button
                className="history__topic-hd"
                onClick={() => toggleCollapse(topic)}
              >
                <span className="history__topic-arrow">{isOpen ? "▾" : "▸"}</span>
                <span className="history__topic-name">{topic}</span>
                <span className="history__topic-count">{group.length}</span>
              </button>

              {isOpen && (
                <ul className="history__entries">
                  {group.map(entry => (
                    <li key={entry.id} className="history__entry">
                      <div className="history__entry-main">
                        <button
                          className="history__entry-title"
                          onClick={() => onLoad(entry)}
                          title={entry.url}
                        >
                          {entry.pageTitle || domain(entry.url)}
                        </button>
                        <span className="history__entry-meta">
                          {domain(entry.url)} · {timeAgo(entry.savedAt)}
                        </span>
                      </div>

                      <div className="history__entry-actions">
                        {editingId === entry.id ? (
                          <input
                            ref={editRef}
                            className="history__topic-edit"
                            value={editTopic}
                            onChange={e => setEditTopic(e.target.value)}
                            onBlur={() => commitTopicEdit(entry.id)}
                            onKeyDown={e => {
                              if (e.key === "Enter") commitTopicEdit(entry.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                        ) : (
                          <button
                            className="history__action-btn"
                            title="Move to topic"
                            onClick={() => { setEditingId(entry.id); setEditTopic(entry.topic); }}
                          >📁</button>
                        )}
                        <button
                          className="history__action-btn history__action-btn--danger"
                          title="Delete"
                          onClick={() => handleDelete(entry.id)}
                        >🗑</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
