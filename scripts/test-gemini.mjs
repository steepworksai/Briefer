import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envVars = Object.fromEntries(
  readFileSync(resolve(__dirname, "../.env"), "utf-8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
);

const API_KEY = envVars.GEMINI_API_KEY;
if (!API_KEY || API_KEY === "your_gemini_key_here") {
  console.error("❌  Add your key to .env → GEMINI_API_KEY=AIza...");
  process.exit(1);
}

const TEST_TEXT = `
Artificial intelligence is transforming industries at an unprecedented pace.
Large language models like GPT-4 and Gemini can now perform complex reasoning tasks.
Companies are investing billions into AI research and deployment.
However, concerns about safety, job displacement, and misinformation are growing.
Researchers are working on alignment techniques to ensure AI systems behave as intended.
Governments worldwide are beginning to introduce AI regulation frameworks.
The open-source AI community is also gaining momentum, with models like Llama challenging proprietary systems.
Experts disagree on the timeline for artificial general intelligence, with estimates ranging from 5 to 50 years.
`.trim();

console.log("🔄  Calling Gemini 1.5 Flash...\n");

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `
You are a helpful reading assistant. Summarize the following web page content.

Return your response in this exact format:
TLDR: <2-3 sentence plain English summary>
KEYPOINTS:
- <key point 1>
- <key point 2>
- <key point 3>

Content:
${TEST_TEXT}
      `.trim() }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
    }),
  }
);

if (!response.ok) {
  const err = await response.json();
  console.error("❌  Error:", err?.error?.message ?? response.status);
  process.exit(1);
}

const data = await response.json();
const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

console.log("✅  Response:\n");
console.log(text);
