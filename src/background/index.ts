import { summarize } from "../lib/api";
import { logger } from "../lib/logger";

// Open side panel when extension icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SUMMARIZE") {
    const { text, apiKey, mode } = message.payload;

    logger.info("background", `Summarize request [${mode}] — ${text.split(/\s+/).length} words`);

    summarize(text, apiKey, mode)
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
});
