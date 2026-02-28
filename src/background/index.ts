import { summarize, summarizeVideo } from "../lib/api";
import { logger } from "../lib/logger";

// Open side panel when extension icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "OPEN_PREVIEW") {
    chrome.windows.create({
      url: chrome.runtime.getURL("src/preview/index.html"),
      type: "popup",
      state: "maximized",
    }).then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "OPEN_WHITEBOARD") {
    const { width, height, left, top } = message.payload;
    chrome.windows.create({
      url: chrome.runtime.getURL("src/whiteboard/index.html"),
      type: "popup",
      width, height, left, top,
    }).then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

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
