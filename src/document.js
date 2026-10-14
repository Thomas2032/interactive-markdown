/**
 * Document model for the preview block editor.
 * Markdown stays the source of truth: parseDocument reads it, serializeDocument writes it back.
 */

import { parseIvm, splitIvmFences } from "./parse-ivm.js";
import { quoteGraphLabel, serializeGraph } from "./graph-editor.js";

/** @typedef {'rect'|'circle'|'ellipse'|'line'|'path'|'text'} ShapeType */
/** @typedef {{ type: ShapeType, attrs: Record<string, string> }} Shape */
/** @typedef {{ nodes: {id:string,label:string,x:number,y:number,kind:string}[], edges: {from:string,to:string}[] }} GraphModel */

/**
 * @typedef {object} BlockBase
 * @property {string} id
 */

let seq = 1;
function nid() {
  return "b" + seq++;
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SIMPLE_TAGS = new Set(["svg", "g", "rect", "circle", "ellipse", "line", "path", "text"]);
const SHAPE_TAGS = new Set(["rect", "circle", "ellipse", "line", "path", "text"]);

const CONTROL_PREFIX = {
  slider: "s",
  timer: "t",
  input: "in",
  toggle: "c",
  let: "y",
};

/**
 * @param {string} markdown
 * @returns {{ blocks: object[] }}
 */
export function parseDocument(markdown) {
  const segments = splitIvmFences(markdown);
  /** @type {object[]} */
  const blocks = [];
  for (const seg of segments) {
    if (seg.type === "ivm") blocks.push(blockFromIvm(seg.content));
    else blocks.push(...parseProse(seg.content));
  }
  return { blocks };
}

/**
 * @returns {{ blocks: object[] }}
 */
export function blankDocument() {
  return { blocks: [] };
}

/**
 * @param {object[]} blocks
 * @returns {string}
 */
export function serializeDocument(blocks) {
  const parts = [];
  for (const block of blocks || []) {
    const text = serializeBlock(block).replace(/\s+$/, "");
    if (text) parts.push(text);
  }
  if (!parts.length) return "\n";
  return parts.join("\n\n") + "\n";
}

/**
 * Fence body for one figure or graph. Used by the live preview.
 * @param {object} block
 * @returns {string}
 */
export function serializeFigure(block) {
  if (!block) return "\n";
  if (block.type === "graph") return serializeGraph(block.model || { nodes: [], edges: [] });
  if (block.type !== "figure") return "\n";
  const lines = [];
  if (block.namespace) lines.push(`@ns ${block.namespace}`);
  for (const control of block.controls || []) {
    const line = serializeControl(control);
    if (line) lines.push(line);
  }
  const svg = svgMarkup(block);
  if (svg) {
    lines.push("@svg");
    lines.push(svg);
  }
  return lines.join("\n").replace(/\s*$/, "\n");
}

/**
 * @param {{ blocks?: object[] }} doc
 * @param {string} feature
 * @param {{ at?: number, figureId?: string, shapeType?: string, customSvg?: string, viewBox?: string }} [options]
 * @returns {{ doc: { blocks: object[] }, focusId: string }}
 */
export function insertFeature(doc, feature, options = {}) {
  const blocks = (doc?.blocks || []).map(cloneBlock);
  const at = options.at;
  /** @type {string} */
  let focusId = "";

  const place = (block) => {
    const index = at == null ? blocks.length : Math.max(0, Math.min(blocks.length, at));
    blocks.splice(index, 0, block);
    focusId = block.id;
    return block;
  };

  if (feature === "heading") {
    place({ id: nid(), type: "heading", level: 2, text: "Heading" });
  } else if (feature === "paragraph") {
    place({ id: nid(), type: "paragraph", text: "" });
  } else if (feature === "bullets") {
    place({ id: nid(), type: "bullets", items: ["Item"] });
  } else if (feature === "graph") {
    place({ id: nid(), type: "graph", model: { nodes: [], edges: [] } });
  } else if (feature === "animated") {
    place({
      id: nid(),
      type: "figure",
      namespace: null,
      controls: [],
      viewBox: options.viewBox || "0 0 1000 720",
      shapes: null,
      customSvg: options.customSvg || "",
    });
  } else if (feature === "shape") {
    const shape = defaultShape(options.shapeType || "rect");
    const existing = findFigure(blocks, options.figureId);
    if (existing && existing.shapes && !existing.customSvg) {
      existing.shapes.push(shape);
      focusId = existing.id;
    } else {
      const fig = emptyFigure();
      fig.shapes = [shape];
      place(fig);
    }
  } else if (feature === "slider" || feature === "timer" || feature === "input" || feature === "toggle" || feature === "formula") {
    const kind = feature === "formula" ? "let" : feature;
    const control = defaultControl(kind, nextControlName(blocks, CONTROL_PREFIX[kind]));
    const existing = findFigure(blocks, options.figureId);
    if (existing) {
      existing.controls.push(control);
      focusId = existing.id;
    } else {
      const fig = emptyFigure();
      fig.controls.push(control);
      place(fig);
    }
  }

  return { doc: { blocks }, focusId };
}

/**
 * @param {{ blocks?: object[] }} doc
 * @param {string} id
 * @returns {{ blocks: object[] }}
 */
export function removeBlock(doc, id) {
  return { blocks: (doc?.blocks || []).filter((b) => b.id !== id).map(cloneBlock) };
}

/**
 * @param {{ blocks?: object[] }} doc
 * @param {string} id
 * @param {number} delta
 * @returns {{ blocks: object[] }}
 */
export function moveBlock(doc, id, delta) {
  const blocks = (doc?.blocks || []).map(cloneBlock);
  const i = blocks.findIndex((b) => b.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= blocks.length) return { blocks };
  const [item] = blocks.splice(i, 1);
  blocks.splice(j, 0, item);
  return { blocks };
}

/**
 * @param {{ blocks?: object[] }} doc
 * @param {string} id
 * @param {object} patch
 * @returns {{ blocks: object[] }}
 */
export function updateBlock(doc, id, patch) {
  return {
    blocks: (doc?.blocks || []).map((b) => (b.id === id ? cloneBlock({ ...b, ...patch }) : cloneBlock(b))),
  };
}

/**
 * @param {{ blocks?: object[] }} doc
 * @param {string} blockId
 * @param {number} index
 * @param {object} patch
 * @returns {{ blocks: object[] }}
 */
export function updateControl(doc, blockId, index, patch) {
  return {
    blocks: (doc?.blocks || []).map((b) => {
      const copy = cloneBlock(b);
      if (copy.id === blockId && copy.type === "figure" && copy.controls[index]) {
        copy.controls[index] = cloneControl({ ...copy.controls[index], ...patch });
      }
      return copy;
    }),
  };
}

/**
 * @param {{ blocks?: object[] }} doc
 * @param {string} blockId
 * @param {number} index
 * @returns {{ blocks: object[] }}
 */
export function removeControl(doc, blockId, index) {
  return {
    blocks: (doc?.blocks || []).map((b) => {
      const copy = cloneBlock(b);
      if (copy.id === blockId && copy.type === "figure") {
        copy.controls = copy.controls.filter((_, i) => i !== index);
      }
      return copy;
    }),
  };
}

/**
 * @param {{ blocks?: object[] }} doc
 * @param {string} blockId
 * @param {number} index
 * @param {Record<string, string>} attrs
 * @returns {{ blocks: object[] }}
 */
export function updateShape(doc, blockId, index, attrs) {
  return {
    blocks: (doc?.blocks || []).map((b) => {
      const copy = cloneBlock(b);
      if (copy.id === blockId && copy.type === "figure" && copy.shapes && copy.shapes[index]) {
        copy.shapes[index] = {
          type: copy.shapes[index].type,
          attrs: { ...copy.shapes[index].attrs, ...attrs },
        };
      }
      return copy;
    }),
  };
}

/**
 * @param {{ blocks?: object[] }} doc
 * @param {string} blockId
 * @param {number} index
 * @returns {{ blocks: object[] }}
 */
export function removeShape(doc, blockId, index) {
  return {
    blocks: (doc?.blocks || []).map((b) => {
      const copy = cloneBlock(b);
      if (copy.id === blockId && copy.type === "figure" && copy.shapes) {
        copy.shapes = copy.shapes.filter((_, i) => i !== index);
      }
      return copy;
    }),
  };
}

export { NAME_RE };

function emptyFigure() {
  return {
    id: nid(),
    type: "figure",
    namespace: null,
    controls: [],
    viewBox: "0 0 200 120",
    shapes: [],
    customSvg: null,
  };
}

/**
 * @param {object[]} blocks
 * @param {string} [id]
 */
function findFigure(blocks, id) {
  if (!id) return null;
  const block = blocks.find((b) => b.id === id && b.type === "figure");
  return block || null;
}

/**
 * @param {object[]} blocks
 * @param {string} prefix
 */
function nextControlName(blocks, prefix) {
  const used = new Set();
  for (const block of blocks) {
    if (block.type !== "figure") continue;
    for (const control of block.controls || []) {
      if (control.name) used.add(control.name);
    }
  }
  let i = 1;
  while (used.has(prefix + i)) i++;
  return prefix + i;
}

/**
 * @param {string} kind
 * @param {string} name
 */
function defaultControl(kind, name) {
  if (kind === "slider") {
    return { kind, name, range: [0, 100], step: 1, default: 50, label: "Slider" };
  }
  if (kind === "timer") {
    return { kind, name, range: [0, 100], step: 1, default: 0, speed: 20, loop: true, label: "Timer" };
  }
  if (kind === "input") return { kind, name, default: "", label: "Text" };
  if (kind === "toggle") return { kind, name, default: false, label: "Toggle" };
  return { kind: "let", name, expression: "0" };
}

/**
 * @param {string} type
 * @returns {Shape}
 */
function defaultShape(type) {
  if (type === "circle") return { type, attrs: { cx: "40", cy: "40", r: "16", fill: "#38bdf8" } };
  if (type === "ellipse") return { type, attrs: { cx: "40", cy: "40", rx: "24", ry: "14", fill: "#38bdf8" } };
  if (type === "line") {
    return { type, attrs: { x1: "8", y1: "40", x2: "120", y2: "40", stroke: "#38bdf8", "stroke-width": "2" } };
  }
  if (type === "path") {
    return {
      type,
      attrs: { d: "M 8 40 Q 40 8 72 40", fill: "none", stroke: "#38bdf8", "stroke-width": "2" },
    };
  }
  if (type === "text") {
    return { type, attrs: { x: "8", y: "24", fill: "#e5e7eb", "font-size": "14", text: "Label" } };
  }
  return { type: "rect", attrs: { x: "8", y: "8", width: "80", height: "40", fill: "#1e293b" } };
}

/**
 * @param {string} content
 */
function parseProse(content) {
  const lines = String(content).replace(/\r\n/g, "\n").split("\n");
  /** @type {object[]} */
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }
    if (lines[i].startsWith("```")) {
      const start = i;
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) i++;
      if (i < lines.length) i++;
      blocks.push({ id: nid(), type: "markdown", text: lines.slice(start, i).join("\n") });
      continue;
    }
    const heading = lines[i].match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ id: nid(), type: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(lines[i])) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ id: nid(), type: "bullets", items });
      continue;
    }
    const start = i;
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("```") &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      i++;
    }
    blocks.push({ id: nid(), type: "paragraph", text: lines.slice(start, i).join("\n").trim() });
  }
  return blocks;
}

