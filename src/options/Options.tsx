import { useState, useEffect } from "react";
import "./Options.css";

export default function Options() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get("hfApiKey", (result: { hfApiKey?: string }) => {
      if (result.hfApiKey) setApiKey(result.hfApiKey);
    });
  }, []);

  function handleSave() {
    chrome.storage.sync.set({ hfApiKey: apiKey }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="options">
      <h1>⚡ QuickRead Settings</h1>

      <div className="field">
        <label htmlFor="apiKey">HuggingFace API Token</label>
        <input
          id="apiKey"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="hf_..."
        />
        <p className="hint">
          Get a free token at{" "}
          <a
            href="https://huggingface.co/settings/tokens/new?tokenType=read"
            target="_blank"
            rel="noreferrer"
          >
            huggingface.co/settings/tokens
          </a>
        </p>
      </div>

      <button onClick={handleSave}>{saved ? "Saved!" : "Save"}</button>
    </div>
  );
}
