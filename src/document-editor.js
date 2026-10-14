/**
 * Preview block editor. Edits commit markdown through onChange and do not remount the editor.
 */

import {
  insertFeature,
  moveBlock,
  parseDocument,
  removeBlock,
  removeControl,
  removeShape,
  serializeDocument,
  serializeFigure,
  updateBlock,
  updateControl,
  updateShape,
  NAME_RE,
} from "./document.js";
import { mountGraphEditor } from "./graph-editor.js";
import { mountIvm, resetNamespaces } from "./render.js";

const SHAPE_FIELDS = {
  rect: ["x", "y", "width", "height", "rx", "fill", "stroke", "stroke-width", "opacity"],
  circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width"],
  ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "stroke-width"],
  line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width"],
  path: ["d", "fill", "stroke", "stroke-width", "opacity"],
  text: ["x", "y", "fill", "font-size", "text"],
};

const ADD_BUTTONS = [
  ["heading", "Heading"],
  ["paragraph", "Paragraph"],
  ["bullets", "Bullets"],
  ["slider", "Slider"],
  ["timer", "Timer"],
  ["input", "Text field"],
  ["toggle", "Toggle"],
  ["formula", "Formula"],
  ["shape", "Shape"],
  ["graph", "Graph"],
  ["animated", "Animated figure"],
];

/**
 * @param {HTMLElement} container
 * @param {string} source
 * @param {{ onChange?: (markdown: string) => void, onStatus?: (message: string) => void, marked?: { parse: (markdown: string) => string } }} [options]
 * @returns {{ destroy: () => void }}
 */