/**
 * @param {string} body
 */
function blockFromIvm(body) {
  const parsed = parseIvm(body);
  if (parsed.graph) {
    return {
      id: nid(),
      type: "graph",
      model: {
        nodes: parsed.graph.nodes.map((n) => ({ ...n })),
        edges: parsed.graph.edges.map((e) => ({ ...e })),
      },
    };
  }
  const template = parsed.templateSvg;
  const shapes = template ? tryParseShapes(template) : [];
  const custom = shapes == null;
  return {
    id: nid(),
    type: "figure",
    namespace: parsed.namespace,
    controls: parsed.controls.map(cloneControl),
    viewBox: (template && readViewBox(template)) || "0 0 200 120",
    shapes: custom ? null : shapes,
    customSvg: custom ? template : null,
  };
}

/**
 * @param {string} svg
 * @returns {Shape[] | null}
 */
function tryParseShapes(svg) {
  const Parser = globalThis.DOMParser;
  if (!Parser) return null;
  let doc;
  try {
    doc = new Parser().parseFromString(svg, "image/svg+xml");
  } catch (_) {
    return null;
  }
  const root = doc.documentElement;
  const rootName = String(root?.localName || root?.tagName || "").toLowerCase();
  if (!root || rootName !== "svg") return null;
  if (typeof doc.querySelector === "function" && doc.querySelector("parsererror")) return null;
  /** @type {Shape[]} */
  const shapes = [];
  const walk = (el) => {
    const tag = String(el.localName || el.tagName || "").toLowerCase();
    if (!SIMPLE_TAGS.has(tag)) return false;
    if (tag === "svg" || tag === "g") {
      if (tag === "g" && el.attributes && el.attributes.length > 0) return false;
      for (const child of el.children || []) {
        if (!walk(child)) return false;
      }
      return true;
    }
    if (!SHAPE_TAGS.has(tag)) return false;
    if (tag === "text" && el.children && el.children.length > 0) return false;
    /** @type {Record<string, string>} */
    const attrs = {};
    if (el.attributes) {
      for (const attr of el.attributes) attrs[attr.name] = attr.value;
    }
    if (tag === "text") attrs.text = String(el.textContent || "").trim();
    shapes.push({ type: /** @type {ShapeType} */ (tag), attrs });
    return true;
  };
  if (!walk(root)) return null;
  return shapes;
}

