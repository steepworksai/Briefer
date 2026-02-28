import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import rough from "roughjs";
import type { SummaryResult } from "../lib/api";
import { logger } from "../lib/logger";
import "./WhiteboardComponent.css";

// ── Shape types ───────────────────────────────────────────────────────────────

interface RectShape {
  id: string; type: "rect";
  x: number; y: number; w: number; h: number;
  label: string; fill: string; stroke: string;
  sticky?: boolean;
}
interface SegShape {
  id: string; type: "line" | "arrow";
  x1: number; y1: number; x2: number; y2: number;
  color: string;
  label?: string;   // optional midpoint relationship label
  fromId?: string;
  toId?: string;
  fromSide?: "left" | "right";
  toSide?: "left" | "right";
}
interface TextShape {
  id: string; type: "text";
  x: number; y: number;
  text: string; color: string;
}
type Shape = RectShape | SegShape | TextShape;

type Tool = "select" | "rect" | "line" | "arrow" | "text" | "pan" | "sticky";

type DragState =
  | { kind: "draw-rect";  x0: number; y0: number }
  | { kind: "draw-line";  x0: number; y0: number }
  | { kind: "draw-arrow"; x0: number; y0: number }
  | { kind: "move-xy";  id: string; x0: number; y0: number; origX: number; origY: number }
  | { kind: "resize-rect"; id: string; x0: number; y0: number; origW: number; origH: number }
  | { kind: "move-seg"; id: string; x0: number; y0: number;
      origX1: number; origY1: number; origX2: number; origY2: number }
  | { kind: "pan"; cx0: number; cy0: number; origPanX: number; origPanY: number };

// ── Static constants ──────────────────────────────────────────────────────────

const BRANCH_FILLS: [string, string][] = [
  ["#ede9fe", "#c4b5fd"],
  ["#dbeafe", "#93c5fd"],
  ["#dcfce7", "#86efac"],
  ["#fef9c3", "#fde047"],
  ["#ffe4e6", "#fda4af"],
];

const PEN_COLORS = ["#374151", "#6366f1", "#dc2626", "#16a34a", "#ea580c"];

// Relationship labels for mind-map arrows (cycles by branch index)
const ARROW_LABELS = ["supports", "shows", "explains", "leads to", "includes", "causes", "illustrates"];

