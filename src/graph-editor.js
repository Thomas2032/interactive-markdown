/**
 * Directed-graph preview (read-only by default).
 * The model is plain data ({ nodes, edges }) so it can be stored in an ```ivm @graph fence.
 * Pass `{ editable: true }` to enable the legacy interactive editor chrome (tests only).
 * Gestures: drag a node, drag a side port onto another node, double-click to add or rename.
 */

export const NODE_W = 168;
export const NODE_H = 56;

export const GRAPH_KINDS = Object.freeze(["action", "input", "output", "decision"]);
export const GRAPH_SIDES = Object.freeze([
  "top",
  "right",
  "bottom",
  "left",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);
export const GRAPH_PATHS = Object.freeze(["ortho", "straight", "curve"]);

const KIND_SET = new Set(GRAPH_KINDS);
const SIDE_SET = new Set(GRAPH_SIDES);
const SIDE_ALIASES = Object.freeze({
  left: "left",
  right: "right",
  top: "top",
  bottom: "bottom",
  "top-left": "top-left",
  tl: "top-left",
  "top-right": "top-right",
  tr: "top-right",
  "bottom-left": "bottom-left",
  bl: "bottom-left",
  "bottom-right": "bottom-right",
  br: "bottom-right",
});
const DEFAULT_SPEED = 2.8;

/**
 * @typedef {"left"|"right"|"top"|"bottom"|"top-left"|"top-right"|"bottom-left"|"bottom-right"} GraphSide
 * @typedef {"ortho"|"straight"|"curve"} GraphPath
 * @typedef {"forward"|"reverse"} GraphDirection
 * @typedef {{ id: string, label: string, x: number, y: number, kind: string, lane?: string, group?: string }} GraphNode
 * @typedef {{ from: string, to: string, fromSide?: GraphSide, toSide?: GraphSide }} GraphEdge
 * @typedef {{ path: GraphPath, quantity: number, direction: GraphDirection, speed: number, quantityFrom?: string, speedFrom?: string }} GraphMotion
 * @typedef {{ id: string, label: string, y: number, height: number, fill?: string }} GraphLane
 * @typedef {{ id: string, label: string }} GraphGroup
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[], animated?: boolean, motion?: GraphMotion, lanes?: GraphLane[], groups?: GraphGroup[] }} GraphModel
 * @typedef {{ type: 'node', id: string } | { type: 'edge', index: number }} GraphSelection
 */

/** @param {unknown} kind */
export function normalizeKind(kind) {
  const k = String(kind || "action").toLowerCase();
  return KIND_SET.has(k) ? k : "action";
}

/**
 * @param {unknown} side
 * @param {GraphSide} fallback
 * @returns {GraphSide}
 */
export function normalizeSide(side, fallback) {
  const raw = String(side || fallback).toLowerCase();
  const mapped = Object.prototype.hasOwnProperty.call(SIDE_ALIASES, raw) ? SIDE_ALIASES[raw] : raw;
  return SIDE_SET.has(mapped) ? /** @type {GraphSide} */ (mapped) : fallback;
}

/**
 * @param {Partial<GraphMotion> | null | undefined} motion
 * @returns {GraphMotion}
 */
export function normalizeMotion(motion) {
  const path = String(motion?.path || "ortho").toLowerCase();
  const direction = String(motion?.direction || "forward").toLowerCase();
  let quantity = Math.round(Number(motion?.quantity ?? 1));
  if (!Number.isFinite(quantity)) quantity = 1;
  quantity = Math.min(12, Math.max(1, quantity));
  let speed = Number(motion?.speed ?? DEFAULT_SPEED);
  if (!Number.isFinite(speed)) speed = DEFAULT_SPEED;
  speed = Math.min(30, Math.max(0.2, Math.round(speed * 10) / 10));
  /** @type {GraphMotion} */
  const next = {
    path: path === "straight" || path === "curve" ? /** @type {GraphPath} */ (path) : "ortho",
    quantity,
    direction: direction === "reverse" ? "reverse" : "forward",
    speed,
  };
  if (motion?.quantityFrom && /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(motion.quantityFrom))) {
    next.quantityFrom = String(motion.quantityFrom);
  }
  if (motion?.speedFrom && /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(motion.speedFrom))) {
    next.speedFrom = String(motion.speedFrom);
  }
  return next;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function snap(n) {
  return Math.round(n / 8) * 8;
}

/** @param {GraphNode[]} nodes */
export function nextNodeId(nodes) {
  const used = new Set(nodes.map((n) => n.id));
  let i = 1;
  while (used.has("n" + i)) i++;
  return "n" + i;
}

/**
 * @param {GraphNode[]} nodes
 * @returns {{ x: number, y: number }}
 */
export function nextNodePosition(nodes) {
  for (let i = 0; i < 300; i++) {
    const x = 32 + (i % 3) * 208;
    const y = 32 + Math.floor(i / 3) * 104;
    const blocked = nodes.some(
      (n) => Math.abs(n.x - x) < NODE_W + 16 && Math.abs(n.y - y) < NODE_H + 16
    );
    if (!blocked) return { x, y };
  }
  return { x: 32, y: 32 + nodes.length * 104 };
}

/**
 * @param {string} label
 * @returns {string}
 */
