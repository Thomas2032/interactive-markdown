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
  updatePlotAxis,
  updatePlotSeries,
  updatePlotMeta,
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

const ADD_GROUPS = [
  {
    label: "Markdown",
    items: [
      ["heading", "Heading"],
      ["paragraph", "Paragraph"],
      ["bullets", "Bullets"],
    ],
  },
  {
    label: "Interactive",
    items: [
      ["slider", "Slider"],
      ["timer", "Timer"],
      ["input", "Text field"],
      ["toggle", "Toggle"],
      ["formula", "Formula"],
      ["shape", "Shape: rect", "rect"],
      ["shape", "Shape: circle", "circle"],
      ["shape", "Shape: line", "line"],
      ["shape", "Shape: path", "path"],
      ["shape", "Shape: text", "text"],
      ["plot", "XY plot"],
      ["graph", "Graph"],
    ],
  },
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
  /** @type {{ pointerId: number, x: number, y: number, feature: string, shape: string, label: string, active: boolean, at?: number, figureId: string | null } | null} */
  let drag = null;
  let suppressClick = false;

  container.innerHTML = "";
  const root = docEl.createElement("div");
  root.className = "im-doc";

  const bar = docEl.createElement("div");
  bar.className = "im-doc-bar";
  const addWrap = docEl.createElement("div");
  addWrap.className = "im-doc-add";
  const addToggle = docEl.createElement("button");
  addToggle.type = "button";
  addToggle.className = "im-doc-add-toggle";
  addToggle.dataset.menuToggle = "add";
  addToggle.setAttribute("aria-haspopup", "menu");
  addToggle.setAttribute("aria-expanded", "false");
  addToggle.textContent = "Add";
  const menu = docEl.createElement("div");
  menu.className = "im-doc-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  for (const group of ADD_GROUPS) {
    const section = docEl.createElement("div");
    section.className = "im-doc-menu-group";
    const label = docEl.createElement("div");
    label.className = "im-doc-menu-label";
    label.textContent = group.label;
    section.appendChild(label);
    for (const [feature, itemLabel, shape] of group.items) {
      const button = docEl.createElement("button");
      button.type = "button";
      button.dataset.add = feature;
      if (shape) button.dataset.shape = shape;
      button.textContent = itemLabel;
      section.appendChild(button);
    }
    menu.appendChild(section);
  }
  addWrap.append(addToggle, menu);
  bar.appendChild(addWrap);

  const closeMenu = () => {
    menu.hidden = true;
    addToggle.setAttribute("aria-expanded", "false");
  };
  const onDocPointer = (event) => {
    if (menu.hidden || addWrap.contains(event.target)) return;
    closeMenu();
  };
  docEl.addEventListener("pointerdown", onDocPointer);

  const empty = docEl.createElement("p");
  empty.className = "im-doc-empty";
  empty.textContent = "Drag from Add to place a heading, a control, a shape, a plot, or a graph.";

  const blocksEl = docEl.createElement("div");
  blocksEl.className = "im-doc-blocks";

  root.append(bar, empty, blocksEl);
  const ghost = docEl.createElement("div");
  ghost.className = "im-doc-drag-ghost";
  ghost.hidden = true;
  const guide = docEl.createElement("div");
  guide.className = "im-doc-snap";
  guide.hidden = true;
  root.append(ghost, guide);
  container.appendChild(root);

  root.addEventListener("click", onClick);
  root.addEventListener("input", onField);
  root.addEventListener("change", onField);
  root.addEventListener("focusout", onBlur);
  menu.addEventListener("pointerdown", onMenuPointerDown);

  paint();

  return {
    destroy() {
      dead = true;
      endDragListeners();
      docEl.removeEventListener("pointerdown", onDocPointer);
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
    let proseStart = 0;
    let index = 0;
    const flush = () => {
      if (!prose.length) return;
      const el = renderProse(prose);
      el.dataset.at = String(proseStart);
      el.dataset.atEnd = String(index);
      blocksEl.appendChild(el);
      prose = [];
    };
    for (const block of doc.blocks) {
      if (block.type === "figure" || block.type === "graph" || block.type === "plot") {
        flush();
        const el = renderBlock(block);
        el.dataset.at = String(index);
        el.dataset.atEnd = String(index + 1);
        if (block.type === "figure" || block.type === "plot") el.dataset.figureId = block.id;
        blocksEl.appendChild(el);
        index++;
      } else {
        if (!prose.length) proseStart = index;
        prose.push(block);
        index++;
      }
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
    if (block.type === "graph" && !block.model?.animated) {
      row.append(actionButton("add-animation", "Add animation", null));
    }
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
    if (block.type === "graph") {
      if (block.model?.animated) {
        const note = docEl.createElement("p");
        note.className = "im-doc-help";
        note.textContent = "Dashes and dots run on this canvas. Path, quantity, direction, and seconds are on the canvas.";
        const remove = docEl.createElement("button");
        remove.type = "button";
        remove.dataset.action = "remove-animation";
        remove.textContent = "Remove animation";
        box.append(note, remove);
      }
      return box;
    }
    if (block.type === "plot") {
      const ns = input("text", block.namespace || "");
      ns.dataset.field = "namespace";
      box.appendChild(field("Shared name", ns));
      const grid = input("checkbox", "");
      grid.checked = block.plot?.grid !== false;
      grid.dataset.field = "plotGrid";
      box.appendChild(field("Grid", grid));
      for (const which of ["x", "y"]) {
        const axis = block.plot?.[which] || {};
        const group = docEl.createElement("fieldset");
        group.className = "im-doc-sub";
        const legend = docEl.createElement("legend");
        legend.textContent = which.toUpperCase() + " axis";
        group.appendChild(legend);
        for (const [key, value, title] of [
          ["min", axis.min, "Min"],
          ["max", axis.max, "Max"],
          ["step", axis.step, "Step"],
          ["label", axis.label || "", "Label"],
        ]) {
          const el = input(key === "label" ? "text" : "number", value ?? "");
          el.dataset.plotAxis = which;
          el.dataset.field = key;
          group.appendChild(field(title, el));
        }
        box.appendChild(group);
      }
      (block.plot?.series || []).forEach((series, index) => {
        const group = docEl.createElement("fieldset");
        group.className = "im-doc-sub";
        const legend = docEl.createElement("legend");
        legend.textContent = "Series" + (series.id ? ` ${series.id}` : "");
        group.appendChild(legend);
        const expr = textarea(series.expression || "", 3);
        expr.dataset.plotSeries = String(index);
        expr.dataset.field = "expression";
        group.appendChild(field("y =", expr));
        for (const [key, value, title] of [
          ["stroke", series.stroke || "", "Stroke"],
          ["fill", series.fill || "", "Fill"],
          ["fillOpacity", series.fillOpacity ?? 0.25, "Fill opacity"],
          ["width", series.width ?? 2.25, "Width"],
        ]) {
          const el = input(key === "stroke" || key === "fill" ? "text" : "number", value);
          el.dataset.plotSeries = String(index);
          el.dataset.field = key;
          group.appendChild(field(title, el));
        }
        box.appendChild(group);
      });
      (block.controls || []).forEach((control, index) => {
        box.appendChild(renderControl(control, index));
      });
      return box;
    }
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
      mounts.set(
        block.id,
        mountGraphEditor(host, block.model || { nodes: [], edges: [] }, {
          onChange(model) {
            doc = { blocks: updateBlock(doc, block.id, { model }).blocks };
            commit();
          },
        })
      );
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
    if (!block || (block.type !== "figure" && block.type !== "plot") || !host) return;
    const prev = mounts.get(id);
    if (prev) {
      prev.destroy();
      mounts.delete(id);
    }
    host.innerHTML = "";
    mounts.set(id, mountIvm(host, serializeFigure(block)));
  }

  /**
   * @param {PointerEvent} event
   */
  function onMenuPointerDown(event) {
    const target = event.target;
    const button = target && target.closest ? target.closest("[data-add]") : null;
    if (!button || !menu.contains(button) || event.button !== 0) return;
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      feature: button.dataset.add || "",
      shape: button.dataset.shape || "",
      label: button.textContent || "",
      active: false,
      figureId: null,
    };
    docEl.addEventListener("pointermove", onMenuPointerMove);
    docEl.addEventListener("pointerup", onMenuPointerUp);
    docEl.addEventListener("pointercancel", onMenuPointerUp);
  }

  /**
   * @param {PointerEvent} event
   */
  function onMenuPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active) {
      if (dx * dx + dy * dy < 36) return;
      drag.active = true;
      suppressClick = true;
      closeMenu();
      ghost.textContent = drag.label;
      ghost.hidden = false;
      root.classList.add("is-dragging");
    }
    ghost.style.left = event.clientX + 12 + "px";
    ghost.style.top = event.clientY + 12 + "px";
    updateSnap(event.clientX, event.clientY);
  }

  /**
   * @param {PointerEvent} event
   */
  function onMenuPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const active = drag.active;
    const feature = drag.feature;
    const shape = drag.shape;
    const at = drag.at;
    const figureId = drag.figureId;
    clearDrag();
    if (!active) return;
    addFeature(feature, shape || undefined, { at, figureId });
  }

  function endDragListeners() {
    docEl.removeEventListener("pointermove", onMenuPointerMove);
    docEl.removeEventListener("pointerup", onMenuPointerUp);
    docEl.removeEventListener("pointercancel", onMenuPointerUp);
  }

  function clearDrag() {
    drag = null;
    ghost.hidden = true;
    guide.hidden = true;
    root.classList.remove("is-dragging");
    for (const el of blocksEl.querySelectorAll(".is-snap-target")) el.classList.remove("is-snap-target");
    endDragListeners();
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  function updateSnap(x, y) {
    if (!drag) return;
    for (const el of blocksEl.querySelectorAll(".is-snap-target")) el.classList.remove("is-snap-target");
    const figureId = figureUnder(x, y, drag.feature);
    if (figureId) {
      drag.figureId = figureId;
      drag.at = undefined;
      guide.hidden = true;
      blocksEl.querySelector(`[data-figure-id="${figureId}"]`)?.classList.add("is-snap-target");
      return;
    }
    const slot = nearestGap(y);
    drag.figureId = null;
    drag.at = slot.at;
    const area = blocksEl.getBoundingClientRect();
    guide.hidden = false;
    guide.style.left = area.left + "px";
    guide.style.width = Math.max(area.width, 40) + "px";
    guide.style.top = slot.y + "px";
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} feature
   */
  function figureUnder(x, y, feature) {
    const attachable =
      feature === "slider" ||
      feature === "timer" ||
      feature === "input" ||
      feature === "toggle" ||
      feature === "formula" ||
      feature === "shape";
    if (!attachable || typeof docEl.elementFromPoint !== "function") return null;
    const hit = docEl.elementFromPoint(x, y);
    const blockEl = hit && hit.closest ? hit.closest(".im-doc-block[data-figure-id]") : null;
    if (!blockEl || !blocksEl.contains(blockEl)) return null;
    const rect = blockEl.getBoundingClientRect();
    const margin = Math.min(18, rect.height * 0.2);
    if (y < rect.top + margin || y > rect.bottom - margin) return null;
    return blockEl.dataset.figureId || null;
  }

  /**
   * @param {number} clientY
   */
  function nearestGap(clientY) {
    const children = [...blocksEl.querySelectorAll(":scope > .im-doc-prose, :scope > .im-doc-block")];
    /** @type {{ at: number, y: number }[]} */
    const slots = [];
    if (!children.length) {
      const rect = (empty.hidden ? blocksEl : empty).getBoundingClientRect();
      slots.push({ at: doc.blocks.length, y: rect.top + 8 });
    } else {
      for (const child of children) {
        const rect = child.getBoundingClientRect();
        slots.push({ at: Number(child.dataset.at), y: rect.top });
      }
      const last = children[children.length - 1];
      const lastRect = last.getBoundingClientRect();
      slots.push({ at: Number(last.dataset.atEnd), y: lastRect.bottom });
    }
    let best = slots[0];
    let bestDist = Infinity;
    for (const slot of slots) {
      const dist = Math.abs(clientY - slot.y);
      if (dist < bestDist) {
        best = slot;
        bestDist = dist;
      }
    }
    return best;
  }

  /**
   * @param {MouseEvent} event
   */
  function onClick(event) {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    const target = event.target;
    if (!target || !target.closest) return;
    const add = target.closest("[data-add]");
    if (add && !add.closest(".im-graph")) {
      event.preventDefault();
      addFeature(add.dataset.add || "", add.dataset.shape);
      closeMenu();
      return;
    }
    if (target.closest("[data-menu-toggle]")) {
      event.preventDefault();
      const open = menu.hidden;
      menu.hidden = !open;
      addToggle.setAttribute("aria-expanded", open ? "true" : "false");
      return;
    }
    const actionEl = target.closest("[data-action]");
    if (actionEl && !actionEl.closest(".im-graph")) {
      const action = actionEl.dataset.action || "";
      if (action === "select" || action === "move" || action === "remove-block" || action === "remove-control" || action === "remove-shape" || action === "add-animation" || action === "remove-animation") {
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
   * @param {string} [shapeType]
   * @param {{ at?: number, figureId?: string | null }} [placement]
   */
  function addFeature(feature, shapeType, placement) {
    if (feature === "graph" || feature === "animated") {
      const at = placement && !placement.figureId ? placement.at : undefined;
      const result = insertFeature(doc, "graph", { at });
      doc = result.doc;
      selectedId = result.focusId || selectedId;
      paint();
      commit();
      return;
    }
    if (feature === "plot") {
      const at = placement && !placement.figureId ? placement.at : undefined;
      const result = insertFeature(doc, "plot", { at });
      doc = result.doc;
      selectedId = result.focusId || selectedId;
      paint();
      commit();
      return;
    }
    if (feature === "shape" && !shapeType) shapeType = "rect";
    /** @type {string | undefined} */
    let figureId;
    /** @type {number | undefined} */
    let at;
    if (placement) {
      figureId = placement.figureId || undefined;
      at = figureId ? undefined : placement.at;
    } else {
      const selected = doc.blocks.find((b) => b.id === selectedId);
      figureId = selected && (selected.type === "figure" || selected.type === "plot") ? selected.id : undefined;
    }
    const result = insertFeature(doc, feature, { figureId, shapeType, at });
    doc = result.doc;
    selectedId = result.focusId || selectedId;
    paint();
    commit();
  }

  /**
   * @param {string} id
   * @param {boolean} on
   */
  function setGraphAnimated(id, on) {
    const block = doc.blocks.find((b) => b.id === id);
    if (!block || block.type !== "graph") return;
    const model = {
      nodes: (block.model?.nodes || []).map((n) => ({ ...n })),
      edges: (block.model?.edges || []).map((e) => ({ ...e })),
    };
    if (block.model?.motion) model.motion = { ...block.model.motion };
    if (on) model.animated = true;
    doc = { blocks: updateBlock(doc, id, { model }).blocks };
    paint();
    commit();
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
    if (action === "add-animation") {
      setGraphAnimated(id, true);
      return;
    }
    if (action === "remove-animation") {
      setGraphAnimated(id, false);
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
    if (fieldName === "plotGrid") {
      doc = { blocks: updatePlotMeta(doc, id, { grid: !!el.checked }).blocks };
      refreshFigure(id);
      commit();
      return;
    }
    if (el.dataset.plotAxis) {
      const which = el.dataset.plotAxis;
      const patch = {};
      if (fieldName === "label") patch.label = el.value;
      else {
        const n = Number(el.value);
        if (!Number.isFinite(n)) return;
        if (fieldName === "step" && n <= 0) return;
        patch[fieldName] = n;
      }
      doc = { blocks: updatePlotAxis(doc, id, which, patch).blocks };
      refreshFigure(id);
      commit();
      return;
    }
    if (el.dataset.plotSeries != null) {
      const index = Number(el.dataset.plotSeries);
      const patch = {};
      if (fieldName === "expression" || fieldName === "stroke" || fieldName === "fill") {
        patch[fieldName] = el.value;
      } else {
        const n = Number(el.value);
        if (!Number.isFinite(n)) return;
        patch[fieldName] = n;
      }
      doc = { blocks: updatePlotSeries(doc, id, index, patch).blocks };
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
  if (block.type === "plot") return "XY plot";
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
