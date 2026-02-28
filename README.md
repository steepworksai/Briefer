# Briefer — AI Page Summarizer

> Instant AI summaries of any article, blog post, or YouTube video — structured, readable, and saved to your personal knowledge base.

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)

---

## What it does

Briefer reads the current page or YouTube video and generates a structured summary using Google Gemini AI — no copy-pasting, no tab-switching.

- **Quick Read** — TLDR, key points, and takeaway in seconds
- **Deep Dive** — core argument, solution mechanism, structural shift, and why it matters
- **YouTube & video support** — summarizes transcripts from YouTube and DeepLearning.AI
- **AI Doodle** — generates a sketchnote-style visual summary of the page
- **Doodle Mind Map** — interactive hand-drawn mind map built from key points
- **History** — every summary saved automatically, grouped by topic
- **Read aloud** — built-in voice player to listen to your summary

---

## Privacy

| What happens | Detail |
|---|---|
| Page content | Extracted locally inside your browser tab via Chrome scripting |
| AI calls | Text sent **directly** from your browser to Google Gemini |
| API key | Stored in Chrome's encrypted `chrome.storage.sync` — never sent to Briefer |
| Analytics | None. No backend server exists. |

See the full [Privacy Policy](https://steepworksai.github.io/Briefer/privacy.html).

---

## Bring Your Own Key (BYOK)

Briefer uses your own Google Gemini API key — no Briefer subscription or monthly fee.

| Provider | Model |
|---|---|
| Google | `gemini-2.5-flash` |

Get a free API key at [aistudio.google.com](https://aistudio.google.com/app/apikey).

---

## Getting started

### Run locally from source

```bash
git clone https://github.com/steepworksai/Briefer.git
cd Briefer
npm install
npm run build
```

Then load the unpacked extension:

**Chrome:** Go to `chrome://extensions` → Enable **Developer mode** → **Load unpacked** → select `dist/`

---

## Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Platform | Chrome Extension — Manifest V3 |
| Build | Vite + `@crxjs/vite-plugin` |
| UI | React |
| AI | Google Gemini 2.5 Flash (REST) |
| Mind map | Rough.js |
| Storage | `chrome.storage.sync` / `chrome.storage.local` |

---

## Development

```bash
npm install      # install dependencies
npm run build    # production build → dist/
```

### Project structure

```
src/
├── background/      # Service worker — AI calls, window management
├── content/         # Content script (placeholder)
├── panel/           # Side panel UI — summary, history, tour
├── whiteboard/      # Doodle canvas
├── preview/         # Doodle preview popup
└── lib/
    ├── api.ts       # Gemini API — summarize, summarizeVideo
    ├── history.ts   # Summary persistence — save, load, group by topic
    ├── doodle.ts    # AI doodle generation
    └── transcripts.ts  # YouTube & DeepLearning.AI transcript extraction
```

---

## Contributing

Issues and pull requests are welcome. Please open an issue first to discuss significant changes.

1. Fork the repo
2. Create a branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Open a pull request

---

## License

[MIT](LICENSE) © 2026 SteepWorksAi