export function mountDocumentEditor(container, source, options = {}) {
  const docEl = container.ownerDocument || globalThis.document;
  let doc = parseDocument(source);
  /** @type {string | null} */
  let selectedId = null;
  /** @type {Map<string, { destroy: () => void }>} */
  const mounts = new Map();
  let dead = false;

  container.innerHTML = "";
  const root = docEl.createElement("div");
  root.className = "im-doc";

  const bar = docEl.createElement("div");
  bar.className = "im-doc-bar";
  for (const [feature, label] of ADD_BUTTONS) {
    const button = docEl.createElement("button");
    button.type = "button";
    button.dataset.add = feature;
    button.textContent = label;
    bar.appendChild(button);
    if (feature === "shape") {
      const select = docEl.createElement("select");
      select.dataset.shapeKind = "rect";
      for (const kind of ["rect", "circle", "line", "path", "text"]) {
        const option = docEl.createElement("option");
        option.value = kind;
        option.textContent = kind;
        if (kind === "rect") option.setAttribute("selected", "");
        select.appendChild(option);
      }
      bar.appendChild(select);
    }
  }

  const help = docEl.createElement("p");
  help.className = "im-doc-help";
  help.textContent = "Prose stays formatted text. Sliders, figures, and graphs stay blocks. Labels and expressions are typed in the block.";

  const empty = docEl.createElement("p");
  empty.className = "im-doc-empty";
  empty.textContent = "Add a heading, a control, a shape, or a graph.";

  const blocksEl = docEl.createElement("div");
  blocksEl.className = "im-doc-blocks";

  root.append(bar, help, empty, blocksEl);
  container.appendChild(root);

  root.addEventListener("click", onClick);
  root.addEventListener("input", onField);
  root.addEventListener("change", onField);
  root.addEventListener("focusout", onBlur);

  paint();

  return {
    destroy() {
      dead = true;
      destroyMounts();
      root.remove();
    },
  };

  function commit() {
    if (dead) return;
    options.onChange?.(serializeDocument(doc.blocks));
  }

  function destroyMounts() {
    for (const mounted of mounts.values()) mounted.destroy();
    mounts.clear();
  }

  function paint() {
    destroyMounts();
    resetNamespaces();
    blocksEl.innerHTML = "";
    empty.hidden = doc.blocks.length > 0;
    /** @type {object[]} */
    let prose = [];
    const flush = () => {
      if (!prose.length) return;
      blocksEl.appendChild(renderProse(prose));
      prose = [];
    };
    for (const block of doc.blocks) {
      if (block.type === "figure" || block.type === "graph") {
        flush();
        blocksEl.appendChild(renderBlock(block));
      } else prose.push(block);
    }
    flush();
  }

  /**
   * Headings, paragraphs, and lists render as HTML. They are not blocks.
   * @param {object[]} blocks
   */
  function renderProse(blocks) {
    const wrap = docEl.createElement("div");
    wrap.className = "im-md im-doc-prose";
    const markdown = serializeDocument(blocks).trim();
    const parser = options.marked || globalThis.marked;
    if (parser && typeof parser.parse === "function") {
      try {
        wrap.innerHTML = parser.parse(markdown);
        return wrap;
      } catch (_) {
        /* fall through to plain text */
      }
    }
    wrap.textContent = markdown;
    return wrap;
  }

  /**
   * @param {object} block
   */
  function renderBlock(block) {
    const el = docEl.createElement("section");
    el.className = "im-doc-block" + (block.id === selectedId ? " is-selected" : "");
    el.dataset.id = block.id;

    const row = docEl.createElement("div");
    row.className = "im-doc-block-bar";
    const index = doc.blocks.findIndex((b) => b.id === block.id);
    row.append(
      actionButton("select", kindLabel(block), null),
      actionButton("move", "Up", { delta: "-1", disabled: index <= 0 }),
      actionButton("move", "Down", { delta: "1", disabled: index < 0 || index >= doc.blocks.length - 1 }),
      actionButton("remove-block", "Remove", null)
    );
    el.appendChild(row);

    if (block.id === selectedId) el.appendChild(renderInspector(block));

    const live = docEl.createElement("div");
    live.className = "im-doc-live";
    const host = docEl.createElement("div");
    host.className = "im-doc-live-host";
    live.appendChild(host);
    el.appendChild(live);
    mountLive(block, host);
    return el;
  }

  /**
   * @param {string} action
   * @param {string} label
   * @param {{ delta?: string, disabled?: boolean } | null} extra
   */
  function actionButton(action, label, extra) {
    const button = docEl.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = label;
    if (action === "select") button.className = "im-doc-kind";
    if (extra?.delta) button.dataset.delta = extra.delta;
    if (extra?.disabled) button.disabled = true;
    return button;
  }

  /**
   * @param {object} block
   */
  function renderInspector(block) {
    const box = docEl.createElement("div");
    box.className = "im-doc-inspector";
    if (block.type === "heading") {
      const level = docEl.createElement("select");
      level.dataset.field = "level";
      for (const n of [1, 2, 3]) {
        const option = docEl.createElement("option");
        option.value = String(n);
        option.textContent = "H" + n;
        if (Number(block.level) === n) option.setAttribute("selected", "");
        level.appendChild(option);
      }
      const text = input("text", block.text || "");
      text.dataset.field = "text";
      box.append(field("Level", level), field("Text", text));
      return box;
    }
    if (block.type === "paragraph" || block.type === "markdown") {
      const area = textarea(block.text || "", 4);
      area.dataset.field = "text";
      box.appendChild(field(block.type === "markdown" ? "Markdown" : "Text", area));
      return box;
    }
    if (block.type === "bullets") {
      const area = textarea((block.items || []).join("\n"), 4);
      area.dataset.field = "items";
      box.appendChild(field("One item per line", area));
      return box;
    }
    if (block.type === "graph") return box;
    if (block.type === "figure") {
      const ns = input("text", block.namespace || "");
      ns.dataset.field = "namespace";
      box.appendChild(field("Shared name", ns));
      if (!block.customSvg) {
        const view = input("text", block.viewBox || "");
        view.dataset.field = "viewBox";
        box.appendChild(field("viewBox", view));
      } else {
        const note = docEl.createElement("p");
        note.className = "im-doc-help";
        note.textContent = "Finished drawing. The preview plays it as stored. Controls added here can drive {{expr}} inside it.";
        box.appendChild(note);
      }
      (block.controls || []).forEach((control, index) => {
        box.appendChild(renderControl(control, index));
      });
      if (block.shapes) {
        block.shapes.forEach((shape, index) => {
          box.appendChild(renderShape(shape, index));
        });
      }
    }
    return box;
  }

  /**
   * @param {object} control
   * @param {number} index
   */
  function renderControl(control, index) {
    const group = docEl.createElement("fieldset");
    group.className = "im-doc-sub";
    const legend = docEl.createElement("legend");
    legend.textContent = controlTitle(control);
    const remove = docEl.createElement("button");
    remove.type = "button";
    remove.dataset.action = "remove-control";
    remove.dataset.index = String(index);
    remove.textContent = "Remove";
    group.append(legend, remove);

    const name = input("text", control.name || "");
    tagControl(name, index, "name");
    group.appendChild(field("Name", name));

    if (control.kind === "let") {
      const expr = input("text", control.expression || "");
      tagControl(expr, index, "expression");
      group.appendChild(field("Expression", expr));
      return group;
    }

    const label = input("text", control.label || "");
    tagControl(label, index, "label");
    group.appendChild(field("Label", label));

    if (control.kind === "input") {
      const value = input("text", control.default ?? "");
      tagControl(value, index, "default");
      group.appendChild(field("Default", value));
      return group;
    }
    if (control.kind === "toggle") {
      const value = input("checkbox", "");
      value.checked = !!control.default;
      tagControl(value, index, "default");
      group.appendChild(field("Default on", value));
      return group;
    }

    const range = control.range || [0, 100];
    for (const [key, value, title] of [
      ["min", range[0], "Min"],
      ["max", range[1], "Max"],
      ["default", control.default, "Default"],
      ["step", control.step, "Step"],
    ]) {
      const num = input("number", value ?? "");
      tagControl(num, index, key);
      group.appendChild(field(title, num));
    }
    if (control.kind === "timer") {
      const speed = input("number", control.speed ?? 20);
      tagControl(speed, index, "speed");
      const loop = input("checkbox", "");
      loop.checked = control.loop !== false;
      tagControl(loop, index, "loop");
      group.append(field("Speed", speed), field("Loop", loop));
    }
    return group;
  }

  /**
   * @param {object} shape
   * @param {number} index
   */
  function renderShape(shape, index) {
    const group = docEl.createElement("fieldset");
    group.className = "im-doc-sub";
    const legend = docEl.createElement("legend");
    legend.textContent = shape.type;
    const remove = docEl.createElement("button");
    remove.type = "button";
    remove.dataset.action = "remove-shape";
    remove.dataset.index = String(index);
    remove.textContent = "Remove";
    group.append(legend, remove);
    const known = SHAPE_FIELDS[shape.type] || ["fill"];
    const extras = Object.keys(shape.attrs || {}).filter((key) => key !== "text" && !known.includes(key));
    if (shape.type === "text" && !known.includes("text")) extras.push("text");
    for (const key of known.concat(extras)) {
      const value = input("text", shape.attrs?.[key] ?? "");
      value.dataset.shape = String(index);
      value.dataset.attr = key;
      group.appendChild(field(key === "text" ? "Text" : key, value));
    }
    return group;
  }

  /**
   * @param {HTMLInputElement} el
   * @param {number} index
   * @param {string} fieldName
   */
  function tagControl(el, index, fieldName) {
    el.dataset.control = String(index);
    el.dataset.field = fieldName;
  }

  /**
   * @param {string} label
   * @param {HTMLElement} control
   */
  function field(label, control) {
    const wrap = docEl.createElement("label");
    wrap.className = "im-doc-field";
    const span = docEl.createElement("span");
    span.textContent = label;
    wrap.append(span, control);
    return wrap;
  }

  /**
   * @param {string} type
   * @param {string|number} value
   */
  function input(type, value) {
    const el = docEl.createElement("input");
    el.type = type;
    if (type !== "checkbox") el.value = String(value ?? "");
    if (type === "number") el.step = "any";
    return el;
  }

  /**
   * @param {string} value
   * @param {number} rows
   */
  function textarea(value, rows) {
    const el = docEl.createElement("textarea");
    el.rows = rows;
    el.value = value;
    return el;
  }

  /**
   * @param {object} block
   * @param {HTMLElement} host
   */
  function mountLive(block, host) {
    if (block.type === "graph") {
      const mounted = mountGraphEditor(host, block.model || { nodes: [], edges: [] }, {
        onChange(model) {
          doc = { blocks: updateBlock(doc, block.id, { model }).blocks };
          commit();
        },
      });
      mounts.set(block.id, mounted);
      return;
    }
    mounts.set(block.id, mountIvm(host, serializeFigure(block)));
  }

  /**
   * @param {string} id
   */
  function refreshFigure(id) {
    const block = doc.blocks.find((b) => b.id === id);
    const host = blocksEl.querySelector(`.im-doc-block[data-id="${id}"] .im-doc-live-host`);
    if (!block || block.type !== "figure" || !host) return;
    const prev = mounts.get(id);
    if (prev) {
      prev.destroy();
      mounts.delete(id);
    }
    host.innerHTML = "";
    mounts.set(id, mountIvm(host, serializeFigure(block)));
  }

  /**
   * @param {MouseEvent} event
   */
  function onClick(event) {
    const target = event.target;
    if (!target || !target.closest) return;
    const add = target.closest("[data-add]");
    if (add && !add.closest(".im-graph")) {
      event.preventDefault();
      addFeature(add.dataset.add || "");
      return;
    }
    const actionEl = target.closest("[data-action]");
    if (actionEl && !actionEl.closest(".im-graph")) {
      const action = actionEl.dataset.action || "";
      if (action === "select" || action === "move" || action === "remove-block" || action === "remove-control" || action === "remove-shape") {
        event.preventDefault();
        runAction(actionEl);
      }
      return;
    }
    if (target.closest("button, input, textarea, select, a, label, .im-doc-live")) return;
    const blockEl = target.closest(".im-doc-block");
    if (!blockEl || blockEl.dataset.id === selectedId) return;
    selectedId = blockEl.dataset.id || null;
    paint();
  }

  /**
   * @param {string} feature
   */
  function addFeature(feature) {
    if (feature === "animated") {
      addAnimated();
      return;
    }
    const shapeType = feature === "shape" ? root.querySelector("[data-shape-kind]")?.value || "rect" : undefined;
    const selected = doc.blocks.find((b) => b.id === selectedId);
    const figureId = selected && selected.type === "figure" ? selected.id : undefined;
    const result = insertFeature(doc, feature, { figureId, shapeType });
    doc = result.doc;
    selectedId = result.focusId || selectedId;
    paint();
    commit();
  }

  async function addAnimated() {
    try {
      const res = await fetch("examples/agent-loop.md");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const parsed = parseDocument(await res.text());
      const figure = parsed.blocks.find((b) => b.type === "figure" && b.customSvg);
      if (!figure) throw new Error("missing figure");
      const result = insertFeature(doc, "animated", { customSvg: figure.customSvg, viewBox: figure.viewBox });
      doc = result.doc;
      selectedId = result.focusId;
      paint();
      commit();
    } catch (_) {
      options.onStatus?.("Could not load the animated figure");
    }
  }

  /**
   * @param {HTMLElement} actionEl
   */
  function runAction(actionEl) {
    const blockEl = actionEl.closest(".im-doc-block");
    const id = blockEl?.dataset.id;
    if (!id) return;
    const action = actionEl.dataset.action;
    if (action === "select") {
      selectedId = id;
      paint();
      return;
    }
    if (action === "move") {
      doc = { blocks: moveBlock(doc, id, Number(actionEl.dataset.delta)).blocks };
      paint();
      commit();
      return;
    }
    if (action === "remove-block") {
      doc = { blocks: removeBlock(doc, id).blocks };
      if (selectedId === id) selectedId = null;
      paint();
      commit();
      return;
    }
    const index = Number(actionEl.dataset.index);
    if (action === "remove-control") doc = { blocks: removeControl(doc, id, index).blocks };
    if (action === "remove-shape") doc = { blocks: removeShape(doc, id, index).blocks };
    paint();
    commit();
  }

  /**
   * @param {Event} event
   */
  function onField(event) {
    const el = event.target;
    if (!el || !el.closest || !el.dataset || !el.closest(".im-doc-inspector")) return;
    const blockEl = el.closest(".im-doc-block");
    const id = blockEl?.dataset.id;
    const block = doc.blocks.find((b) => b.id === id);
    if (!block) return;

    if (el.dataset.shape != null && el.dataset.attr) {
      doc = { blocks: updateShape(doc, id, Number(el.dataset.shape), { [el.dataset.attr]: el.value }).blocks };
      refreshFigure(id);
      commit();
      return;
    }

    const fieldName = el.dataset.field;
    if (!fieldName) return;

    if (el.dataset.control != null) {
      const index = Number(el.dataset.control);
      const control = block.controls?.[index];
      if (!control) return;
      const patch = patchFromControl(control, fieldName, el);
      if (!patch) return;
      doc = { blocks: updateControl(doc, id, index, patch).blocks };
      refreshFigure(id);
      commit();
      return;
    }

    if ((fieldName === "text" && (block.type === "heading" || block.type === "paragraph" || block.type === "markdown"))) {
      doc = { blocks: updateBlock(doc, id, { text: el.value }).blocks };
      commit();
      return;
    }
    if (fieldName === "level") {
      const level = Number(el.value);
      if (level >= 1 && level <= 3) doc = { blocks: updateBlock(doc, id, { level }).blocks };
      commit();
      return;
    }
    if (fieldName === "items") {
      doc = { blocks: updateBlock(doc, id, { items: el.value.split("\n") }).blocks };
      commit();
      return;
    }
    if (fieldName === "namespace") {
      const name = el.value.trim();
      if (name && !NAME_RE.test(name)) return;
      doc = { blocks: updateBlock(doc, id, { namespace: name || null }).blocks };
      refreshFigure(id);
      commit();
      return;
    }
    if (fieldName === "viewBox") {
      doc = { blocks: updateBlock(doc, id, { viewBox: el.value }).blocks };
      refreshFigure(id);
      commit();
    }
  }

  /**
   * @param {FocusEvent} event
   */
  function onBlur(event) {
    const el = event.target;
    if (!el?.dataset?.field || !el.closest?.(".im-doc-inspector")) return;
    const block = doc.blocks.find((b) => b.id === el.closest(".im-doc-block")?.dataset.id);
    if (!block) return;
    if (el.dataset.field === "namespace") {
      el.value = block.namespace || "";
      return;
    }
    if (el.dataset.control == null) return;
    const control = block.controls?.[Number(el.dataset.control)];
    if (!control) return;
    const fieldName = el.dataset.field;
    if (fieldName === "name") el.value = control.name || "";
    if (fieldName === "min") el.value = String(control.range?.[0] ?? "");
    if (fieldName === "max") el.value = String(control.range?.[1] ?? "");
    if (fieldName === "step") el.value = String(control.step ?? "");
    if (fieldName === "speed") el.value = String(control.speed ?? "");
    if (fieldName === "default" && el.type === "number") el.value = String(control.default ?? "");
  }
}

