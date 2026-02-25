import { useState } from "react";
import { useSpeech, type SpeechEngine } from "../hooks/useSpeech";
import { ELEVENLABS_VOICES } from "../../lib/elevenlabs";

interface SpeechPlayerProps {
  text: string;
}

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

function voiceLabel(name: string) {
  return name.replace("Google ", "").replace(" (Natural)", "");
}

export function SpeechPlayer({ text }: SpeechPlayerProps) {
  const {
    status, rate, engine,
    browserVoices, selectedBrowserVoice,
    elVoiceId, elApiKey,
    setEngine, setElVoiceId, setSelectedBrowserVoice,
    saveElApiKey,
    speak, pause, resume, stop, changeRate,
  } = useSpeech(text);

  const [showElKeyInput, setShowElKeyInput] = useState(false);
  const [keyDraft, setKeyDraft]             = useState("");

  const isIdle    = status === "idle";
  const isLoading = status === "loading";
  const isPlaying = status === "playing";
  const isPaused  = status === "paused";

  function handleEngineSwitch(e: SpeechEngine) {
    stop();
    setEngine(e);
    if (e === "elevenlabs" && !elApiKey) setShowElKeyInput(true);
  }

  function handleSaveKey() {
    saveElApiKey(keyDraft.trim());
    setShowElKeyInput(false);
    setKeyDraft("");
  }

  return (
    <div className="speech-player">

      {/* Engine toggle */}
      <div className="speech-engine">
        <button
          className={`speech-engine__btn ${engine === "browser" ? "speech-engine__btn--active" : ""}`}
          onClick={() => handleEngineSwitch("browser")}
        >
          Browser
        </button>
        <button
          className={`speech-engine__btn ${engine === "elevenlabs" ? "speech-engine__btn--active" : ""}`}
          onClick={() => handleEngineSwitch("elevenlabs")}
        >
          ElevenLabs ✦
        </button>
        {engine === "elevenlabs" && elApiKey && (
          <button
            className="speech-engine__reset"
            onClick={() => setShowElKeyInput(true)}
            title="Change API key"
          >
            🔑
          </button>
        )}
      </div>

      {/* ElevenLabs key input */}
      {showElKeyInput && (
        <div className="speech-el-setup">
          <input
            type="password"
            placeholder="ElevenLabs API key..."
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
            autoFocus
          />
          <button onClick={handleSaveKey} disabled={!keyDraft.trim()}>Save</button>
          <a
            href="https://elevenlabs.io/app/settings/api-keys"
            target="_blank"
            rel="noreferrer"
          >
            Get free key →
          </a>
        </div>
      )}

      {/* Voice selector */}
      {!showElKeyInput && (
        <div className="speech-voice">
          <label>Voice</label>
          {engine === "elevenlabs" ? (
            <select
              value={elVoiceId}
              onChange={(e) => setElVoiceId(e.target.value)}
            >
              {ELEVENLABS_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.description}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={selectedBrowserVoice?.name ?? ""}
              onChange={(e) => {
                const v = browserVoices.find((bv) => bv.name === e.target.value);
                if (v) setSelectedBrowserVoice(v);
              }}
            >
              {browserVoices.map((v) => (
                <option key={v.name} value={v.name}>
                  {voiceLabel(v.name)}{!v.localService ? " ✦" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Playback controls */}
      {!showElKeyInput && (
        <div className="speech-player__controls">
          {(isIdle || isLoading) && (
            <button
              className="speech-btn speech-btn--play"
              onClick={speak}
              disabled={isLoading}
            >
              {isLoading ? "Loading..." : "▶ Read Aloud"}
            </button>
          )}
          {isPlaying && (
            <button className="speech-btn speech-btn--pause" onClick={pause}>
              ⏸ Pause
            </button>
          )}
          {isPaused && (
            <button className="speech-btn speech-btn--play" onClick={resume}>
              ▶ Resume
            </button>
          )}
          {!isIdle && !isLoading && (
            <button className="speech-btn speech-btn--stop" onClick={stop}>⏹</button>
          )}

          <div className="speech-rate">
            {RATES.map((r) => (
              <button
                key={r}
                className={`speech-rate__btn ${rate === r ? "speech-rate__btn--active" : ""}`}
                onClick={() => changeRate(r)}
              >
                {r}×
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      {isLoading && (
        <div className="speech-player__status">
          <span className="speech-pulse" /> Generating audio...
        </div>
      )}
      {isPlaying && (
        <div className="speech-player__status">
          <span className="speech-pulse" />
          {engine === "elevenlabs"
            ? `ElevenLabs · ${ELEVENLABS_VOICES.find((v) => v.id === elVoiceId)?.name ?? ""}...`
            : `${voiceLabel(selectedBrowserVoice?.name ?? "Browser")}...`}
        </div>
      )}
      {isPaused && (
        <div className="speech-player__status speech-player__status--paused">Paused</div>
      )}


    </div>
  );
}
