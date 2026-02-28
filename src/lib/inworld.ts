const BASE_URL = "https://api.inworld.ai/tts/v1/voice";

export const INWORLD_VOICES = [
  { id: "Ashley",   description: "Warm, female" },
  { id: "Alex",     description: "Clear, male" },
  { id: "Olivia",   description: "Bright, female" },
  { id: "Edward",   description: "Deep, male" },
  { id: "Pixie",    description: "Energetic, female" },
  { id: "Julia",    description: "Smooth, female" },
  { id: "Theodore", description: "Rich, male" },
  { id: "Sarah",    description: "Soft, female" },
];

export async function inworldTTS(
  text: string,
  voiceId: string,
  apiKey: string
): Promise<string> {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${apiKey}`,
    },
    body: JSON.stringify({
      text,
      voiceId,
      modelId: "inworld-tts-1.5-max",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string })?.message ?? `InWorld error: ${response.status}`
    );
  }

  const data = await response.json();
  const audioContent: string = data.audioContent;

  // Decode base64 MP3 to a blob URL
  const binary = atob(audioContent);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "audio/mp3" });
  return URL.createObjectURL(blob);
}
