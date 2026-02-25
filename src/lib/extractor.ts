// Tags that are purely structural/noise — never contain article content
const NOISE_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "svg",
  "canvas",
  "video",
  "audio",
  "figure",
  "figcaption",
]);

// CSS class/id patterns that strongly indicate ads or navigation noise
const NOISE_PATTERNS = [
  /\bad[-_]?\b/i,
  /\badvert/i,
  /\bbanner/i,
  /\bsponsored/i,
  /\bpromo/i,
  /\bpopup/i,
  /\bmodal/i,
  /\bcookie/i,
  /\bnewsletter/i,
  /\bsubscribe/i,
  /\bsidebar/i,
  /\bwidget/i,
  /\bcomment/i,
  /\bfooter/i,
  /\bnavbar/i,
  /\bmenu/i,
  /\bbreadcrumb/i,
  /\bpagination/i,
  /\brelated/i,
  /\brecommend/i,
  /\bsocial/i,
  /\bshare/i,
  /\bfollow/i,
  /\btracking/i,
  /\banalytics/i,
];

function isNoiseElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (NOISE_TAGS.has(tag)) return true;

  const combined = `${el.id ?? ""} ${el.className ?? ""}`;
  return NOISE_PATTERNS.some((pattern) => pattern.test(combined));
}

function extractMainContent(doc: Document): string {
  // Try semantic article/main elements first
  const candidates = [
    doc.querySelector("article"),
    doc.querySelector('[role="main"]'),
    doc.querySelector("main"),
    doc.querySelector(".post-content"),
    doc.querySelector(".article-body"),
    doc.querySelector(".entry-content"),
    doc.querySelector("#content"),
    doc.querySelector("#main"),
    doc.body,
  ];

  const container = candidates.find((el) => el !== null) ?? doc.body;

  // Clone so we don't mutate the live DOM
  const clone = container.cloneNode(true) as Element;

  // Remove noise elements from the clone
  const allElements = Array.from(clone.querySelectorAll("*"));
  for (const el of allElements) {
    if (isNoiseElement(el)) {
      el.remove();
    }
  }

  // Extract text and collapse whitespace
  const text = clone.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
}

export function extractPageText(): string {
  return extractMainContent(document);
}

export function extractKeyPoints(summary: string): string[] {
  // Split summary into sentences and return top 3-5 as key points
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30);

  return sentences.slice(0, 5);
}
