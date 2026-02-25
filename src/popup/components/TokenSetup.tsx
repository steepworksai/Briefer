import { useState } from "react";

interface TokenSetupProps {
  onSaved: () => void;
}

export function TokenSetup({ onSaved }: TokenSetupProps) {
  const [token, setToken]   = useState("");
  const [error, setError]   = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Please enter your API key");
      return;
    }
    setSaving(true);
    await chrome.storage.sync.set({ geminiApiKey: trimmed });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="token-setup">
      <div className="token-setup__icon">✦</div>
      <h2>Connect Google Gemini</h2>
      <p>Paste your free Gemini API key to start summarizing pages.</p>

      <div className="token-setup__field">
        <input
          type="password"
          placeholder="AIza..."
          value={token}
          onChange={(e) => { setToken(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          autoFocus
        />
        {error && <span className="token-setup__error">{error}</span>}
      </div>

      <button onClick={handleSave} disabled={saving || !token}>
        {saving ? "Saving..." : "Save & Summarize"}
      </button>

      <a
        href="https://aistudio.google.com/app/apikey"
        target="_blank"
        rel="noreferrer"
      >
        Get a free key at Google AI Studio →
      </a>
    </div>
  );
}
