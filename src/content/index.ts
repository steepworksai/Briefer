import { extractPageText } from "../lib/extractor";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "EXTRACT_TEXT") {
    const text = extractPageText();
    sendResponse({ text });
  }
  return true; // keep channel open for async response
});
