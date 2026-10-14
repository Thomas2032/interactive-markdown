/**
 * Basic directed-graph editor.
 * The model is plain data ({ nodes, edges }) so it can be stored in an ```ivm @graph fence.
 * Gestures: drag a node, drag the right port onto another node, double-click to add or rename.
 */

export const NODE_W = 168;
export const NODE_H = 56;

export const GRAPH_KINDS = Object.freeze(["action", "input", "output", "decision"]);

const KIND_SET = new Set(GRAPH_KINDS);

/**
 * @typedef {{ id: string, label: string, x: number, y: number, kind: string }} GraphNode
 * @typedef {{ from: string, to: string }} GraphEdge
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[] }} GraphModel
 * @typedef {{ type: 'node', id: string } | { type: 'edge', index: number }} GraphSelection
 */

/** @param {unknown} kind */
export function normalizeKind(kind) {
  const k = String(kind || "action").toLowerCase();
  return KIND_SET.has(k) ? k : "action";
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
  const lines = ["@graph"];
  for (const n of model.nodes) {
    const kind = n.kind && n.kind !== "action" ? ` kind=${n.kind}` : "";
    lines.push(
      `@node ${n.id}: ${quoteGraphLabel(n.label)} x=${Math.round(n.x)} y=${Math.round(n.y)}${kind}`
    );
  }
  for (const e of model.edges) {
    lines.push(`@edge ${e.from} -> ${e.to}`);
  }
  return lines.join("\n") + "\n";
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
  return { nodes: model.nodes.concat(node), edges: model.edges.map((e) => ({ ...e })) };
}

/**
 * @param {GraphModel} model
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @returns {GraphModel}
 */
export function moveNode(model, id, x, y) {
  return {
    nodes: model.nodes.map((n) =>
      n.id === id ? { ...n, x: snap(clamp(x, 0, 4000)), y: snap(clamp(y, 0, 4000)) } : { ...n }
    ),
    edges: model.edges.map((e) => ({ ...e })),
  };
}

/**
 * @param {GraphModel} model
 * @param {string} id
 * @param {string} label
 * @returns {GraphModel}
 */
export function renameNode(model, id, label) {
  const next = String(label ?? "").trim();
  return {
    nodes: model.nodes.map((n) => (n.id === id ? { ...n, label: next || n.label } : { ...n })),
    edges: model.edges.map((e) => ({ ...e })),
  };
}

/**
 * @param {GraphModel} model
 * @param {string} id
 * @param {string} kind
 * @returns {GraphModel}
 */
export function setNodeKind(model, id, kind) {
  const k = normalizeKind(kind);
  return {
    nodes: model.nodes.map((n) => (n.id === id ? { ...n, kind: k } : { ...n })),
    edges: model.edges.map((e) => ({ ...e })),
  };
}

/**
 * @param {GraphModel} model
 * @param {string} from
 * @param {string} to
 * @returns {{ model: GraphModel, ok: boolean, reason?: string }}
 */
export function addEdge(model, from, to) {
  if (!from || !to || from === to) return { model, ok: false, reason: "self" };
  if (!model.nodes.some((n) => n.id === from) || !model.nodes.some((n) => n.id === to)) {
    return { model, ok: false, reason: "missing" };
  }
  if (model.edges.some((e) => e.from === from && e.to === to)) {
    return { model, ok: false, reason: "duplicate" };
  }
  return {
    model: {
      nodes: model.nodes.map((n) => ({ ...n })),
      edges: model.edges.concat({ from, to }),
    },
    ok: true,
  };
}

/**
 * @param {GraphModel} model
 * @param {GraphSelection | null} selection
 * @returns {GraphModel}
 */
export function removeSelection(model, selection) {
  if (!selection) return model;
  if (selection.type === "node") {
    return {
      nodes: model.nodes.filter((n) => n.id !== selection.id),
      edges: model.edges.filter((e) => e.from !== selection.id && e.to !== selection.id),
    };
  }
  return {
    nodes: model.nodes.map((n) => ({ ...n })),
    edges: model.edges.filter((_, i) => i !== selection.index),
  };
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => "\\" + ch);
}

