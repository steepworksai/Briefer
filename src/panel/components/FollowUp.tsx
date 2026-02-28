import { useState, useRef } from "react";

interface FollowUpProps {
  context: string;
  apiKey: string;
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: { [0]: { [0]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSpeechRecognition = (): (new () => SpeechRec) | undefined =>
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

export function FollowUp({ context, apiKey }: FollowUpProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer]     = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRec | null>(null);

  async function handleAsk() {
    if (!question.trim() || loading) return;
    setLoading(true);
    setAnswer(null);
    const response = await chrome.runtime.sendMessage({
      type: "FOLLOW_UP",
      payload: { question: question.trim(), context, apiKey },
    });
    setLoading(false);
    setAnswer(response.success ? response.answer : `Error: ${response.error}`);
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SR = getSpeechRecognition();
    if (!SR) return;

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      setQuestion(e.results[0][0].transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend   = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div className="follow-up">
      <div className="follow-up__input-row">
        <button
          className={`follow-up__mic ${listening ? "follow-up__mic--active" : ""}`}
          onClick={toggleVoice}
          title={listening ? "Stop recording" : "Ask by voice"}
        >
          🎙
        </button>
        <input
          type="text"
          className="follow-up__input"
          placeholder="Ask a follow-up question..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
        />
        <button
          className="follow-up__btn"
          onClick={handleAsk}
          disabled={!question.trim() || loading}
        >
          {loading ? "..." : "Ask"}
        </button>
      </div>

      {answer && (
        <div className="follow-up__answer">
          <p>{answer}</p>
        </div>
      )}
    </div>
  );
}
