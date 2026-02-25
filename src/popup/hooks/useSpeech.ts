import { useState, useEffect, useRef, useCallback } from "react";
import { elevenLabsTTS, ELEVENLABS_VOICES } from "../../lib/elevenlabs";

export type SpeechStatus = "idle" | "loading" | "playing" | "paused";
export type SpeechEngine  = "elevenlabs" | "browser";

const BROWSER_VOICE_PRIORITY = [
  "Google US English",
  "Google UK English Female",
  "Google UK English Male",
  "Samantha",
  "Alex",
];

export function pickBestBrowserVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  for (const name of BROWSER_VOICE_PRIORITY) {
    const match = voices.find((v) => v.name === name);
    if (match) return match;
  }
  return voices.find((v) => !v.localService && v.lang.startsWith("en"))
    ?? voices.find((v) => v.lang.startsWith("en"))
    ?? null;
}

export function useSpeech(text: string) {
  const [status, setStatus]           = useState<SpeechStatus>("idle");
  const [rate, setRate]               = useState(1);
  const [engine, setEngine]           = useState<SpeechEngine>("browser");

  // Browser voice state
  const [browserVoices, setBrowserVoices]           = useState<SpeechSynthesisVoice[]>([]);
  const [selectedBrowserVoice, setSelectedBrowserVoice] = useState<SpeechSynthesisVoice | null>(null);

  // ElevenLabs voice state
  const [elVoiceId, setElVoiceId]     = useState(ELEVENLABS_VOICES[0].id);
  const [elApiKey, setElApiKey]       = useState("");

  // Audio element for ElevenLabs playback
  const audioRef     = useRef<HTMLAudioElement | null>(null);
  const audioBlobUrl = useRef<string | null>(null);


  // Load browser voices
  const loadBrowserVoices = useCallback(() => {
    const all = window.speechSynthesis.getVoices();
    if (all.length === 0) return;
    const english = all.filter((v) => v.lang.startsWith("en"));
    setBrowserVoices(english);
    setSelectedBrowserVoice((prev) => prev ?? pickBestBrowserVoice(english));
  }, []);

  useEffect(() => {
    loadBrowserVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadBrowserVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadBrowserVoices);
    };
  }, [loadBrowserVoices]);

  // Load saved ElevenLabs key
  useEffect(() => {
    chrome.storage.sync.get("elApiKey", (res: { elApiKey?: string }) => {
      if (res.elApiKey) {
        setElApiKey(res.elApiKey);
        setEngine("elevenlabs");
      }
    });
  }, []);

  // Cleanup on text change
  useEffect(() => {
    stopAll();
  }, [text]);

  function stopAll() {
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioBlobUrl.current) {
      URL.revokeObjectURL(audioBlobUrl.current);
      audioBlobUrl.current = null;
    }
    setStatus("idle");
  }

  // ── ElevenLabs playback ────────────────────────────────────────────────────
  async function speakElevenLabs() {
    stopAll();
    setStatus("loading");
    try {
      const url = await elevenLabsTTS(text, elVoiceId, elApiKey);
      audioBlobUrl.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.playbackRate = rate;
      audio.onplay  = () => setStatus("playing");
      audio.onpause = () => setStatus("paused");
      audio.onended = () => { setStatus("idle"); URL.revokeObjectURL(url); };
      audio.onerror = () => setStatus("idle");
      await audio.play();
    } catch {
      setStatus("idle");
    }
  }

  // ── Browser TTS playback ───────────────────────────────────────────────────
  function speakBrowser() {
    stopAll();
    const utterance    = new SpeechSynthesisUtterance(text);
    utterance.rate     = rate;
    utterance.lang     = "en-US";
    if (selectedBrowserVoice) utterance.voice = selectedBrowserVoice;
    utterance.onstart  = () => setStatus("playing");
    utterance.onend    = () => setStatus("idle");
    utterance.onerror  = () => setStatus("idle");
    utterance.onpause  = () => setStatus("paused");
    utterance.onresume = () => setStatus("playing");
    window.speechSynthesis.speak(utterance);
  }

  function speak() {
    engine === "elevenlabs" && elApiKey ? speakElevenLabs() : speakBrowser();
  }

  function pause() {
    if (engine === "elevenlabs" && audioRef.current) {
      audioRef.current.pause();
    } else {
      window.speechSynthesis.pause();
    }
    setStatus("paused");
  }

  function resume() {
    if (engine === "elevenlabs" && audioRef.current) {
      audioRef.current.play();
    } else {
      window.speechSynthesis.resume();
    }
    setStatus("playing");
  }

  function changeRate(newRate: number) {
    setRate(newRate);
    if (audioRef.current) audioRef.current.playbackRate = newRate;
  }

  function saveElApiKey(key: string) {
    setElApiKey(key);
    chrome.storage.sync.set({ elApiKey: key });
    setEngine("elevenlabs");
  }

  return {
    status, rate, engine,
    browserVoices, selectedBrowserVoice,
    elVoiceId, elApiKey,
    setEngine,
    setElVoiceId,
    setSelectedBrowserVoice: (v: SpeechSynthesisVoice) => setSelectedBrowserVoice(v),
    saveElApiKey,
    speak, pause, resume, stop: stopAll, changeRate,
  };
}