/**
 * @param {string} svg
 */
function readViewBox(svg) {
  const match = String(svg).match(/viewBox\s*=\s*"([^"]*)"/i) || String(svg).match(/viewBox\s*=\s*'([^']*)'/i);
  return match ? match[1] : "";
}

/**
 * @param {object} block
 */
function serializeBlock(block) {
  if (!block) return "";
  if (block.type === "heading") {
    const level = Math.min(3, Math.max(1, Number(block.level) || 1));
    return `${"#".repeat(level)} ${block.text ?? ""}`;
  }
  if (block.type === "paragraph") return String(block.text ?? "");
  if (block.type === "bullets") {
    return (block.items || []).map((item) => `- ${item}`).join("\n");
  }
  if (block.type === "markdown") return String(block.text ?? "");
  if (block.type === "graph" || block.type === "figure") {
    return "```ivm\n" + serializeFigure(block).replace(/\s*$/, "\n") + "```";
  }
  return "";
}

/**
 * @param {object} block
 */
function svgMarkup(block) {
  if (block.customSvg) return String(block.customSvg).replace(/\s+$/, "");
  if (!block.shapes || !block.shapes.length) return "";
  const viewBox = block.viewBox || "0 0 200 120";
  const body = block.shapes.map(serializeShape).join("\n  ");
  return `<svg viewBox="${escapeAttr(viewBox)}" width="100%" xmlns="http://www.w3.org/2000/svg">\n  ${body}\n</svg>`;
}