const TOOL_ICONS: Record<Tool, string> = {
  select: "↖", rect: "□", line: "─", arrow: "→", text: "T", pan: "✋", sticky: "📌",
};
const TOOL_TIPS: Record<Tool, string> = {
  select: "Select / Move (click, drag)",
  rect:   "Draw Box (drag)",
  line:   "Draw Line (drag)",
  arrow:  "Draw Arrow (drag)",
  text:   "Add Text (click)",
  pan:    "Pan Canvas (drag)  · Ctrl+scroll to zoom",
  sticky: "Add Sticky Note (click to place)",
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function stripMd(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .trim();
}

let _id = 0;
function uid() { return `s${++_id}`; }

function stableHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length <= maxChars) { cur = test; }
    else { if (cur) lines.push(cur); cur = w.length > maxChars ? w.slice(0, maxChars - 1) + "…" : w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Keyword→emoji mapping for visual enrichment
const EMOJI_MAP: [RegExp, string][] = [
  [/learn|study|educat|know|skill/i,         "📚"],
  [/data|statistic|number|metric|measur/i,   "📊"],
  [/money|cost|price|revenue|profit|fund/i,  "💰"],
  [/time|speed|fast|slow|quick|hour|day/i,   "⏱"],
  [/problem|issue|challenge|difficult|risk/i,"⚠️"],
  [/solution|fix|resolve|answer|implement/i, "✅"],
  [/people|user|human|customer|team|person/i,"👤"],
  [/tech|software|code|program|system|app/i, "💻"],
  [/world|global|country|market|society/i,   "🌍"],
  [/increas|grow|improv|better|higher/i,     "📈"],
  [/decreas|reduc|fall|drop|lower|less/i,    "📉"],
  [/idea|innovat|creat|design|invent/i,      "💡"],
  [/brain|think|mind|cognitive|memory/i,     "🧠"],
  [/health|medical|body|disease|treatment/i, "🏥"],
  [/tool|build|make|construct|engineer/i,    "🔧"],
  [/key|import|critical|essential|core/i,    "🔑"],
  [/connect|link|network|communicat/i,       "🔗"],
  [/secur|safe|protect|privacy|encrypt/i,    "🔒"],
  [/art|image|visual|design|color|creat/i,   "🎨"],
  [/science|research|experiment|lab/i,       "🔬"],
  [/goal|target|aim|result|outcome/i,        "🎯"],
  [/change|transform|shift|evolv/i,          "🔄"],
];

function pickEmoji(text: string): string {
  for (const [pattern, emoji] of EMOJI_MAP) {
    if (pattern.test(text)) return emoji;
  }
  const fallbacks = ["✦", "◇", "▸", "◉", "★", "✶", "◈"];
  return fallbacks[stableHash(text) % fallbacks.length];
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function rectAnchor(rect: RectShape, side: "left" | "right", targetY: number): { x: number; y: number } {
  const x = side === "left" ? rect.x : rect.x + rect.w;
  const y = clamp(targetY, rect.y + 8, rect.y + rect.h - 8);
  return { x, y };
}

function relinkSegments(shapes: Shape[]): Shape[] {
  const rectById = new Map<string, RectShape>();
  for (const s of shapes) {
    if (s.type === "rect") rectById.set(s.id, s);
  }

  return shapes.map(s => {
    if ((s.type !== "line" && s.type !== "arrow") || !s.fromId || !s.toId) return s;
    const from = rectById.get(s.fromId);
    const to   = rectById.get(s.toId);
    if (!from || !to) return s;

    const fromSide = s.fromSide ?? "right";
    const toSide   = s.toSide ?? "left";
    const targetY  = (to.y + to.h / 2 + from.y + from.h / 2) / 2;
    const p1 = rectAnchor(from, fromSide, targetY);
    const p2 = rectAnchor(to, toSide, targetY);
    return { ...s, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  });
}

// ── Mind map layout ───────────────────────────────────────────────────────────

function buildMindMap(result: SummaryResult, w: number, h: number): Shape[] {
  const shapes: Shape[] = [];
  const N = result.keyPoints.length;
  const rowCount = Math.ceil(N / 2);

  // Use nearly full canvas height and keep the topic centered.
  const mapH = Math.max(220, h - 70);
  const cx = w / 2;

  const centerW  = Math.min(w * 0.30, 260);
  const centerH  = Math.min(mapH * 0.12, 72);
  const branchDx = Math.min(w * 0.28, 490);
  const branchW  = Math.min(w * 0.22, 270);

  const nodeFontSize = Math.max(10, Math.min(13, branchW / 14));
  const charsPerLine = Math.max(8, Math.floor(branchW / (nodeFontSize * 0.65)));
  const lh           = nodeFontSize * 1.35;
  const PAD_V        = 14;

  // Truncate each key point to a short title (≤8 words) so boxes stay compact
  const MAX_KP_WORDS = 8;

  const branchData = result.keyPoints.map(kp => {
    const full  = stripMd(kp);
    const words = full.split(" ");
    const short = words.length > MAX_KP_WORDS
      ? words.slice(0, MAX_KP_WORDS).join(" ") + "…"
      : full;
    const label  = `${pickEmoji(full)} ${short}`;
    const lines  = wrapText(label, charsPerLine);
    const neededH = Math.max(50, Math.ceil(lines.length * lh) + PAD_V * 2);
    return { label, lines, h: neededH };
  });

  const maxBranchH = branchData.length > 0 ? Math.max(...branchData.map(d => d.h)) : 60;
  const GAP        = 24;
  const usableH    = mapH - centerH - GAP * 2;
  const rowDy      = rowCount <= 1 ? 0
    : Math.min(maxBranchH + GAP, usableH / (rowCount - 1));

  const cy = h / 2;

  const tldrText  = stripMd(result.tldr).split(" ").slice(0, 9).join(" ");
  const topicEmoji = pickEmoji(result.tldr);
  const centerId = uid();
  shapes.push({
    id: centerId, type: "rect",
    x: cx - centerW / 2, y: cy - centerH / 2,
    w: centerW, h: centerH,
    label: `${topicEmoji} ${tldrText}`,
    fill: "#6366f1", stroke: "#4f46e5",
  });

  result.keyPoints.forEach((_kp, i) => {
    const isRight = i % 2 === 0;
    const row     = Math.floor(i / 2);
    const yOffset = (row - (rowCount - 1) / 2) * rowDy;
    const bx      = cx + (isRight ? branchDx : -branchDx);
    const by      = cy + yOffset;
    const bh      = branchData[i].h;
    const [fill, stroke] = BRANCH_FILLS[i % BRANCH_FILLS.length];

    const ax1 = cx + (isRight ? centerW / 2 : -centerW / 2);
    const ay1 = cy + Math.max(-centerH / 2 + 4, Math.min(centerH / 2 - 4, yOffset * 0.3));
    const ax2 = bx + (isRight ? -branchW / 2 : branchW / 2);

    const arrowLabel = ARROW_LABELS[i % ARROW_LABELS.length];
    const branchId = uid();
    shapes.push({
      id: uid(), type: "arrow", x1: ax1, y1: ay1, x2: ax2, y2: by, color: stroke, label: arrowLabel,
      fromId: centerId, toId: branchId,
      fromSide: isRight ? "right" : "left",
      toSide: isRight ? "left" : "right",
    });

    shapes.push({
      id: branchId, type: "rect",
      x: bx - branchW / 2, y: by - bh / 2,
      w: branchW, h: bh,
      label: branchData[i].label, fill, stroke,
    });
  });

  (shapes as any).__nodeFontSize = nodeFontSize;
  (shapes as any).__charsPerLine = charsPerLine;

  return shapes;
}

function renderShape(
  rc: ReturnType<typeof rough.svg>,
  gEl: SVGGElement,
  shape: Shape,
  selected: boolean,
  skipText: boolean,
  fontSize = 12,
) {
  const seed      = stableHash(shape.id);
  const isPreview = shape.id === "__prev__";

  if (shape.type === "rect") {
    const isSticky = !!(shape as RectShape).sticky;
    const node = rc.rectangle(shape.x, shape.y, shape.w, shape.h, {
      fill: shape.fill, stroke: selected ? "#60a5fa" : shape.stroke,
      strokeWidth: selected ? 2.5 : 1.5,
      roughness: isPreview ? 0.5 : isSticky ? 2.2 : 1.3, fillStyle: "solid", seed,
    });
    gEl.appendChild(node);

    // Sticky note decorations
    if (isSticky) {
      // Top adhesive strip
      const strip = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      strip.setAttribute("x",       String(shape.x + 3));
      strip.setAttribute("y",       String(shape.y + 3));
      strip.setAttribute("width",   String(shape.w - 6));
      strip.setAttribute("height",  "14");
      strip.setAttribute("fill",    "#fbbf24");
      strip.setAttribute("opacity", "0.55");
      strip.setAttribute("rx",      "2");
      strip.setAttribute("pointer-events", "none");
      gEl.appendChild(strip);

      // Folded corner (bottom-right)
      const foldSize = 18;
      const fold = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      fold.setAttribute("points", [
        `${shape.x + shape.w - foldSize},${shape.y + shape.h}`,
        `${shape.x + shape.w},${shape.y + shape.h}`,
        `${shape.x + shape.w},${shape.y + shape.h - foldSize}`,
      ].join(" "));
      fold.setAttribute("fill",    "#a16207");
      fold.setAttribute("opacity", "0.4");
      fold.setAttribute("pointer-events", "none");
      gEl.appendChild(fold);

      // Fold shadow line
      const foldLine = rc.line(
        shape.x + shape.w - foldSize, shape.y + shape.h,
        shape.x + shape.w, shape.y + shape.h - foldSize,
        { stroke: "#92400e", strokeWidth: 1, roughness: 0.8, seed: seed + 1 },
      );
      gEl.appendChild(foldLine);
    }

    if (selected) {
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x",              String(shape.x - 4));
      r.setAttribute("y",              String(shape.y - 4));
      r.setAttribute("width",          String(shape.w + 8));
      r.setAttribute("height",         String(shape.h + 8));
      r.setAttribute("fill",           "none");
      r.setAttribute("stroke",         "#60a5fa");
      r.setAttribute("stroke-width",   "1.5");
      r.setAttribute("stroke-dasharray", "5,3");
      r.setAttribute("rx",             "3");
      r.setAttribute("pointer-events", "none");
      gEl.appendChild(r);

      // Resize handle at bottom-right corner of selected boxes.
      const h = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      h.setAttribute("x", String(shape.x + shape.w - 6));
      h.setAttribute("y", String(shape.y + shape.h - 6));
      h.setAttribute("width", "12");
      h.setAttribute("height", "12");
      h.setAttribute("fill", "#60a5fa");
      h.setAttribute("stroke", "#fff");
      h.setAttribute("stroke-width", "1");
      h.setAttribute("rx", "2");
      h.setAttribute("pointer-events", "none");
      gEl.appendChild(h);
    }

    if (!skipText && shape.label) {
      const maxChars = Math.max(6, Math.floor(shape.w / (fontSize * 0.65)));
      const lines    = wrapText(shape.label, maxChars);
      const lh       = fontSize * 1.35;
      const tcx      = shape.x + shape.w / 2;
      const tcy      = shape.y + shape.h / 2;
      const startY   = tcy - ((lines.length - 1) * lh) / 2;
      const color    = shape.fill === "#6366f1" ? "#fff" : "#1e293b";

      lines.forEach((line, i) => {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x",                 String(tcx));
        t.setAttribute("y",                 String(startY + i * lh));
        t.setAttribute("text-anchor",       "middle");
        t.setAttribute("dominant-baseline", "middle");
        t.setAttribute("fill",              color);
        t.setAttribute("font-size",         String(fontSize));
        t.setAttribute("font-weight",       shape.fill === "#6366f1" ? "700" : "500");
        t.setAttribute("font-family",       "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");
        t.setAttribute("pointer-events",    "none");
        t.textContent = line;
        gEl.appendChild(t);
      });
    }

  } else if (shape.type === "line" || shape.type === "arrow") {
    const ln = rc.line(shape.x1, shape.y1, shape.x2, shape.y2, {
      stroke: selected ? "#60a5fa" : shape.color,
      strokeWidth: selected ? 2.5 : 1.8,
      roughness: isPreview ? 0.5 : 1.2, seed,
    });
    gEl.appendChild(ln);

    if (shape.type === "arrow") {
      const dx = shape.x2 - shape.x1, dy = shape.y2 - shape.y1;
      const angle = Math.atan2(dy, dx);
      const hs    = Math.max(8, fontSize * 0.9);
      const color = selected ? "#60a5fa" : shape.color;
      const poly  = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", [
        `${shape.x2 - hs * Math.cos(angle - Math.PI / 6)},${shape.y2 - hs * Math.sin(angle - Math.PI / 6)}`,
        `${shape.x2},${shape.y2}`,
        `${shape.x2 - hs * Math.cos(angle + Math.PI / 6)},${shape.y2 - hs * Math.sin(angle + Math.PI / 6)}`,
      ].join(" "));
      poly.setAttribute("fill",           color);
      poly.setAttribute("pointer-events", "none");
      gEl.appendChild(poly);

      // Render relationship label at the midpoint of the arrow
      if (!skipText && shape.label) {
        const mx = (shape.x1 + shape.x2) / 2;
        const my = (shape.y1 + shape.y2) / 2;
        // Perpendicular offset so label doesn't overlap the line
        const len = Math.hypot(dx, dy) || 1;
        const ox  = -(dy / len) * 11;
        const oy  =  (dx / len) * 11;
        // Background pill for readability
        const pill = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const lw = shape.label.length * 5.2 + 8;
        const lh2 = 13;
        pill.setAttribute("x",       String(mx + ox - lw / 2));
        pill.setAttribute("y",       String(my + oy - lh2 / 2 - 1));
        pill.setAttribute("width",   String(lw));
        pill.setAttribute("height",  String(lh2));
        pill.setAttribute("rx",      "6");
        pill.setAttribute("fill",    "#fff");
        pill.setAttribute("opacity", "0.85");
        pill.setAttribute("pointer-events", "none");
        gEl.appendChild(pill);

        const lt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        lt.setAttribute("x",                 String(mx + ox));
        lt.setAttribute("y",                 String(my + oy));
        lt.setAttribute("text-anchor",       "middle");
        lt.setAttribute("dominant-baseline", "middle");
        lt.setAttribute("fill",              "#1e293b");
        lt.setAttribute("font-size",         "10");
        lt.setAttribute("font-weight",       "600");
        lt.setAttribute("font-style",        "italic");
        lt.setAttribute("font-family",       "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");
        lt.setAttribute("pointer-events",    "none");
        lt.textContent = shape.label;
        gEl.appendChild(lt);
      }
    }

  } else if (shape.type === "text" && !skipText) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x",           String(shape.x));
    t.setAttribute("y",           String(shape.y));
    t.setAttribute("fill",        selected ? "#60a5fa" : shape.color);
    t.setAttribute("font-size",   String(fontSize + 2));
    t.setAttribute("font-weight", "500");
    t.setAttribute("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");
    t.textContent = shape.text || "…";
    gEl.appendChild(t);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface WhiteboardProps {
  result?:  SummaryResult;
  onClose?: () => void;
}

export function Whiteboard({ result: resultProp, onClose }: WhiteboardProps = {}) {
  // ── Shapes with undo/redo ─────────────────────────────────────────────────
  const shapesRef = useRef<Shape[]>([]);
  const [shapes, setShapesState] = useState<Shape[]>([]);
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [redoStack, setRedoStack] = useState<Shape[][]>([]);

  function setShapes(s: Shape[]) {
    shapesRef.current = s;
    setShapesState(s);
  }

  // Commit a user action (snapshot before → undo, clear redo)
  const preDragRef = useRef<Shape[] | null>(null);

  function commit(newShapes: Shape[]) {
    setUndoStack(u => [...u.slice(-50), shapesRef.current]);
    setRedoStack([]);
    setShapes(newShapes);
  }

  const undo = useCallback(() => {
    setUndoStack(u => {
      if (u.length === 0) return u;
      const prev = u[u.length - 1];
      setRedoStack(r => [shapesRef.current, ...r.slice(0, 49)]);
      setShapes(prev);
      return u.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack(r => {
      if (r.length === 0) return r;
      const next = r[0];
      setUndoStack(u => [...u.slice(-49), shapesRef.current]);
      setShapes(next);
      return r.slice(1);
    });
  }, []);

  // ── Pan / Zoom ────────────────────────────────────────────────────────────
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const zoomRef = useRef(1);
  const [panX, setPanXS] = useState(0);
  const [panY, setPanYS] = useState(0);
  const [zoom, setZoomS] = useState(1);

  function setView(x: number, y: number, z: number) {
    panXRef.current = x; panYRef.current = y; zoomRef.current = z;
    setPanXS(x); setPanYS(y); setZoomS(z);
  }

  function zoomBy(factor: number, pivotSvgX?: number, pivotSvgY?: number) {
    const nz  = Math.max(0.2, Math.min(8, zoomRef.current * factor));
    const svgW = canvasSizeRef.current.w;
    const svgH = canvasSizeRef.current.h;
    const px   = pivotSvgX ?? (panXRef.current + svgW / zoomRef.current / 2);
    const py   = pivotSvgY ?? (panYRef.current + svgH / zoomRef.current / 2);
    const npx  = px - (px - panXRef.current) * (zoomRef.current / nz);
    const npy  = py - (py - panYRef.current) * (zoomRef.current / nz);
    setView(npx, npy, nz);
  }

  function resetView() { setView(0, 0, 1); }

  // ── Canvas size ───────────────────────────────────────────────────────────
  const canvasSizeRef = useRef({ w: 0, h: 0 });
  const [canvasW, setCanvasW] = useState(0);
  const [canvasH, setCanvasH] = useState(0);

  // ── Other state ───────────────────────────────────────────────────────────
  const [tool,       setTool]       = useState<Tool>("select");
  const [penColor,   setPenColor]   = useState(PEN_COLORS[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editText,   setEditText]   = useState("");
  const [preview,    setPreview]    = useState<Shape | null>(null);

  const svgRef     = useRef<SVGSVGElement>(null);
  const shapesGRef = useRef<SVGGElement>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const drag       = useRef<DragState | null>(null);
  const hasInit    = useRef(false);

  // ── Measure canvas ────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    logger.info("whiteboard", "ResizeObserver attached");
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      logger.info("whiteboard", `wrap size: ${Math.round(width)} × ${Math.round(height)}`);
      if (width > 40 && height > 40) {
        canvasSizeRef.current = { w: Math.round(width), h: Math.round(height) };
        setCanvasW(Math.round(width));
        setCanvasH(Math.round(height));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Init mind map ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasInit.current || canvasW < 40 || canvasH < 40) return;
    hasInit.current = true;
    logger.info("whiteboard", `init at ${canvasW} × ${canvasH} — resultProp: ${!!resultProp}`);

    const doInit = (result: SummaryResult) => {
      const s = relinkSegments(buildMindMap(result, canvasW, canvasH));
      logger.info("whiteboard", `built ${s.length} shapes from ${resultProp ? "prop" : "storage"}`);
      setShapes(s);
      setUndoStack([[]]);
    };

    if (resultProp) {
      doInit(resultProp);
    } else {
      chrome.storage.local.get("whiteboardData", ({ whiteboardData }) => {
        logger.info("whiteboard", `storage read — ${whiteboardData ? "found" : "MISSING"}`);
        if (whiteboardData) doInit(whiteboardData as SummaryResult);
      });
    }
  }, [canvasW, canvasH, resultProp]);

  // ── Rough.js render ───────────────────────────────────────────────────────
  useEffect(() => {
    const gEl   = shapesGRef.current;
    const svgEl = svgRef.current;
    if (!gEl || !svgEl) return;
    while (gEl.firstChild) gEl.removeChild(gEl.firstChild);

    const fontSize = (shapes as any).__nodeFontSize ?? 12;
    const rc  = rough.svg(svgEl);
    const all = preview ? [...shapes, preview] : shapes;
    for (const s of all) {
      renderShape(rc, gEl, s, s.id === selectedId, s.id === editingId, fontSize);
    }
  }, [shapes, selectedId, preview, editingId]);

  // ── Ctrl+scroll to zoom ───────────────────────────────────────────────────
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const svgEl = el;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
      const rect   = svgEl.getBoundingClientRect();
      const pivX   = panXRef.current + (e.clientX - rect.left) / zoomRef.current;
      const pivY   = panYRef.current + (e.clientY - rect.top)  / zoomRef.current;
      const nz     = Math.max(0.2, Math.min(8, zoomRef.current * factor));
      const npx    = pivX - (pivX - panXRef.current) * (zoomRef.current / nz);
      const npy    = pivY - (pivY - panYRef.current) * (zoomRef.current / nz);
      panXRef.current = npx; panYRef.current = npy; zoomRef.current = nz;
      setPanXS(npx); setPanYS(npy); setZoomS(nz);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if (editingId) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (ctrl && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (ctrl && e.key === "s") { e.preventDefault(); saveAsPng(); return; }
      if (ctrl && e.key === "0") { e.preventDefault(); resetView(); return; }
      if (!ctrl && e.key === "=") { zoomBy(1.25); return; }
      if (!ctrl && e.key === "-") { zoomBy(1 / 1.25); return; }
      if (e.key === "Delete" || e.key === "Backspace") { deleteSelected(); return; }
      if (e.key === "Escape") {
        if (selectedId) { setSelectedId(null); return; }
        if (onClose) onClose(); else window.close();
      }
    };
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) { keyRef.current(e); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Save as PNG ───────────────────────────────────────────────────────────
  function saveAsPng() {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svgStr = new XMLSerializer().serializeToString(svgEl);
    const blob   = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url    = URL.createObjectURL(blob);
    const cvs    = document.createElement("canvas");
    cvs.width    = canvasW * 2;
    cvs.height   = canvasH * 2;
    const ctx    = cvs.getContext("2d")!;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.scale(2, 2);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvasW, canvasH);
      URL.revokeObjectURL(url);
      cvs.toBlob(pngBlob => {
        if (!pngBlob) return;
        const a = document.createElement("a");
        a.href     = URL.createObjectURL(pngBlob);
        a.download = "quickread-doodle.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    };
    img.src = url;
  }

  // ── SVG coordinate helper (accounts for pan + zoom) ──────────────────────
  function svgXY(e: React.MouseEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: panX + (e.clientX - rect.left) / zoom,
      y: panY + (e.clientY - rect.top)  / zoom,
    };
  }

  // ── Hit testing ───────────────────────────────────────────────────────────
  function hitTest(x: number, y: number): string | null {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.type === "rect") {
        if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s.id;
      } else if (s.type === "line" || s.type === "arrow") {
        if (distToSeg(x, y, s.x1, s.y1, s.x2, s.y2) < 10) return s.id;
      } else if (s.type === "text") {
        const aw = Math.max(30, s.text.length * 8);
        if (x >= s.x - 4 && x <= s.x + aw && y >= s.y - 18 && y <= s.y + 4) return s.id;
      }
    }
    return null;
  }

  function hitResizeHandle(x: number, y: number): string | null {
    if (!selectedId) return null;
    const s = shapes.find(it => it.id === selectedId);
    if (!s || s.type !== "rect") return null;
    const hx = s.x + s.w;
    const hy = s.y + s.h;
    return Math.hypot(x - hx, y - hy) <= 11 ? s.id : null;
  }

  function rectAt(x: number, y: number): RectShape | null {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.type !== "rect") continue;
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
    }
    return null;
  }

  // ── Delete selected ───────────────────────────────────────────────────────
  const deleteSelected = useCallback(() => {
    setSelectedId(prev => {
      if (!prev) return null;
      const next = shapesRef.current.filter(s => {
        if (s.id === prev) return false;
        if ((s.type === "line" || s.type === "arrow") && (s.fromId === prev || s.toId === prev)) return false;
        return true;
      });
      commit(next);
      return null;
    });
  }, []);

  // ── Mouse handlers ────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if (editingId) { commitEdit(); return; }

    // Pan tool — no SVG coordinate needed
    if (tool === "pan") {
      drag.current = { kind: "pan", cx0: e.clientX, cy0: e.clientY, origPanX: panX, origPanY: panY };
      return;
    }

    const { x, y } = svgXY(e);

    if (tool === "select") {
      const resizeHit = hitResizeHandle(x, y);
      if (resizeHit) {
        const rect = shapes.find(s => s.id === resizeHit && s.type === "rect") as RectShape | undefined;
        if (rect) {
          setSelectedId(resizeHit);
          preDragRef.current = [...shapesRef.current];
          drag.current = { kind: "resize-rect", id: resizeHit, x0: x, y0: y, origW: rect.w, origH: rect.h };
          return;
        }
      }

      const hit = hitTest(x, y);
      setSelectedId(hit);
      if (hit) {
        const shape = shapes.find(s => s.id === hit)!;
        preDragRef.current = [...shapesRef.current];
        if (shape.type === "rect" || shape.type === "text") {
          drag.current = { kind: "move-xy", id: hit, x0: x, y0: y, origX: shape.x, origY: shape.y };
        } else {
          if ((shape as SegShape).fromId && (shape as SegShape).toId) return;
          drag.current = { kind: "move-seg", id: hit, x0: x, y0: y,
            origX1: (shape as SegShape).x1, origY1: (shape as SegShape).y1,
            origX2: (shape as SegShape).x2, origY2: (shape as SegShape).y2 };
        }
      }
    } else if (tool === "rect")  { drag.current = { kind: "draw-rect",  x0: x, y0: y }; }
    else if (tool === "line")    { drag.current = { kind: "draw-line",  x0: x, y0: y }; }
    else if (tool === "arrow")   { drag.current = { kind: "draw-arrow", x0: x, y0: y }; }
    else if (tool === "sticky") {
      const sw = 190, sh = 150;
      const ns: RectShape = {
        id: uid(), type: "rect",
        x: x - sw / 2, y: y - sh / 2,
        w: sw, h: sh,
        label: "",
        fill: "#fef08a", stroke: "#a16207",
        sticky: true,
      };
      commit([...shapesRef.current, ns]);
      setEditingId(ns.id); setEditText(""); setSelectedId(ns.id);
    }
    else if (tool === "text") {
      const hit = hitTest(x, y);
      if (!hit) {
        const ns: TextShape = { id: uid(), type: "text", x, y, text: "", color: penColor };
        commit([...shapesRef.current, ns]);
        setEditingId(ns.id); setEditText(""); setSelectedId(ns.id);
      } else { setSelectedId(hit); }
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const d = drag.current;
    if (!d) return;

    if (d.kind === "pan") {
      const dx = (e.clientX - d.cx0) / zoom;
      const dy = (e.clientY - d.cy0) / zoom;
      const nx = d.origPanX - dx;
      const ny = d.origPanY - dy;
      panXRef.current = nx; panYRef.current = ny;
      setPanXS(nx); setPanYS(ny);
      return;
    }

    const { x, y } = svgXY(e);

    if (d.kind === "draw-rect") {
      setPreview({ id: "__prev__", type: "rect",
        x: Math.min(d.x0, x), y: Math.min(d.y0, y),
        w: Math.abs(x - d.x0), h: Math.abs(y - d.y0),
        label: "", fill: "rgba(99,102,241,0.1)", stroke: penColor });
    } else if (d.kind === "draw-line" || d.kind === "draw-arrow") {
      setPreview({ id: "__prev__",
        type: d.kind === "draw-arrow" ? "arrow" : "line",
        x1: d.x0, y1: d.y0, x2: x, y2: y, color: penColor });
    } else if (d.kind === "move-xy") {
      const dx = x - d.x0, dy = y - d.y0;
      const { id: did, origX, origY } = d;
      const next = shapes.map(s => {
        if (s.id !== did) return s;
        if (s.type === "rect" || s.type === "text") return { ...s, x: origX + dx, y: origY + dy };
        return s;
      });
      setShapes(relinkSegments(next));
    } else if (d.kind === "resize-rect") {
      const dx = x - d.x0, dy = y - d.y0;
      const { id: did, origW, origH } = d;
      const next = shapes.map(s => {
        if (s.id !== did || s.type !== "rect") return s;
        return { ...s, w: Math.max(80, origW + dx), h: Math.max(48, origH + dy) };
      });
      setShapes(relinkSegments(next));
    } else if (d.kind === "move-seg") {
      const dx = x - d.x0, dy = y - d.y0;
      const { id: did, origX1, origY1, origX2, origY2 } = d;
      const next = shapes.map(s => {
        if (s.id !== did) return s;
        if (s.type === "line" || s.type === "arrow")
          return { ...s, x1: origX1 + dx, y1: origY1 + dy, x2: origX2 + dx, y2: origY2 + dy };
        return s;
      });
      setShapes(next);
    }
  }

  function onMouseUp(e: React.MouseEvent) {
    const d = drag.current;
    drag.current = null;
    setPreview(null);
    if (!d) return;

    if (d.kind === "pan") return; // pan doesn't modify shapes

    const { x, y } = svgXY(e);

    if (d.kind === "draw-rect") {
      const w = Math.abs(x - d.x0), h = Math.abs(y - d.y0);
      if (w > 12 && h > 12) {
        const s: RectShape = { id: uid(), type: "rect",
          x: Math.min(d.x0, x), y: Math.min(d.y0, y), w, h,
          label: "", fill: "#fff", stroke: penColor };
        commit([...shapesRef.current, s]);
        setSelectedId(s.id);
      }
    } else if (d.kind === "draw-line" || d.kind === "draw-arrow") {
      if (Math.hypot(x - d.x0, y - d.y0) > 12) {
        const fromRect = rectAt(d.x0, d.y0);
        const toRect   = rectAt(x, y);
        let s: SegShape = { id: uid(),
          type: d.kind === "draw-arrow" ? "arrow" : "line",
          x1: d.x0, y1: d.y0, x2: x, y2: y, color: penColor };
        if (fromRect && toRect && fromRect.id !== toRect.id) {
          const fromSide: "left" | "right" = toRect.x >= fromRect.x ? "right" : "left";
          const toSide: "left" | "right"   = fromSide === "right" ? "left" : "right";
          s = { ...s, fromId: fromRect.id, toId: toRect.id, fromSide, toSide };
        }
        commit(relinkSegments([...shapesRef.current, s]));
        setSelectedId(s.id);
      }
    } else if (d.kind === "move-xy" || d.kind === "resize-rect" || d.kind === "move-seg") {
      // Commit the moved position; push pre-drag snapshot to undo
      if (preDragRef.current) {
        setUndoStack(u => [...u.slice(-50), preDragRef.current!]);
        setRedoStack([]);
        preDragRef.current = null;
      }
    }
  }

  function onDblClick(e: React.MouseEvent) {
    drag.current = null;
    const { x, y } = svgXY(e);
    const hit = hitTest(x, y);
    if (!hit) return;
    const shape = shapes.find(s => s.id === hit)!;
    if (shape.type === "rect")  { setEditingId(hit); setEditText(shape.label); setSelectedId(hit); }
    if (shape.type === "text")  { setEditingId(hit); setEditText(shape.text);  setSelectedId(hit); }
  }

  function commitEdit() {
    if (!editingId) return;
    const id = editingId, text = editText;
    setEditingId(null); setEditText("");
    const next = shapes.map(s => {
      if (s.id !== id) return s;
      if (s.type === "rect") return { ...s, label: text };
      if (s.type === "text") return text.trim() ? { ...s, text } : s;
      return s;
    });
    commit(next);
  }

  const editingShape = editingId ? (shapes.find(s => s.id === editingId) ?? null) : null;

  const cursorMap: Record<Tool, string> = {
    select: "default", rect: "crosshair", line: "crosshair",
    arrow: "crosshair", text: "text", sticky: "copy",
    pan: drag.current?.kind === "pan" ? "grabbing" : "grab",
  };

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const zoomPct = Math.round(zoom * 100);

  return (
    <div className="wb">
      {/* Compact toolbar */}
      <div className="wb__toolbar">
        <span className="wb__brand" title="Doodle Board">🎨</span>
        <div className="wb__sep" />

        {/* Drawing tools */}
        <div className="wb__tools">
          {(Object.keys(TOOL_ICONS) as Tool[]).map(t => (
            <button
              key={t}
              className={`wb__tool${tool === t ? " wb__tool--active" : ""}`}
              onClick={() => { setTool(t); commitEdit(); }}
              title={TOOL_TIPS[t]}
            >{TOOL_ICONS[t]}</button>
          ))}
        </div>

        <div className="wb__sep" />

        {/* Pen colors */}
        <div className="wb__colors">
          {PEN_COLORS.map(c => (
            <button
              key={c}
              className={`wb__color${penColor === c ? " wb__color--active" : ""}`}
              style={{ background: c }}
              onClick={() => setPenColor(c)}
              title={c}
            />
          ))}
        </div>

        <div className="wb__sep" />

        {/* Zoom */}
        <div className="wb__tools">
          <button className="wb__tool" onClick={() => zoomBy(1.25)} title="Zoom in  (=)">⊕</button>
          <button className="wb__tool" onClick={() => zoomBy(1 / 1.25)} title="Zoom out  (-)">⊖</button>
          <button className="wb__tool" onClick={resetView} title={`Reset zoom  (Ctrl+0) — ${zoomPct}%`}
            style={{ fontSize: 9, width: 36 }}
          >{zoomPct}%</button>
        </div>

        {/* Actions */}
        <div className="wb__actions">
          <button className="wb__action" onClick={undo}  disabled={!canUndo} title="Undo  (Ctrl+Z)">↩</button>
          <button className="wb__action" onClick={redo}  disabled={!canRedo} title="Redo  (Ctrl+Shift+Z)">↪</button>
          <button className="wb__action" onClick={saveAsPng} title="Save as PNG  (Ctrl+S)">💾</button>
          <button
            className="wb__action wb__action--danger"
            onClick={deleteSelected}
            disabled={!selectedId}
            title="Delete selected  (Del)"
          >🗑</button>
          <button
            className="wb__action"
            onClick={() => { commit([]); setSelectedId(null); }}
            title="Clear all"
          >⊘</button>
          <button
            className="wb__action wb__action--close"
            onClick={() => onClose ? onClose() : window.close()}
            title="Close  (Esc)"
          >✕</button>
        </div>
      </div>

      {/* Canvas */}
      <div className="wb__wrap" ref={wrapRef}>
        {canvasW > 0 && canvasH > 0 && (
          <svg
            ref={svgRef}
            width={canvasW}
            height={canvasH}
            viewBox={`${panX} ${panY} ${canvasW / zoom} ${canvasH / zoom}`}
            className="wb__svg"
            style={{ cursor: cursorMap[tool] }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onDoubleClick={onDblClick}
          >
            <defs>
              <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="0"  cy="0"  r="1" fill="#cbd5e1" />
                <circle cx="28" cy="0"  r="1" fill="#cbd5e1" />
                <circle cx="0"  cy="28" r="1" fill="#cbd5e1" />
                <circle cx="28" cy="28" r="1" fill="#cbd5e1" />
              </pattern>
            </defs>
            {/* Large background — covers any pan/zoom */}
            <rect x="-9999" y="-9999" width="29998" height="29998" fill="#f8fafc" />
            <rect x="-9999" y="-9999" width="29998" height="29998" fill="url(#dots)"
              style={{ pointerEvents: "none" }} />

            <g ref={shapesGRef} />

            {/* Text editing overlays */}
            {editingShape !== null && editingShape.type === "rect" && (
              <foreignObject x={editingShape.x + 4} y={editingShape.y + 4}
                width={editingShape.w - 8} height={editingShape.h - 8}>
                {/* @ts-ignore */}
                <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: "100%", height: "100%" }}>
                  <textarea autoFocus value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => {
                      if (e.key === "Escape") { setEditingId(null); setEditText(""); }
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); }
                    }}
                    style={{ width: "100%", height: "100%", border: "none", outline: "none",
                      background: "transparent", resize: "none", textAlign: "center",
                      font: `${(shapes as any).__nodeFontSize ?? 12}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
                      color: editingShape.fill === "#6366f1" ? "#fff" : "#1e293b", padding: "2px" }}
                  />
                </div>
              </foreignObject>
            )}

            {editingShape !== null && editingShape.type === "text" && (
              <foreignObject x={editingShape.x - 4} y={editingShape.y - 22} width={260} height={32}>
                {/* @ts-ignore */}
                <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: "100%", height: "100%" }}>
                  <input autoFocus value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => {
                      if (e.key === "Escape") { setEditingId(null); setEditText(""); }
                      if (e.key === "Enter") commitEdit();
                    }}
                    style={{ width: "100%", height: "100%", border: "1.5px solid #6366f1",
                      borderRadius: "4px", padding: "2px 6px", outline: "none",
                      font: "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                      color: editingShape.color, background: "#fff" }}
                  />
                </div>
              </foreignObject>
            )}
          </svg>
        )}
      </div>

      {/* Hint bar */}
      <div className="wb__hint">
        ↖ select+move &nbsp;·&nbsp; □ box &nbsp;·&nbsp; → arrow &nbsp;·&nbsp; 📌 sticky note &nbsp;·&nbsp;
        ✋ pan &nbsp;·&nbsp; T text &nbsp;·&nbsp; dbl-click = edit &nbsp;·&nbsp;
        Ctrl+scroll = zoom &nbsp;·&nbsp; Del = delete &nbsp;·&nbsp; Esc = close
      </div>
    </div>
  );
}