export function quoteGraphLabel(label) {
  return '"' + String(label ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/**
 * @param {GraphModel} model
 * @returns {string}
 */
export function serializeGraph(model) {
  const lines = [model.layout ? `@graph layout=${model.layout}` : "@graph"];
  if (model.animated) lines.push(serializeAnimate(model.motion));
  for (const lane of model.lanes || []) {
    let line = `@lane ${lane.id}: ${quoteGraphLabel(lane.label)} y=${Math.round(lane.y)} height=${Math.round(lane.height)}`;
    if (lane.fill) line += ` fill=${lane.fill}`;
    lines.push(line);
  }
  for (const group of model.groups || []) {
    lines.push(`@group ${group.id}: ${quoteGraphLabel(group.label)}`);
  }
  for (const n of model.nodes) {
    const kind = n.kind && n.kind !== "action" ? ` kind=${n.kind}` : "";
    const lane = n.lane ? ` lane=${n.lane}` : "";
    const group = n.group ? ` group=${n.group}` : "";
    // Keep autoPos nodes coordinate-free when layout= is set so parse re-layouts.
    const coords =
      model.layout && n.autoPos
        ? ""
        : ` x=${Math.round(n.x)} y=${Math.round(n.y)}`;
    lines.push(
      `@node ${n.id}: ${quoteGraphLabel(n.label)}${coords}${kind}${lane}${group}`
    );
  }
  for (const e of model.edges) lines.push(serializeEdge(e));
  return lines.join("\n") + "\n";
}

/**
 * @param {Partial<GraphMotion> | null | undefined} motion
 */
function serializeAnimate(motion) {
  const next = normalizeMotion(motion);
  const quantity = next.quantityFrom || String(next.quantity);
  const speed = next.speedFrom || String(next.speed);
  return `@animate path=${next.path} quantity=${quantity} direction=${next.direction} speed=${speed}`;
}

/**
 * @param {GraphEdge} edge
 */
function serializeEdge(edge) {
  let line = `@edge ${edge.from} -> ${edge.to}`;
  const fromSide = normalizeSide(edge.fromSide, "right");
  const toSide = normalizeSide(edge.toSide, "left");
  if (fromSide !== "right") line += ` from=${fromSide}`;
  if (toSide !== "left") line += ` to=${toSide}`;
  return line;
}

/**
 * @param {GraphModel} model
 * @param {{ x?: number, y?: number, label?: string, kind?: string }} [partial]
 * @returns {GraphModel}
 */
export function addNode(model, partial = {}) {
  const pos = nextNodePosition(model.nodes);
  const node = {
    id: nextNodeId(model.nodes),
    label: partial.label?.trim() ? partial.label.trim() : "Node",
    x: partial.x == null ? pos.x : snap(clamp(partial.x, 0, 4000)),
    y: partial.y == null ? pos.y : snap(clamp(partial.y, 0, 4000)),
    kind: normalizeKind(partial.kind),
  };
  return carry(model, { nodes: model.nodes.concat(node), edges: model.edges.map((e) => ({ ...e })) });
}

/**
 * @param {GraphModel} model
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @returns {GraphModel}
 */
export function moveNode(model, id, x, y) {
  return carry(model, {
    nodes: model.nodes.map((n) => {
      if (n.id !== id) return { ...n };
      const next = { ...n, x: snap(clamp(x, 0, 4000)), y: snap(clamp(y, 0, 4000)) };
      delete next.autoPos; // drag makes position explicit
      return next;
    }),
    edges: model.edges.map((e) => ({ ...e })),
  });
}

/**
 * @param {GraphModel} model
 * @param {string} id
 * @param {string} label
 * @returns {GraphModel}
 */
export function renameNode(model, id, label) {
  const next = String(label ?? "").trim();
  return carry(model, {
    nodes: model.nodes.map((n) => (n.id === id ? { ...n, label: next || n.label } : { ...n })),
    edges: model.edges.map((e) => ({ ...e })),
  });
}

/**
 * @param {GraphModel} model
 * @param {string} id
 * @param {string} kind
 * @returns {GraphModel}
 */
export function setNodeKind(model, id, kind) {
  const k = normalizeKind(kind);
  return carry(model, {
    nodes: model.nodes.map((n) => (n.id === id ? { ...n, kind: k } : { ...n })),
    edges: model.edges.map((e) => ({ ...e })),
  });
}

/**
 * @param {GraphModel} model
 * @param {string} from
 * @param {string} to
 * @param {{ fromSide?: GraphSide, toSide?: GraphSide }} [sides]
 * @returns {{ model: GraphModel, ok: boolean, reason?: string }}
 */
export function addEdge(model, from, to, sides = {}) {
  if (!from || !to) return { model, ok: false, reason: "missing" };
  if (!model.nodes.some((n) => n.id === from) || !model.nodes.some((n) => n.id === to)) {
    return { model, ok: false, reason: "missing" };
  }
  if (model.edges.some((e) => e.from === from && e.to === to)) {
    return { model, ok: false, reason: "duplicate" };
  }
  /** @type {GraphEdge} */
  const edge = { from, to };
  const fromSide = normalizeSide(sides.fromSide, "right");
  const toSide = normalizeSide(sides.toSide, "left");
  if (fromSide !== "right") edge.fromSide = fromSide;
  if (toSide !== "left") edge.toSide = toSide;
  return {
    model: carry(model, {
      nodes: model.nodes.map((n) => ({ ...n })),
      edges: model.edges.concat(edge),
    }),
    ok: true,
  };
}

/**
 * @param {GraphModel} model
 * @param {Partial<GraphMotion>} patch
 * @returns {GraphModel}
 */
export function setMotion(model, patch) {
  const base = { ...normalizeMotion(model.motion) };
  // Editing a literal quantity/speed clears any env binding for that field.
  if (Object.prototype.hasOwnProperty.call(patch, "quantity") && !Object.prototype.hasOwnProperty.call(patch, "quantityFrom")) {
    delete base.quantityFrom;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "speed") && !Object.prototype.hasOwnProperty.call(patch, "speedFrom")) {
    delete base.speedFrom;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "quantityFrom") && patch.quantityFrom == null) {
    delete base.quantityFrom;
    delete patch.quantityFrom;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "speedFrom") && patch.speedFrom == null) {
    delete base.speedFrom;
    delete patch.speedFrom;
  }
  const motion = normalizeMotion({ ...base, ...patch });
  const next = carry(model, {
    nodes: model.nodes.map((n) => ({ ...n })),
    edges: model.edges.map((e) => ({ ...e })),
  });
  next.animated = true;
  next.motion = motion;
  return next;
}

/**
 * @param {GraphModel} model
 * @param {GraphSelection | null} selection
 * @returns {GraphModel}
 */