function cloneModel(model) {
  return {
    nodes: model.nodes.map((n) => ({ ...n })),
    edges: model.edges.map((e) => ({ ...e })),
  };
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

let mountSeq = 0;

/**
 * Mount an interactive graph.
 * @param {HTMLElement} container
 * @param {GraphModel} initial
 * @param {{ onChange?: (model: GraphModel) => void }} [options]
 * @returns {{ destroy: () => void, getModel: () => GraphModel }}
 */
export function mountGraphEditor(container, initial, options = {}) {
  const doc = container.ownerDocument || globalThis.document;
  const markerId = "im-graph-arrow-" + ++mountSeq;
  /** @type {GraphModel} */
  let model = cloneModel(initial);
  /** @type {GraphSelection | null} */
  let selection = null;
  let pendingKind = "action";
  let flashTimer = 0;
  /** @type {{ id: string, ox: number, oy: number, pointerId: number, x0: number, y0: number, moved: boolean } | null} */
  let dragging = null;
  /** @type {{ id: string, at: number } | null} */
  let labelTap = null;
  /** @type {{ fromId: string, pointerId: number } | null} */
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

  const help = doc.createElement("p");
  help.className = "im-graph-help";
  help.textContent =
    "Drag a node to move it. Drag the right dot onto another node to connect. Double-click a label to rename, or the canvas to add a node. Delete removes the selection.";

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
  empty.textContent = "This graph is empty. Add a node, or double-click the canvas.";

  stage.append(svg, empty);
  canvas.appendChild(stage);
  root.append(bar, help, canvas);
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
  }

  function contentSize() {
    let w = 640;
    let h = 300;
    for (const n of model.nodes) {
      w = Math.max(w, n.x + NODE_W + 40);
      h = Math.max(h, n.y + NODE_H + 48);
    }
    return { w, h };
  }

  function paintEdges() {
    while (edgeLayer.firstChild) edgeLayer.removeChild(edgeLayer.firstChild);
    model.edges.forEach((e, index) => {
      const from = model.nodes.find((n) => n.id === e.from);
      const to = model.nodes.find((n) => n.id === e.to);
      if (!from || !to) return;
      const d = edgePath(from, to);
      const tip = edgeTip(to);
      const selected = selection?.type === "edge" && selection.index === index;
      const hit = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("class", "im-graph-edge-hit");
      hit.setAttribute("d", `${d} ${tip}`);
      hit.dataset.edge = String(index);
      const vis = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      vis.setAttribute("class", "im-graph-edge" + (selected ? " is-selected" : ""));
      vis.setAttribute("d", d);
      const head = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      head.setAttribute("class", "im-graph-edge" + (selected ? " is-selected" : ""));
      head.setAttribute("d", tip);
      head.setAttribute("marker-end", `url(#${markerId})`);
      edgeLayer.append(hit, vis, head);
    });
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

    const portIn = doc.createElement("span");
    portIn.className = "im-graph-port im-graph-port-in";
    portIn.setAttribute("aria-hidden", "true");

    const label = doc.createElement("div");
    label.className = "im-graph-label";
    label.textContent = node.label;
    label.title = "Double-click to rename";

    const portOut = doc.createElement("button");
    portOut.type = "button";
    portOut.className = "im-graph-port im-graph-port-out";
    portOut.setAttribute("aria-label", `Connect from ${node.label}`);

    el.append(portIn, label, portOut);
    return el;
  }

  function paint() {
    const size = contentSize();
    stage.style.width = size.w + "px";
    stage.style.height = size.h + "px";
    empty.hidden = model.nodes.length > 0;
    for (const el of stage.querySelectorAll(".im-graph-node")) el.remove();
    for (const n of model.nodes) stage.appendChild(renderNode(n));
    paintEdges();
    syncChrome();
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

    const port = target.closest?.(".im-graph-port-out");
    if (port) {
      e.preventDefault();
      e.stopPropagation();
      const id = port.closest(".im-graph-node")?.dataset.id;
      if (!id) return;
      connecting = { fromId: id, pointerId: e.pointerId };
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
      const x1 = from.x + NODE_W;
      const y1 = from.y + NODE_H / 2;
      tempPath.setAttribute("d", `M ${x1} ${y1} L ${p.x} ${p.y}`);
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
      connecting = null;
      tempPath.setAttribute("d", "");
      const hit = doc.elementFromPoint?.(e.clientX, e.clientY);
      const toId = hit?.closest?.(".im-graph-node")?.dataset.id;
      if (!toId) {
        paint();
        return;
      }
      const result = addEdge(model, fromId, toId);
      if (!result.ok) {
        paint();
        if (result.reason === "duplicate") flash("Those nodes are already connected");
        else if (result.reason === "self") flash("A node cannot connect to itself");
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
  };
}
