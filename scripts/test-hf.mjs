import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env manually (no dotenv needed)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const envVars = Object.fromEntries(
  readFileSync(envPath, "utf-8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => line.split("=").map((s) => s.trim()))
);

const API_KEY = envVars.HF_API_KEY;

if (!API_KEY || API_KEY === "hf_your_token_here") {
  console.error("❌  Add your token to .env  →  HF_API_KEY=hf_...");
  process.exit(1);
}

const TEST_TEXT = `
  Artificial intelligence is transforming the way we interact with technology.
  Large language models can now understand and generate human-like text with
  remarkable accuracy. These models are trained on vast datasets and can
  perform tasks ranging from translation to summarization. The field continues
  to advance rapidly, with new breakthroughs being announced regularly.
  Researchers are also exploring ways to make these models more efficient
  and accessible to a wider audience.
`.trim();

console.log("🔄  Calling HuggingFace API...");
console.log("   Model : facebook/bart-large-cnn");
console.log("   Input : ", TEST_TEXT.slice(0, 80) + "...\n");

const response = await fetch(
  "https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: TEST_TEXT,
      parameters: { max_length: 100, min_length: 30, do_sample: false },
      options: { wait_for_model: true },
    }),
  }
);

if (!response.ok) {
  const err = await response.json();
  console.error("❌  API error:", err?.error ?? response.status);
  process.exit(1);
}

const data = await response.json();
const summary = data[0]?.summary_text;

if (!summary) {
  console.error("❌  No summary returned. Raw response:", data);
  process.exit(1);
}

console.log("✅  Summary:");
console.log("  ", summary);