export function removeSelection(model, selection) {
  if (!selection) return model;
  if (selection.type === "node") {
    return carry(model, {
      nodes: model.nodes.filter((n) => n.id !== selection.id),
      edges: model.edges.filter((e) => e.from !== selection.id && e.to !== selection.id),
    });
  }
  return carry(model, {
    nodes: model.nodes.map((n) => ({ ...n })),
    edges: model.edges.filter((_, i) => i !== selection.index),
  });
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => "\\" + ch);
}

function cloneModel(model) {
  return carry(model, {
    nodes: model.nodes.map((n) => ({ ...n })),
    edges: model.edges.map((e) => ({ ...e })),
    lanes: (model.lanes || []).map((l) => ({ ...l })),
    groups: (model.groups || []).map((g) => ({ ...g })),
  });
}

/** @param {GraphModel} model @param {GraphModel} next */
function carry(model, next) {
  if (model && model.animated) next.animated = true;
  if (next.motion == null && model && model.motion) next.motion = normalizeMotion(model.motion);
  if (next.lanes == null && model && model.lanes) next.lanes = model.lanes.map((l) => ({ ...l }));
  if (next.groups == null && model && model.groups) next.groups = model.groups.map((g) => ({ ...g }));
  if (next.layout == null && model && model.layout) next.layout = model.layout;
  return next;
}

function approachX(to) {
  return to.x - 22;
}

function edgeTip(to) {
  const y = to.y + NODE_H / 2;
  return `M ${approachX(to)} ${y} H ${to.x - 6}`;
}

function edgePath(from, to) {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = approachX(to);
  const y2 = to.y + NODE_H / 2;
  const overlapsX = from.x < to.x + NODE_W - 8 && to.x < from.x + NODE_W - 8;
  if (Math.abs(y1 - y2) < 6 && x2 >= x1) return `M ${x1} ${y1} H ${x2}`;
  if (overlapsX && Math.abs(y2 - y1) > NODE_H) {
    const gap = y2 > y1 ? from.y + NODE_H + 16 : from.y - 16;
    const xOut = x1 + 10;
    return `M ${x1} ${y1} H ${xOut} V ${gap} H ${x2} V ${y2}`;
  }
  if (x2 >= x1 - 4) {
    const rail = Math.min(x1 + 12, x2);
    return `M ${x1} ${y1} H ${rail} V ${y2} H ${x2}`;
  }
  const yOut =
    y2 >= y1
      ? Math.max(from.y + NODE_H, to.y + NODE_H) + 24
      : Math.min(from.y, to.y) - 24;
  return `M ${x1} ${y1} H ${x1 + 18} V ${yOut} H ${x2} V ${y2}`;
}

/**
 * @param {GraphNode} node
 * @param {GraphSide} side
 */
function sideAnchor(node, side) {
  const s = normalizeSide(side, "right");
  if (s === "left") return { x: node.x, y: node.y + NODE_H / 2, dx: -1, dy: 0 };
  if (s === "top") return { x: node.x + NODE_W / 2, y: node.y, dx: 0, dy: -1 };
  if (s === "bottom") return { x: node.x + NODE_W / 2, y: node.y + NODE_H, dx: 0, dy: 1 };
  if (s === "top-left") return { x: node.x, y: node.y, dx: -0.7, dy: -0.7 };
  if (s === "top-right") return { x: node.x + NODE_W, y: node.y, dx: 0.7, dy: -0.7 };
  if (s === "bottom-left") return { x: node.x, y: node.y + NODE_H, dx: -0.7, dy: 0.7 };
  if (s === "bottom-right") return { x: node.x + NODE_W, y: node.y + NODE_H, dx: 0.7, dy: 0.7 };
  return { x: node.x + NODE_W, y: node.y + NODE_H / 2, dx: 1, dy: 0 };
}

/**
 * @param {GraphNode} node
 * @param {{ x: number, y: number }} point
 * @returns {GraphSide}
 */
function nearestSide(node, point) {
  const nx = (point.x - (node.x + NODE_W / 2)) / (NODE_W / 2);
  const ny = (point.y - (node.y + NODE_H / 2)) / (NODE_H / 2);
  if (Math.abs(nx) >= Math.abs(ny)) return nx >= 0 ? "right" : "left";
  return ny >= 0 ? "bottom" : "top";
}

/**
 * @param {number} value
 */
function px(value) {
  return String(Math.round(value));
}

/**
 * @param {GraphNode} from
 * @param {GraphNode} to
 * @param {GraphEdge | undefined} edge
 * @param {GraphPath} style
 */
function edgeRoute(from, to, edge, style) {
  const fromSide = normalizeSide(edge?.fromSide, "right");
  const toSide = normalizeSide(edge?.toSide, from === to ? "top" : "left");
  if (from === to || from.id === to.id) {
    return selfRoute(from, fromSide, toSide, style);
  }
  if (style === "ortho" && fromSide === "right" && toSide === "left") {
    return { d: edgePath(from, to), tip: edgeTip(to) };
  }
  return sideRoute(from, to, fromSide, toSide, style);
}

/**
 * Loop path for a self-edge.
 * @param {GraphNode} node
 * @param {GraphSide} fromSide
 * @param {GraphSide} toSide
 * @param {GraphPath} style
 */
