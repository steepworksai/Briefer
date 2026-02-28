import { summarize, summarizeVideo, followUp } from "../lib/api";
import { logger } from "../lib/logger";

// Open side panel when extension icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SUMMARIZE") {
    const { text, apiKey } = message.payload;
    logger.info("background", `Summarize request — ${text.split(/\s+/).length} words`);
    summarize(text, apiKey)
      .then((result) => {
        logger.info("background", "Summary generated successfully");
        sendResponse({ success: true, result });
      })
      .catch((err) => {
        const msg = err.message ?? "Unknown error";
        logger.error("background", `Summarize failed: ${msg}`);
        sendResponse({ success: false, error: msg });
      });
    return true;
  }

  if (message.type === "FOLLOW_UP") {
    const { question, context, apiKey } = message.payload;
    followUp(question, context, apiKey)
      .then((answer) => sendResponse({ success: true, answer }))
      .catch((err) => sendResponse({ success: false, error: err.message ?? "Unknown error" }));
    return true;
  }

  if (message.type === "SUMMARIZE_VIDEO") {
    const { videoUrl, apiKey } = message.payload;
    logger.info("background", `Video summarize request — ${videoUrl}`);
    summarizeVideo(videoUrl, apiKey)
      .then((result) => {
        logger.info("background", "Video summary generated successfully");
        sendResponse({ success: true, result });
      })
      .catch((err) => {
        const msg = err.message ?? "Unknown error";
        logger.error("background", `Video summarize failed: ${msg}`);
        sendResponse({ success: false, error: msg });
      });
    return true;
  }
});
