/**
 * Lightweight Source-tab completions for IVM fences (no LSP).
 * Triggers on `@` / word prefix inside an active ```ivm fence.
 */

import { FUNCTION_NAMES } from "./expr.js";
import { splitIvmFences } from "./parse-ivm.js";

/** @typedef {{ label: string, insert: string, detail?: string }} Completion */

const DIRECTIVE_COMPLETIONS = /** @type {Completion[]} */ ([
  { label: "@ns", insert: "@ns ", detail: "shared namespace" },
  { label: "@slider", insert: "@slider name: 0..10 = 5 step=1 \"Label\"", detail: "range control" },
  { label: "@timer", insert: "@timer t: 0..100 = 0 speed=30 loop \"Phase\"", detail: "animated value" },
  { label: "@input", insert: "@input name: \"\" \"Label\"", detail: "text field" },
  { label: "@toggle", insert: "@toggle on: true \"Label\"", detail: "checkbox" },
  { label: "@let", insert: "@let name = ", detail: "derived value" },
  { label: "@fn", insert: "@fn name(x) = ", detail: "pure macro" },
  { label: "@angle", insert: "@angle deg", detail: "trig mode deg|rad" },
  { label: "@phase", insert: "@phase name: 0..1", detail: "named timeline span" },
  { label: "@svg", insert: "@svg 200x80\n  ", detail: "SVG template / overlay" },
  { label: "@plot", insert: "@plot 480x280 legend\n@axis x: -3..3 step=1\n@axis y: -1..1 step=0.5\n@series\n  y = ", detail: "XY chart" },
  { label: "@axis", insert: "@axis x: 0..1 step=0.2", detail: "plot axis" },
  { label: "@series", insert: "@series\n  y = ", detail: "plot series" },
  { label: "@grid", insert: "@grid on", detail: "plot grid on|off" },
  { label: "@legend", insert: "@legend pos=top-right", detail: "legend position" },
  { label: "@annotate", insert: "@annotate x=0 y=0 \"note\"", detail: "plot callout" },
  { label: "@scrub", insert: "@scrub t duration=4", detail: "bind timer to CSS animation scrub" },
  { label: "@data", insert: "@data sales\nmonth, value\nJan, 40\nFeb, 55\n", detail: "CSV/table → name_col arrays" },
  { label: "@anchor", insert: "@anchor tip x=100 y=40", detail: "named SVG point → tip_x / tip_y" },
  { label: "@graph", insert: "@graph layout=dagre\n@node a: \"A\"\n@node b: \"B\"\n@edge a -> b\n", detail: "node/edge graph preview (auto-layout)" },
  { label: "@lane", insert: "@lane id: \"Lane\" y=0 height=120", detail: "graph swimlane" },
  { label: "@group", insert: "@group id: \"Group\"", detail: "graph node group" },
  { label: "@node", insert: "@node id: \"Label\" kind=action", detail: "graph node (omit x/y with layout=)" },
  { label: "@edge", insert: "@edge from -> to", detail: "graph edge" },
  { label: "@animate", insert: "@animate path=curve quantity=3 speed=2.4 direction=forward", detail: "graph motion" },
]);

const SERIES_KIND_COMPLETIONS = /** @type {Completion[]} */ ([
  { label: "y =", insert: "y = ", detail: "Cartesian series (free var x)" },
  { label: "x = / y =", insert: "x = cos(t)\n  y = sin(t)\n  t = 0..6.2832", detail: "parametric" },
  { label: "r = / theta =", insert: "r = 1\n  theta = 0..6.2832", detail: "polar" },
  { label: "kind=bar", insert: "kind=bar\n  cats = A, B, C\n  y = [10, 20, 15]", detail: "bar chart" },
  { label: "from=data", insert: "kind=bar from=sales\n  cats = month\n  y = value", detail: "series from @data columns" },
  { label: "kind=scatter", insert: "kind=scatter marker=circle\n  x = [1, 2, 3]\n  y = [2, 5, 3]", detail: "scatter points" },
]);

