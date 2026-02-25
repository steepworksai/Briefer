const BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// Premade voices available on free tier
export const ELEVENLABS_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",   description: "Calm, female" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah",    description: "Soft, female" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda",  description: "Warm, female" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian",    description: "Deep, male" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",     description: "Neutral, male" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel",   description: "British, male" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George",   description: "Warm, male" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam",     description: "Crisp, male" },
];

export async function elevenLabsTTS(
  text: string,
  voiceId: string,
  apiKey: string
): Promise<string> {
  const response = await fetch(`${BASE_URL}/${voiceId}/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: { message?: string } })?.detail?.message ??
      `ElevenLabs error: ${response.status}`
    );
  }

  // Track free tier usage (10k chars/month)
  const charsUsed = response.headers.get("x-character-count");
  if (charsUsed) {
    const prev = ((await chrome.storage.local.get("elCharsUsed")).elCharsUsed as number) ?? 0;
    await chrome.storage.local.set({ elCharsUsed: prev + parseInt(charsUsed, 10) });
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
