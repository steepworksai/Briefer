interface ToolbarProps {
  summary: string;
  onRefresh: () => void;
}

export function Toolbar({ summary, onRefresh }: ToolbarProps) {
  function handleCopy() {
    navigator.clipboard.writeText(summary);
  }

  return (
    <div className="toolbar">
      <button onClick={handleCopy} title="Copy summary">
        Copy
      </button>
      <button onClick={onRefresh} title="Re-summarize">
        Refresh
      </button>
      <a
        href={chrome.runtime.getURL("src/options/index.html")}
        target="_blank"
        rel="noreferrer"
        title="Settings"
      >
        Settings
      </a>
    </div>
  );
}