const PORT_COMPLETIONS = /** @type {Completion[]} */ (
  ["left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right", "tl", "tr", "bl", "br"].map(
    (p) => ({ label: p, insert: p, detail: "edge port" })
  )
);

const FN_COMPLETIONS = FUNCTION_NAMES.map((n) => ({
  label: n,
  insert: n + "(",
  detail: "expression function",
}));

/**
 * Find the ```ivm fence containing cursor offset, if any.
 * @param {string} source
 * @param {number} offset
 * @returns {{ body: string, bodyStart: number, bodyEnd: number } | null}
 */
export function fenceAtOffset(source, offset) {
  const segments = splitIvmFences(source);
  for (const seg of segments) {
    if (seg.type !== "ivm") continue;
    // content is interior; seg.start includes ```ivm\n
    const open = source.slice(seg.start, seg.start + 8); // ```ivm\n roughly
    const bodyStart = seg.start + (source.slice(seg.start).match(/^```ivm[ \t]*\n/)?.[0].length || 0);
    const bodyEnd = seg.end - 3; // closing ```
    if (offset >= bodyStart && offset <= bodyEnd) {
      return { body: seg.content, bodyStart, bodyEnd };
    }
    void open;
  }
  return null;
}

/**
 * @param {string} source
 * @param {number} cursor
 * @returns {{ items: Completion[], from: number, to: number } | null}
 */
export function completionsAt(source, cursor) {
  const fence = fenceAtOffset(source, cursor);
  if (!fence) return null;

  const before = source.slice(fence.bodyStart, cursor);
  const lineStart = before.lastIndexOf("\n") + 1;
  const linePrefix = before.slice(lineStart);
  const trimmedLead = linePrefix.match(/^\s*/)[0].length;
  const tokenMatch = linePrefix.slice(trimmedLead).match(/^(@?[A-Za-z_][A-Za-z0-9_-]*|=?)$/);
  // Also allow mid-token: last word
  const word = linePrefix.match(/(@?[A-Za-z_][A-Za-z0-9_-]*)$/);
  if (!word) {
    // After "from=" or "to=" offer ports
    if (/\b(from|to)=$/.test(linePrefix)) {
      return { items: PORT_COMPLETIONS, from: cursor, to: cursor };
    }
    // Bare line under @series → series kinds
    if (/@series\b/i.test(before.split("\n").slice(-4).join("\n")) && /^\s*$/.test(linePrefix)) {
      return { items: SERIES_KIND_COMPLETIONS, from: cursor, to: cursor };
    }
    return null;
  }

  const token = word[1];
  const from = cursor - token.length;
  const to = cursor;
  const lower = token.toLowerCase();

  /** @type {Completion[]} */
  let items = [];

  if (token.startsWith("@") || (linePrefix.trimStart().startsWith("@") && trimmedLead === linePrefix.indexOf(token))) {
    items = DIRECTIVE_COMPLETIONS.filter(
      (c) => c.label.toLowerCase().startsWith(lower) || c.label.toLowerCase().includes(lower.slice(1))
    );
  } else if (/\b(from|to)=$/.test(linePrefix.slice(0, linePrefix.length - token.length))) {
    items = PORT_COMPLETIONS.filter((c) => c.label.toLowerCase().startsWith(lower));
  } else if (/^\s*(y|x|r|t|theta)?$/.test(lower) && /@series\b/i.test(before)) {
    items = SERIES_KIND_COMPLETIONS.filter(
      (c) => c.label.toLowerCase().startsWith(lower) || lower === "" || c.label.toLowerCase().includes(lower)
    );
  } else {
    // Expression / identifier context → functions
    items = FN_COMPLETIONS.filter((c) => c.label.toLowerCase().startsWith(lower));
  }

  if (!items.length) return null;
  return { items: items.slice(0, 40), from, to };
}

/**
 * Attach a lightweight completion popup to a textarea.
 * @param {HTMLTextAreaElement} textarea
 * @param {{ onInsert?: () => void }} [options]
 */
export function attachAutocomplete(textarea, options = {}) {
  const doc = textarea.ownerDocument;
  const popup = doc.createElement("div");
  popup.className = "im-ac-popup";
  popup.hidden = true;
  popup.setAttribute("role", "listbox");
  doc.body.appendChild(popup);

  let active = -1;
  /** @type {{ items: Completion[], from: number, to: number } | null} */
  let current = null;

  function hide() {
    popup.hidden = true;
    popup.innerHTML = "";
    current = null;
    active = -1;
  }

  function render() {
    if (!current || !current.items.length) {
      hide();
      return;
    }
    popup.innerHTML = "";
    current.items.forEach((item, i) => {
      const el = doc.createElement("button");
      el.type = "button";
      el.className = "im-ac-item" + (i === active ? " is-active" : "");
      el.setAttribute("role", "option");
      el.innerHTML = `<span class="im-ac-label"></span><span class="im-ac-detail"></span>`;
      el.querySelector(".im-ac-label").textContent = item.label;
      el.querySelector(".im-ac-detail").textContent = item.detail || "";
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        apply(i);
      });
      popup.appendChild(el);
    });
    position();
    popup.hidden = false;
  }

  function position() {
    const rect = textarea.getBoundingClientRect();
    // Approximate caret: use mirror technique lightly via scroll + line count
    const value = textarea.value;
    const pos = textarea.selectionStart || 0;
    const pre = value.slice(0, pos);
    const lines = pre.split("\n");
    const lineNo = lines.length;
    const col = lines[lines.length - 1].length;
    const style = getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight) || 18;
    const padTop = parseFloat(style.paddingTop) || 0;
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const fontSize = parseFloat(style.fontSize) || 13;
    const top =
      rect.top +
      padTop +
      (lineNo - 1) * lineHeight -
      textarea.scrollTop +
      lineHeight +
      4;
    const left = rect.left + padLeft + Math.min(col, 60) * fontSize * 0.55 - textarea.scrollLeft;
    popup.style.top = `${Math.min(Math.max(8, top), window.innerHeight - 200)}px`;
    popup.style.left = `${Math.min(Math.max(8, left), window.innerWidth - 280)}px`;
  }

  function apply(index) {
    if (!current || !current.items[index]) return;
    const item = current.items[index];
    const value = textarea.value;
    textarea.value = value.slice(0, current.from) + item.insert + value.slice(current.to);
    const caret = current.from + item.insert.length;
    textarea.selectionStart = textarea.selectionEnd = caret;
    hide();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    options.onInsert?.();
    textarea.focus();
  }

  function refresh() {
    const cursor = textarea.selectionStart || 0;
    current = completionsAt(textarea.value, cursor);
    active = current ? 0 : -1;
    render();
  }

  textarea.addEventListener("keydown", (e) => {
    if (popup.hidden || !current) {
      if (e.key === " " && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        refresh();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = (active + 1) % current.items.length;
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = (active - 1 + current.items.length) % current.items.length;
      render();
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (active >= 0) {
        e.preventDefault();
        apply(active);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      hide();
    }
  });

  textarea.addEventListener("input", () => {
    // Trigger on @ or word chars
    const cursor = textarea.selectionStart || 0;
    const ch = textarea.value.slice(Math.max(0, cursor - 1), cursor);
    if (ch === "@" || /[A-Za-z0-9_]/.test(ch) || ch === "=") refresh();
    else hide();
  });

  textarea.addEventListener("blur", () => {
    // Delay so mousedown on item can fire
    setTimeout(hide, 150);
  });

  textarea.addEventListener("click", hide);
  textarea.addEventListener("scroll", hide);

  return {
    destroy() {
      hide();
      popup.remove();
    },
    refresh,
  };
}

export {
  DIRECTIVE_COMPLETIONS,
  SERIES_KIND_COMPLETIONS,
  PORT_COMPLETIONS,
  FN_COMPLETIONS,
};
