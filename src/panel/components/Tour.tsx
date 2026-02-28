import { useState } from "react";

interface Slide {
  icon: string;
  title: string;
  body: string | string[];
}

const SLIDES: Slide[] = [
  {
    icon: "⚡",
    title: "Welcome to Briefer",
    body: "Instant AI summaries of any article, YouTube video, Coursera course, DeepLearning.AI lesson, or anything with a transcript — TLDR, key points, and a sketchnote doodle to make it stick.",
  },
  {
    icon: "📚",
    title: "Builds your knowledge base",
    body: "Every summary is saved automatically and grouped by topic in History, so nothing you read is ever lost.",
  },
  {
    icon: "🔐",
    title: "Private by design",
    body: [
      "🔑 Paste your free Gemini API key once — stored only on your device, sent directly to Google.",
      "🔒 Never shared with Briefer. No tracking, no data collection, no backend.",
    ],
  },
];

interface Props {
  onDone: () => void;
}

export function Tour({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  function next() {
    if (isLast) {
      done();
    } else {
      setStep(s => s + 1);
    }
  }

  function done() {
    chrome.storage.sync.set({ tourSeen: true }, () => onDone());
  }

  return (
    <div className="tour">
      <button className="tour__skip" onClick={done}>Skip</button>

      <div className="tour__slide">
        <div className="tour__icon">{slide.icon}</div>
        <h2 className="tour__title">{slide.title}</h2>
        {Array.isArray(slide.body) ? (
          <ul className="tour__body tour__body--list">
            {slide.body.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        ) : (
          <p className="tour__body">{slide.body}</p>
        )}
      </div>

      <div className="tour__footer">
        <div className="tour__dots">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`tour__dot${i === step ? " tour__dot--active" : ""}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>
        <button className="tour__next" onClick={next}>
          {isLast ? "Get Started →" : "Next →"}
        </button>
      </div>
    </div>
  );
}
