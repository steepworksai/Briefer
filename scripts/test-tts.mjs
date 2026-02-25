import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath   = resolve(__dirname, "../.env");
const envVars   = Object.fromEntries(
  readFileSync(envPath, "utf-8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
);

const API_KEY = envVars.HF_API_KEY;
if (!API_KEY || API_KEY === "hf_your_token_here") {
  console.error("❌  Add your token to .env → HF_API_KEY=hf_...");
  process.exit(1);
}

const TEST_TEXT = "Large language models can now understand and generate human-like text with remarkable accuracy.";

console.log("🔄  Calling Kokoro-82M TTS...");
console.log(`   Input: "${TEST_TEXT}"\n`);

const response = await fetch(
  "https://router.huggingface.co/hf-inference/models/hexgrad/Kokoro-82M",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: TEST_TEXT,
      options: { wait_for_model: true },
    }),
  }
);

console.log(`   Status : ${response.status}`);
console.log(`   Content-Type : ${response.headers.get("content-type")}`);

if (!response.ok) {
  const text = await response.text();
  console.error("❌  API error:", text);
  process.exit(1);
}

const buffer = await response.arrayBuffer();
const outPath = resolve(__dirname, "../logs/test-tts-output.wav");
writeFileSync(outPath, Buffer.from(buffer));

console.log(`\n✅  Audio saved to: ${outPath}`);
console.log(`   Size: ${(buffer.byteLength / 1024).toFixed(1)} KB`);
console.log(`\n   Play it with: afplay ${outPath}`);