/**
 * @param {object} control
 * @param {string} fieldName
 * @param {HTMLInputElement} el
 */
function patchFromControl(control, fieldName, el) {
  if (fieldName === "name") {
    const value = el.value.trim();
    if (!NAME_RE.test(value)) return null;
    return { name: value };
  }
  if (fieldName === "label") return { label: el.value };
  if (fieldName === "expression") return { expression: el.value };
  if (fieldName === "loop") return { loop: !!el.checked };
  if (fieldName === "default" && el.type === "checkbox") return { default: !!el.checked };
  if (fieldName === "default" && control.kind === "input") return { default: el.value };
  if (fieldName === "min" || fieldName === "max") {
    const n = Number(el.value);
    if (!Number.isFinite(n)) return null;
    const range = control.range ? [control.range[0], control.range[1]] : [0, 100];
    if (fieldName === "min") range[0] = n;
    else range[1] = n;
    return { range };
  }
  if (fieldName === "default" || fieldName === "step" || fieldName === "speed") {
    const n = Number(el.value);
    if (!Number.isFinite(n)) return null;
    if (fieldName === "speed" && n <= 0) return null;
    return { [fieldName]: n };
  }
  return null;
}

/**
 * @param {object} block
 */
function kindLabel(block) {
  if (block.type === "heading") return "Heading";
  if (block.type === "paragraph") return "Paragraph";
  if (block.type === "bullets") return "Bullets";
  if (block.type === "markdown") return "Markdown";
  if (block.type === "graph") return "Graph";
  if (block.type === "figure" && block.customSvg) return "Animated figure";
  if (block.type === "figure") return "Figure";
  return "Block";
}

/**
 * @param {object} control
 */
function controlTitle(control) {
  if (control.kind === "slider") return "Slider";
  if (control.kind === "timer") return "Timer";
  if (control.kind === "input") return "Text field";
  if (control.kind === "toggle") return "Toggle";
  if (control.kind === "let") return "Formula";
  return "Control";
}
