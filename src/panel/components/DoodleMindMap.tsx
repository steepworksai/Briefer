import { useState } from "react";
import type { SummaryResult } from "../../lib/api";

interface Props {
  result: SummaryResult;
}

export function DoodleMindMap({ result }: Props) {
  const [opening, setOpening] = useState(false);

  if (result.keyPoints.length === 0) return null;

  function openBoard() {
    if (opening) return;
    setOpening(true);
    chrome.storage.local.set({ whiteboardData: result }, () => {
      const w = Math.round(screen.width  * 0.70);
      const h = Math.round(screen.height * 0.82);
      chrome.runtime.sendMessage(
        {
          type: "OPEN_WHITEBOARD",
          payload: {
            width:  w,
            height: h,
            left: Math.round((screen.width  - w) / 2),
            top:  Math.round((screen.height - h) / 2),
          },
        },
        () => setOpening(false),
      );
    });
  }

  return (
    <button
      className={`doodle-btn section-btn--text${opening ? " doodle-btn--loading" : ""}`}
      onClick={openBoard}
      disabled={opening}
      title="Open Doodle Mind Map"
    >
      {opening ? "⏳" : "🎨"} Doodle
    </button>
  );
}
