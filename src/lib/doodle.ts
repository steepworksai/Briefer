import type { SummaryResult } from "./api";
import { logger } from "./logger";

const GEMINI_IMG_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

function stripMd(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .trim();
}

// Split words longer than 12 chars at the midpoint with a hyphen.
// Image generation models reliably render shorter word segments;
// full long words like "photosynthesis" or "backpropagation" are
// frequently misspelled. Hyphenating preserves the full term visually.
function sanitizeLongWords(text: string): string {
  return text.replace(/\b([a-zA-Z]{13,})\b/g, word => {
    const mid = Math.ceil(word.length / 2);
    return word.slice(0, mid) + "-" + word.slice(mid);
  });
}

export async function fetchDoodleImage(
  result: SummaryResult,
  apiKey: string,
): Promise<string | null> {
  const clean = (t: string) => sanitizeLongWords(stripMd(t));
  const allPoints = result.keyPoints
    .map((kp, i) => `${i + 1}. ${clean(kp)}`)
    .join("\n");

  const prompt = [
    `Create a rich, detailed hand-drawn whiteboard sketchnote infographic that captures the COMPLETE idea of this topic.`,
    ``,
    `TOPIC: ${clean(result.tldr)}`,
    ``,
    `ALL KEY POINTS (include every one):`,
    allPoints,
    ``,
    `TAKEAWAY: ${clean(result.takeaway)}`,
    ``,
    `Instructions:`,
    `- Illustrate ALL the key points above — do not skip or summarize any`,
    `- Use a whiteboard/notebook sketchnote style: white or light-gray background, hand-drawn ink lines`,
    `- Organize concepts spatially to show relationships, flow, and hierarchy`,
    `- Use pastel color fills, connecting arrows with short verb labels, small doodle icons`,
    `- Add the takeaway message prominently at the bottom`,
    `- Make it dense and information-rich, like a teacher's whiteboard after a full lecture`,
    `- No photographs, no realistic art — hand-drawn sketch style only`,
  ].join("\n");

  try {
    logger.info("doodle", "Calling Gemini image generation…");
    const res = await fetch(`${GEMINI_IMG_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error("doodle", `API error ${res.status}: ${errText.slice(0, 300)}`);
      return null;
    }

    const data = await res.json();
    const parts: any[] = data.candidates?.[0]?.content?.parts ?? [];
    logger.info("doodle", `Parts count: ${parts.length}, types: ${parts.map((p: any) => p.inlineData ? "image" : "text").join(", ")}`);

    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith("image/")) {
        const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        logger.info("doodle", `Image received, size: ${part.inlineData.data.length} chars`);
        return dataUrl;
      }
    }

    logger.error("doodle", `No image part found. Parts: ${JSON.stringify(parts).slice(0, 200)}`);
    return null;
  } catch (err) {
    logger.error("doodle", `Fetch error: ${err}`);
    return null;
  }
}
