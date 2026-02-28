import { useState, useEffect } from "react";
import "./Options.css";

export default function Options() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get("geminiApiKey", (result: { geminiApiKey?: string }) => {
      if (result.geminiApiKey) setApiKey(result.geminiApiKey);
    });
  }, []);

  function handleSave() {
    chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="options">
      <h1>⚡ Briefer Settings</h1>

      <div className="field">
        <label htmlFor="apiKey">Google Gemini API Key</label>
        <input
          id="apiKey"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza..."
        />
        <p className="hint">
          Get a free key at{" "}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
          >
            aistudio.google.com
          </a>
        </p>
      </div>

      <button onClick={handleSave}>{saved ? "Saved!" : "Save"}</button>

      <p className="footer">Briefer © 2026 SteepWorksAi</p>
    </div>
  );
}