/**
 * @param {Shape} shape
 */
function serializeShape(shape) {
  const attrs = Object.entries(shape.attrs || {})
    .filter(([key, value]) => key !== "text" && value !== "")
    .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
    .join(" ");
  if (shape.type === "text") {
    return `<text${attrs ? " " + attrs : ""}>${escapeText(shape.attrs?.text ?? "")}</text>`;
  }
  return `<${shape.type}${attrs ? " " + attrs : ""}/>`;
}

/**
 * @param {object} control
 */
function serializeControl(control) {
  if (!control || !control.name) return "";
  if (control.kind === "let") return `@let ${control.name} = ${control.expression ?? "0"}`;
  if (control.kind === "slider" || control.kind === "timer") {
    const range = control.range || [0, 100];
    let line = `@${control.kind} ${control.name}: ${fmtNum(range[0])}..${fmtNum(range[1])} = ${fmtNum(control.default)}`;
    if (control.kind === "timer") line += ` speed=${fmtNum(control.speed ?? 20)}`;
    line += ` step=${fmtNum(control.step ?? 1)}`;
    if (control.kind === "timer") line += control.loop === false ? " noloop" : " loop";
    if (control.label) line += " " + quoteGraphLabel(control.label);
    return line;
  }
  if (control.kind === "input") {
    let line = `@input ${control.name}: ${quoteGraphLabel(control.default ?? "")}`;
    if (control.label) line += " " + quoteGraphLabel(control.label);
    return line;
  }
  if (control.kind === "toggle") {
    let line = `@toggle ${control.name}: ${control.default ? "true" : "false"}`;
    if (control.label) line += " " + quoteGraphLabel(control.label);
    return line;
  }
  return "";
}

function fmtNum(n) {
  const value = Number(n);
  return Number.isFinite(value) ? String(value) : "0";
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

/**
 * @param {object} control
 */
function cloneControl(control) {
  return {
    ...control,
    range: control.range ? [control.range[0], control.range[1]] : control.range,
  };
}

/**
 * @param {object} block
 */
function cloneBlock(block) {
  if (!block) return block;
  if (block.type === "bullets") return { ...block, items: (block.items || []).slice() };
  if (block.type === "graph") {
    const model = block.model || { nodes: [], edges: [] };
    return {
      ...block,
      model: {
        nodes: (model.nodes || []).map((n) => ({ ...n })),
        edges: (model.edges || []).map((e) => ({ ...e })),
      },
    };
  }
  if (block.type === "figure") {
    return {
      ...block,
      controls: (block.controls || []).map(cloneControl),
      shapes: block.shapes ? block.shapes.map((shape) => ({ type: shape.type, attrs: { ...shape.attrs } })) : null,
    };
  }
  return { ...block };
}