function selfRoute(node, fromSide, toSide, style) {
  const a = sideAnchor(node, fromSide);
  const b = sideAnchor(node, toSide);
  const leave = { x: a.x + a.dx * 28, y: a.y + a.dy * 28 };
  const approach = { x: b.x + b.dx * 28, y: b.y + b.dy * 28 };
  const tipEnd = { x: b.x + b.dx * 6, y: b.y + b.dy * 6 };
  const tip = `M ${px(approach.x)} ${px(approach.y)} L ${px(tipEnd.x)} ${px(tipEnd.y)}`;
  const mid = {
    x: (a.x + b.x) / 2 + (a.dx + b.dx) * 36,
    y: (a.y + b.y) / 2 + (a.dy + b.dy) * 36,
  };
  // If ports coincide, push the loop further out along the outward normal.
  if (Math.hypot(a.x - b.x, a.y - b.y) < 4) {
    mid.x = a.x + a.dx * 72;
    mid.y = a.y + a.dy * 72;
  }
  if (style === "straight") {
    return {
      d: `M ${px(a.x)} ${px(a.y)} L ${px(leave.x)} ${px(leave.y)} L ${px(mid.x)} ${px(mid.y)} L ${px(approach.x)} ${px(approach.y)}`,
      tip,
    };
  }
  const c1 = { x: a.x + a.dx * 64, y: a.y + a.dy * 64 };
  const c2 = { x: b.x + b.dx * 64, y: b.y + b.dy * 64 };
  if (style === "curve" || style === "ortho") {
    return {
      d: `M ${px(a.x)} ${px(a.y)} C ${px(c1.x)} ${px(c1.y)} ${px(mid.x)} ${px(mid.y)} ${px(mid.x)} ${px(mid.y)} S ${px(c2.x)} ${px(c2.y)} ${px(approach.x)} ${px(approach.y)}`,
      tip,
    };
  }
  return {
    d: `M ${px(a.x)} ${px(a.y)} L ${px(leave.x)} ${px(leave.y)} L ${px(mid.x)} ${px(mid.y)} L ${px(approach.x)} ${px(approach.y)}`,
    tip,
  };
}

/**
 * @param {GraphNode} from
 * @param {GraphNode} to
 * @param {GraphSide} fromSide
 * @param {GraphSide} toSide
 * @param {GraphPath} style
 */
function sideRoute(from, to, fromSide, toSide, style) {
  const a = sideAnchor(from, fromSide);
  const b = sideAnchor(to, toSide);
  const leave = { x: a.x + a.dx * 18, y: a.y + a.dy * 18 };
  const approach = { x: b.x + b.dx * 18, y: b.y + b.dy * 18 };
  const tipEnd = { x: b.x + b.dx * 6, y: b.y + b.dy * 6 };
  const tip = `M ${px(approach.x)} ${px(approach.y)} L ${px(tipEnd.x)} ${px(tipEnd.y)}`;
  if (style === "straight") {
    return { d: `M ${px(a.x)} ${px(a.y)} L ${px(approach.x)} ${px(approach.y)}`, tip };
  }
  if (style === "curve") {
    const c1 = { x: a.x + a.dx * 64, y: a.y + a.dy * 64 };
    const c2 = { x: b.x + b.dx * 64, y: b.y + b.dy * 64 };
    return {
      d: `M ${px(a.x)} ${px(a.y)} C ${px(c1.x)} ${px(c1.y)} ${px(c2.x)} ${px(c2.y)} ${px(approach.x)} ${px(approach.y)}`,
      tip,
    };
  }
  /** @type {{ x: number, y: number }[]} */
  const pts = [
    { x: a.x, y: a.y },
    leave,
  ];
  if (Math.abs(approach.x - leave.x) >= 1 && Math.abs(approach.y - leave.y) >= 1) {
    if (Math.abs(a.dx) >= Math.abs(a.dy)) pts.push({ x: approach.x, y: leave.y });
    else pts.push({ x: leave.x, y: approach.y });
  }
  pts.push(approach);
  let d = "";
  /** @type {{ x: number, y: number } | null} */
  let prev = null;
  for (const p of pts) {
    if (prev && Math.abs(prev.x - p.x) < 0.5 && Math.abs(prev.y - p.y) < 0.5) continue;
    d += d ? ` L ${px(p.x)} ${px(p.y)}` : `M ${px(p.x)} ${px(p.y)}`;
    prev = p;
  }
  return { d, tip };
}

let mountSeq = 0;

/**
 * Mount a graph preview (read-only unless `editable: true`).
 * @param {HTMLElement} container
 * @param {GraphModel} initial
 * @param {{ onChange?: (model: GraphModel) => void, editable?: boolean }} [options]
 * @returns {{ destroy: () => void, getModel: () => GraphModel, setLiveMotion: (patch: Partial<GraphMotion>|null) => void }}
 */
export function mountGraphEditor(container, initial, options = {}) {
  const doc = container.ownerDocument || globalThis.document;
  const editable = options.editable === true;
  const markerId = "im-graph-arrow-" + ++mountSeq;
  /** @type {GraphModel} */
  let model = cloneModel(initial);
  /** @type {Partial<GraphMotion> | null} */
  let liveMotion = null;
  /** @type {GraphSelection | null} */
  let selection = null;
  let pendingKind = "action";
  let flashTimer = 0;
  /** @type {{ id: string, ox: number, oy: number, pointerId: number, x0: number, y0: number, moved: boolean } | null} */
  let dragging = null;
  /** @type {{ id: string, at: number } | null} */
  let labelTap = null;
  /** @type {{ fromId: string, fromSide: GraphSide, pointerId: number } | null} */
  let connecting = null;
  let dead = false;

  container.innerHTML = "";
  const root = doc.createElement("div");
  root.className = "im-graph";

  const bar = doc.createElement("div");
  bar.className = "im-graph-bar";

  const addBtn = doc.createElement("button");
  addBtn.type = "button";
  addBtn.dataset.action = "add";
  addBtn.textContent = "Add node";

  const kindLabel = doc.createElement("label");
  kindLabel.className = "im-graph-kind-label";
  kindLabel.textContent = "Kind";
  const kindSelect = doc.createElement("select");
  kindSelect.dataset.action = "kind";
  kindSelect.setAttribute("aria-label", "Node kind");
  for (const kind of GRAPH_KINDS) {
    const opt = doc.createElement("option");
    opt.value = kind;
    opt.textContent = kind;
    kindSelect.appendChild(opt);
  }
  kindLabel.appendChild(kindSelect);

  const deleteBtn = doc.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.dataset.action = "delete";
  deleteBtn.textContent = "Delete";

  const countEl = doc.createElement("span");
  countEl.className = "im-graph-count";

  bar.append(addBtn, kindLabel, deleteBtn, countEl);

  const motionBar = doc.createElement("div");
  motionBar.className = "im-graph-motion-bar";
  motionBar.hidden = true;

  const pathCtl = motionSelect("Path", "path", [
    ["ortho", "Orthogonal"],
    ["straight", "Straight"],
    ["curve", "Curve"],
  ]);
  const qtyCtl = motionNumber("Quantity", "quantity", 1, 12, 1);
  const dirCtl = motionSelect("Direction", "direction", [
    ["forward", "Forward"],
    ["reverse", "Reverse"],
  ]);
  const speedCtl = motionNumber("Seconds", "speed", 0.2, 30, 0.1);
  motionBar.append(pathCtl.wrap, qtyCtl.wrap, dirCtl.wrap, speedCtl.wrap);

  const help = doc.createElement("p");
  help.className = "im-graph-help";
  help.textContent =
    "Drag a node to move it. Drag a dot on the top, right, bottom, or left onto another node. Double-click a label to rename, or the canvas to add a node. Delete removes the selection.";

  const canvas = doc.createElement("div");
  canvas.className = "im-graph-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Graph canvas");

  const stage = doc.createElement("div");
  stage.className = "im-graph-stage";

  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "im-graph-edges");
  const defs = doc.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = doc.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", markerId);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto");
  const markerPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  markerPath.setAttribute("d", "M1.2 1.4 L8.4 5 L1.2 8.6");
  markerPath.setAttribute("fill", "none");
  markerPath.setAttribute("stroke", "#b7c6f0");
  markerPath.setAttribute("stroke-width", "1.5");
  markerPath.setAttribute("stroke-linecap", "round");
  markerPath.setAttribute("stroke-linejoin", "round");
  marker.appendChild(markerPath);
  defs.appendChild(marker);
  svg.appendChild(defs);
  const edgeLayer = doc.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(edgeLayer);
  const tempPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  tempPath.setAttribute("class", "im-graph-edge im-graph-edge-temp");
  tempPath.setAttribute("fill", "none");
  svg.appendChild(tempPath);

  const empty = doc.createElement("div");
  empty.className = "im-graph-empty";
  empty.textContent = editable
    ? "This graph is empty. Add a node, or double-click the canvas."
    : "This graph is empty.";

  stage.append(svg, empty);
  canvas.appendChild(stage);
  if (editable) root.append(bar, motionBar, help, canvas);
  else root.append(canvas);
  if (!editable) {
    root.classList.add("im-graph-readonly");
    canvas.removeAttribute("tabIndex");
  }
  container.appendChild(root);

  function commit() {
    if (dead) return;
    options.onChange?.(cloneModel(model));
  }

  function flash(msg) {
    countEl.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(syncChrome, 1400);
  }

  /**
   * @param {string} label
   * @param {string} name
   * @param {[string, string][]} choices
   */
  function motionSelect(label, name, choices) {
    const wrap = doc.createElement("label");
    wrap.className = "im-graph-kind-label";
    wrap.appendChild(doc.createTextNode(label));
    const select = doc.createElement("select");
    select.dataset.motion = name;
    select.setAttribute("aria-label", label);
    for (const [value, text] of choices) {
      const opt = doc.createElement("option");
      opt.value = value;
      opt.textContent = text;
      select.appendChild(opt);
    }
    wrap.appendChild(select);
    return { wrap, select };
  }

  /**
   * @param {string} label
   * @param {string} name
   * @param {number} min
   * @param {number} max
   * @param {number} step
   */
  function motionNumber(label, name, min, max, step) {
    const wrap = doc.createElement("label");
    wrap.className = "im-graph-kind-label";
    wrap.appendChild(doc.createTextNode(label));
    const input = doc.createElement("input");
    // text so bound control names (e.g. dots) can display; numeric values still accepted on change
    input.type = "text";
    input.inputMode = "decimal";
    input.dataset.motion = name;
    input.dataset.min = String(min);
    input.dataset.max = String(max);
    input.dataset.step = String(step);
    input.setAttribute("aria-label", label);
    wrap.appendChild(input);
    return { wrap, input };
  }

  /**
   * @param {HTMLSelectElement} select
   * @param {string} value
   */
  function setSelect(select, value) {
    for (const opt of select.querySelectorAll("option")) {
      const match = (opt.getAttribute("value") || "") === value;
      if (match) opt.setAttribute("selected", "");
      else opt.removeAttribute("selected");
      try {
        opt.selected = match;
      } catch (_) {
        /* linkedom option.selected can be locked */
      }
    }
  }

  /**
   * @param {HTMLSelectElement} select
   */
  function readSelect(select) {
    const options = [...select.querySelectorAll("option")];
    const live = options.find((opt) => opt.selected);
    if (live) return live.getAttribute("value") || live.value || "";
    const marked = options.find((opt) => opt.hasAttribute("selected"));
    return marked ? marked.getAttribute("value") || marked.value || "" : "";
  }

  function setKindSelect(kind) {
    const next = normalizeKind(kind);
    for (const opt of kindSelect.querySelectorAll("option")) {
      if (opt.getAttribute("value") === next) opt.setAttribute("selected", "");
      else opt.removeAttribute("selected");
    }
  }

  function syncChrome() {
    const node = selection?.type === "node" ? model.nodes.find((n) => n.id === selection.id) : null;
    setKindSelect(node ? node.kind : pendingKind);
    deleteBtn.disabled = !selection;
    countEl.textContent = `${model.nodes.length} node${model.nodes.length === 1 ? "" : "s"} · ${model.edges.length} edge${model.edges.length === 1 ? "" : "s"}`;
    motionBar.hidden = !model.animated;
    if (model.animated) {
      const motion = normalizeMotion(model.motion);
      const live = liveMotion ? normalizeMotion({ ...motion, ...liveMotion }) : motion;
      setSelect(pathCtl.select, motion.path);
      setSelect(dirCtl.select, motion.direction);
      if (doc.activeElement !== qtyCtl.input) {
        if (motion.quantityFrom) {
          qtyCtl.input.value = motion.quantityFrom;
          qtyCtl.input.title = `Bound to control "${motion.quantityFrom}" (live ${live.quantity})`;
        } else {
          qtyCtl.input.value = String(live.quantity);
          qtyCtl.input.title = "Traveling dots (1–12)";
        }
      }
      if (doc.activeElement !== speedCtl.input) {
        if (motion.speedFrom) {
          speedCtl.input.value = motion.speedFrom;
          speedCtl.input.title = `Bound to control "${motion.speedFrom}" (live ${live.speed}s)`;
        } else {
          speedCtl.input.value = String(live.speed);
          speedCtl.input.title = "Seconds per lap";
        }
      }
    }
  }

  function contentSize() {
    let w = 640;
    let h = 300;
    for (const n of model.nodes) {
      w = Math.max(w, n.x + NODE_W + 40);
      h = Math.max(h, n.y + NODE_H + 48);
    }
    for (const lane of model.lanes || []) {
      h = Math.max(h, lane.y + lane.height + 24);
      w = Math.max(w, 640);
    }
    return { w, h };
  }

  function resolvedMotion() {
    if (!model.animated && !liveMotion) return null;
    const base = normalizeMotion(model.motion);
    if (!liveMotion) return model.animated ? base : null;
    return normalizeMotion({ ...base, ...liveMotion });
  }

  function paintEdges() {
    while (edgeLayer.firstChild) edgeLayer.removeChild(edgeLayer.firstChild);
    const motion = resolvedMotion();
    model.edges.forEach((e, index) => {
      const from = model.nodes.find((n) => n.id === e.from);
      const to = model.nodes.find((n) => n.id === e.to);
      if (!from || !to) return;
      const route = edgeRoute(from, to, e, motion ? motion.path : "ortho");
      const selected = selection?.type === "edge" && selection.index === index;
      const hit = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("class", "im-graph-edge-hit");
      hit.setAttribute("d", `${route.d} ${route.tip}`);
      hit.dataset.edge = String(index);
      const vis = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      vis.setAttribute(
        "class",
        "im-graph-edge" +
          (motion ? " is-animated" : "") +
          (motion?.direction === "reverse" ? " is-reverse" : "") +
          (selected ? " is-selected" : "")
      );
      vis.setAttribute("d", route.d);
      if (motion) vis.style.animationDuration = Math.max(0.35, motion.speed / 2) + "s";
      const head = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      head.setAttribute("class", "im-graph-edge" + (selected ? " is-selected" : ""));
      head.setAttribute("d", route.tip);
      head.setAttribute("marker-end", `url(#${markerId})`);
      edgeLayer.append(hit, vis, head);
      if (motion) {
        for (const dot of travelingDots(route.d, motion)) edgeLayer.appendChild(dot);
      }
    });
  }

  /**
   * @param {string} path
   * @param {GraphMotion} motion
   */
  function travelingDots(path, motion) {
    /** @type {SVGCircleElement[]} */
    const dots = [];
    for (let i = 0; i < motion.quantity; i++) {
      const dot = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("class", "im-graph-motion");
      dot.setAttribute("r", "4.5");
      dot.setAttribute("fill", "#f472b6");
      const anim = doc.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
      anim.setAttribute("dur", motion.speed + "s");
      anim.setAttribute("repeatCount", "indefinite");
      anim.setAttribute("path", path);
      if (motion.direction === "reverse") {
        anim.setAttribute("keyPoints", "1;0");
        anim.setAttribute("keyTimes", "0;1");
        anim.setAttribute("calcMode", "linear");
      }
      if (i > 0) anim.setAttribute("begin", `${(-motion.speed * i) / motion.quantity}s`);
      dot.appendChild(anim);
      dots.push(dot);
    }
    return dots;
  }

  function renderNode(node) {
    const el = doc.createElement("div");
    el.className =
      "im-graph-node im-graph-kind-" +
      node.kind +
      (selection?.type === "node" && selection.id === node.id ? " is-selected" : "");
    el.dataset.id = node.id;
    el.style.transform = `translate(${node.x}px, ${node.y}px)`;
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", node.label);

    if (node.kind === "decision") {
      const diamond = doc.createElement("span");
      diamond.className = "im-graph-diamond";
      diamond.setAttribute("aria-hidden", "true");
      el.appendChild(diamond);
    }

    const label = doc.createElement("div");
    label.className = "im-graph-label";
    label.textContent = node.label;
    if (editable) label.title = "Double-click to rename";
    el.appendChild(label);

    if (editable) {
      for (const side of GRAPH_SIDES) {
        const port = doc.createElement("button");
        port.type = "button";
        port.className = "im-graph-port im-graph-port-" + side;
        port.dataset.side = side;
        port.setAttribute("aria-label", `Connect from the ${side} of ${node.label}`);
        el.appendChild(port);
      }
    }
    return el;
  }

  function paint() {
    const size = contentSize();
    stage.style.width = size.w + "px";
    stage.style.height = size.h + "px";
    stage.classList.toggle("is-animated", !!resolvedMotion());
    empty.hidden = model.nodes.length > 0;
    for (const el of stage.querySelectorAll(".im-graph-node, .im-graph-lane, .im-graph-group")) el.remove();
    for (const lane of model.lanes || []) stage.appendChild(renderLane(lane));
    for (const group of model.groups || []) {
      const el = renderGroup(group);
      if (el) stage.appendChild(el);
    }
    for (const n of model.nodes) stage.appendChild(renderNode(n));
    paintEdges();
    syncChrome();
  }

  /** @param {GraphLane} lane */
  function renderLane(lane) {
    const el = doc.createElement("div");
    el.className = "im-graph-lane";
    el.dataset.id = lane.id;
    el.style.top = lane.y + "px";
    el.style.height = lane.height + "px";
    if (lane.fill) el.style.background = lane.fill;
    const label = doc.createElement("span");
    label.className = "im-graph-lane-label";
    label.textContent = lane.label || lane.id;
    el.appendChild(label);
    return el;
  }

  /** @param {GraphGroup} group */
  function renderGroup(group) {
    const members = model.nodes.filter((n) => n.group === group.id);
    if (!members.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of members) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + NODE_H);
    }
    const pad = 16;
    const el = doc.createElement("div");
    el.className = "im-graph-group";
    el.dataset.id = group.id;
    el.style.left = minX - pad + "px";
    el.style.top = minY - pad + "px";
    el.style.width = maxX - minX + pad * 2 + "px";
    el.style.height = maxY - minY + pad * 2 + "px";
    const label = doc.createElement("span");
    label.className = "im-graph-group-label";
    label.textContent = group.label || group.id;
    el.appendChild(label);
    return el;
  }

  function focusCanvas() {
    try {
      canvas.focus?.({ preventScroll: true });
    } catch (_) {
      try {
        canvas.focus?.();
      } catch (_) {
        /* ignore */
      }
    }
  }

  function markSelection() {
    for (const el of stage.querySelectorAll(".im-graph-node")) {
      el.classList.toggle("is-selected", selection?.type === "node" && el.dataset.id === selection.id);
    }
    for (const el of stage.querySelectorAll(".im-graph-edge.is-selected")) el.classList.remove("is-selected");
    syncChrome();
  }

  function selectNode(id) {
    selection = { type: "node", id };
    paint();
    focusCanvas();
  }

  function apply(next, opts = {}) {
    model = next;
    if (opts.selection !== undefined) selection = opts.selection;
    if (selection?.type === "node" && !model.nodes.some((n) => n.id === selection.id)) selection = null;
    if (selection?.type === "edge" && (selection.index < 0 || selection.index >= model.edges.length)) {
      selection = null;
    }
    paint();
    if (opts.commit !== false) commit();
  }

  // Read-only preview: paint + live motion only (no drag / ports / write-back).
  if (!editable) {
    paint();
    return {
      destroy() {
        dead = true;
        clearTimeout(flashTimer);
        container.innerHTML = "";
      },
      getModel() {
        return cloneModel(model);
      },
      setLiveMotion(patch) {
        liveMotion = patch ? { ...patch } : null;
        if (!dead) paint();
      },
    };
  }

  addBtn.addEventListener("click", () => {
    const before = model.nodes.length;
    model = addNode(model, { kind: pendingKind });
    const created = model.nodes[model.nodes.length - 1];
    selection = created ? { type: "node", id: created.id } : null;
    if (model.nodes.length === before) return;
    paint();
    commit();
  });

  deleteBtn.addEventListener("click", () => {
    if (!selection) return;
    apply(removeSelection(model, selection), { selection: null });
  });

  pathCtl.select.addEventListener("change", () => {
    apply(setMotion(model, { path: /** @type {GraphPath} */ (readSelect(pathCtl.select) || "ortho") }));
  });
  dirCtl.select.addEventListener("change", () => {
    const direction = readSelect(dirCtl.select) === "reverse" ? "reverse" : "forward";
    apply(setMotion(model, { direction }));
  });
  qtyCtl.input.addEventListener("change", () => {
    const raw = String(qtyCtl.input.value || "").trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) {
      apply(setMotion(model, { quantityFrom: raw }));
      return;
    }
    apply(setMotion(model, { quantity: Number(raw) }));
  });
  speedCtl.input.addEventListener("change", () => {
    const raw = String(speedCtl.input.value || "").trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) {
      apply(setMotion(model, { speedFrom: raw }));
      return;
    }
    apply(setMotion(model, { speed: Number(raw) }));
  });

  kindSelect.addEventListener("change", () => {
    const kind = normalizeKind(kindSelect.value);
    if (selection?.type === "node") {
      pendingKind = kind;
      apply(setNodeKind(model, selection.id, kind));
      return;
    }
    pendingKind = kind;
  });

  canvas.addEventListener("keydown", (e) => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const t = /** @type {HTMLElement} */ (e.target);
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    if (!selection) return;
    e.preventDefault();
    apply(removeSelection(model, selection), { selection: null });
  });

  function pointInStage(e) {
    const rect = stage.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function beginRename(id) {
    const node = model.nodes.find((n) => n.id === id);
    const el = stage.querySelector(`.im-graph-node[data-id="${cssEscape(id)}"]`);
    const label = el?.querySelector(".im-graph-label");
    if (!node || !el || !label) return;
    const input = doc.createElement("input");
    input.type = "text";
    input.className = "im-graph-rename";
    input.value = node.label;
    input.setAttribute("aria-label", "Node label");
    label.replaceWith(input);
    const focusInput = () => {
      try {
        input.focus({ preventScroll: true });
        input.select?.();
      } catch (_) {
        try {
          input.focus();
        } catch (_) {
          /* ignore */
        }
      }
    };
    focusInput();
    requestAnimationFrame(focusInput);
    let done = false;
    let touched = false;
    let inside = true;
    const onDocDown = (ev) => {
      if (!input.contains(ev.target)) inside = false;
    };
    doc.addEventListener("pointerdown", onDocDown, true);
    const finish = (save) => {
      if (done) return;
      done = true;
      doc.removeEventListener("pointerdown", onDocDown, true);
      if (save) model = renameNode(model, id, input.value);
      selection = { type: "node", id };
      paint();
      if (save) commit();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
      e.stopPropagation();
    });
    input.addEventListener("input", () => {
      touched = true;
    });
    input.addEventListener("pointerdown", (e) => e.stopPropagation());
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("blur", () => {
      if (done) return;
      if (!touched && inside) {
        setTimeout(focusInput, 0);
        return;
      }
      finish(true);
    });
  }

  stage.addEventListener("pointerdown", (e) => {
    if (dead) return;
    const target = /** @type {Element} */ (e.target);
    if (target.closest?.(".im-graph-rename")) return;

    const port = target.closest?.(".im-graph-port");
    if (port) {
      e.preventDefault();
      e.stopPropagation();
      const id = port.closest(".im-graph-node")?.dataset.id;
      if (!id) return;
      connecting = {
        fromId: id,
        fromSide: normalizeSide(port.dataset.side, "right"),
        pointerId: e.pointerId,
      };
      selection = { type: "node", id };
      paint();
      try {
        stage.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      return;
    }

    const nodeEl = target.closest?.(".im-graph-node");
    if (!nodeEl) return;
    const id = nodeEl.dataset.id;
    if (!id) return;
    const node = model.nodes.find((n) => n.id === id);
    if (!node) return;
    const onLabel = !!target.closest?.(".im-graph-label");
    const now = Date.now();
    if (onLabel && labelTap && labelTap.id === id && now - labelTap.at < 700) {
      labelTap = null;
      dragging = null;
      e.preventDefault();
      e.stopPropagation();
      try {
        if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      beginRename(id);
      return;
    }
    labelTap = onLabel ? { id, at: now } : null;
    const p = pointInStage(e);
    dragging = {
      id,
      ox: p.x - node.x,
      oy: p.y - node.y,
      pointerId: e.pointerId,
      x0: node.x,
      y0: node.y,
      moved: false,
    };
    selection = { type: "node", id };
    markSelection();
    focusCanvas();
    try {
      stage.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  });

  stage.addEventListener("pointermove", (e) => {
    if (dragging && e.pointerId === dragging.pointerId) {
      const node = model.nodes.find((n) => n.id === dragging.id);
      const el = stage.querySelector(`.im-graph-node[data-id="${cssEscape(dragging.id)}"]`);
      if (!node || !el) return;
      const p = pointInStage(e);
      const nx = snap(clamp(p.x - dragging.ox, 0, 4000));
      const ny = snap(clamp(p.y - dragging.oy, 0, 4000));
      if (!dragging.moved && nx === dragging.x0 && ny === dragging.y0) return;
      dragging.moved = true;
      node.x = nx;
      node.y = ny;
      el.style.transform = `translate(${node.x}px, ${node.y}px)`;
      const size = contentSize();
      stage.style.width = size.w + "px";
      stage.style.height = size.h + "px";
      paintEdges();
      return;
    }
    if (connecting && e.pointerId === connecting.pointerId) {
      const from = model.nodes.find((n) => n.id === connecting.fromId);
      if (!from) return;
      const p = pointInStage(e);
      const anchor = sideAnchor(from, connecting.fromSide || "right");
      tempPath.setAttribute("d", `M ${anchor.x} ${anchor.y} L ${p.x} ${p.y}`);
    }
  });

  stage.addEventListener("pointerup", (e) => {
    if (dragging && e.pointerId === dragging.pointerId) {
      const moved = dragging.moved;
      const id = dragging.id;
      dragging = null;
      if (!moved) return;
      const node = model.nodes.find((n) => n.id === id);
      if (node) model = moveNode(model, id, node.x, node.y);
      paint();
      commit();
      return;
    }
    if (connecting && e.pointerId === connecting.pointerId) {
      const fromId = connecting.fromId;
      const fromSide = connecting.fromSide;
      connecting = null;
      tempPath.setAttribute("d", "");
      const hit = doc.elementFromPoint?.(e.clientX, e.clientY);
      const toId = hit?.closest?.(".im-graph-node")?.dataset.id;
      if (!toId) {
        paint();
        return;
      }
      const toNode = model.nodes.find((n) => n.id === toId);
      const portSide = hit?.closest?.(".im-graph-port")?.dataset.side;
      const toSide = portSide
        ? normalizeSide(portSide, "left")
        : toNode
          ? nearestSide(toNode, pointInStage(e))
          : "left";
      const result = addEdge(model, fromId, toId, { fromSide, toSide });
      if (!result.ok) {
        paint();
        if (result.reason === "duplicate") flash("Those nodes are already connected");
        return;
      }
      model = result.model;
      selection = { type: "edge", index: model.edges.length - 1 };
      paint();
      commit();
    }
  });

  stage.addEventListener("pointercancel", () => {
    dragging = null;
    labelTap = null;
    connecting = null;
    tempPath.setAttribute("d", "");
    paint();
  });

  stage.addEventListener("click", (e) => {
    const target = /** @type {Element} */ (e.target);
    const edge = target.closest?.("[data-edge]");
    if (edge) {
      selection = { type: "edge", index: Number(edge.dataset.edge) };
      paint();
      focusCanvas();
      return;
    }
    if (!target.closest?.(".im-graph-node")) {
      selection = null;
      paint();
    }
  });

  stage.addEventListener("dblclick", (e) => {
    const target = /** @type {Element} */ (e.target);
    const nodeEl = target.closest?.(".im-graph-node");
    if (nodeEl?.dataset.id && target.closest?.(".im-graph-label")) {
      e.preventDefault();
      beginRename(nodeEl.dataset.id);
      return;
    }
    if (nodeEl) return;
    const p = pointInStage(e);
    model = addNode(model, {
      x: p.x - NODE_W / 2,
      y: p.y - NODE_H / 2,
      kind: pendingKind,
    });
    const created = model.nodes[model.nodes.length - 1];
    selection = created ? { type: "node", id: created.id } : null;
    paint();
    commit();
  });

  paint();

  return {
    destroy() {
      dead = true;
      clearTimeout(flashTimer);
      container.innerHTML = "";
    },
    getModel() {
      return cloneModel(model);
    },
    /**
     * Overlay live quantity/speed (from fence controls) without rewriting the source model.
     * @param {Partial<GraphMotion> | null} patch
     */
    setLiveMotion(patch) {
      liveMotion = patch ? { ...patch } : null;
      if (!dead) {
        paint();
        syncChrome();
      }
    },
  };
}
