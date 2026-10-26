/**
 * Mount IVM controls and bind SVG templates to live state.
 */

import { evaluate, substitute } from "./expr.js";
import { parseIvm } from "./parse-ivm.js";
import { sanitizeSvg } from "./sanitize-svg.js";
import { mountGraphEditor, serializeGraph, normalizeMotion } from "./graph-editor.js";
import { buildPlotSvg, normalizePlot, hitTestPlot } from "./plot.js";

/** @type {Map<string, Record<string, unknown>>} */
const namespaces = new Map();

/**
 * @param {string|null} ns
 * @param {Map<string, Record<string, unknown>> | null | undefined} store
 * @returns {Record<string, unknown>}
 */
function getNamespaceState(ns, store) {
  if (!ns) return {};
  const map = store || namespaces;
  if (!map.has(ns)) map.set(ns, {});
  return /** @type {Record<string, unknown>} */ (map.get(ns));
}

/** Clear shared `@ns` state (call before re-rendering a whole document). */
export function resetNamespaces() {
  namespaces.clear();
}

/**
 * Mount one ```ivm fence body into a container element.
 * @param {HTMLElement} container
 * @param {string} fenceBody
 * @param {{
 *   onGraphChange?: (body: string) => void,
 *   envStore?: Map<string, Record<string, unknown>>,
 *   envKey?: string,
 *   namespaces?: Map<string, Record<string, unknown>>,
 * }} [options]
 * @returns {{ destroy: () => void, getState: () => Record<string, unknown> }}
 */
export function mountIvm(container, fenceBody, options = {}) {
  const parsed = parseIvm(fenceBody);
  const doc = container.ownerDocument || globalThis.document;
  container.classList.add("im-ivm");
  container.innerHTML = "";

  if (parsed.errors.length) {
    const err = doc.createElement("div");
    err.className = "im-errors";
    err.textContent = parsed.errors.join("\n");
    container.appendChild(err);
  }

  const nsMap = options.namespaces || namespaces;
  const nsState = getNamespaceState(parsed.namespace, nsMap);

  /** @type {Record<string, unknown>} */
  let local;
  if (options.envStore && options.envKey) {
    if (!options.envStore.has(options.envKey)) {
      options.envStore.set(options.envKey, Object.create(null));
    }
    local = /** @type {Record<string, unknown>} */ (options.envStore.get(options.envKey));
  } else {
    local = Object.create(null);
  }

  for (const c of parsed.controls) {
    if (c.kind === "let" || c.name == null) continue;
    const existingNs =
      parsed.namespace && Object.prototype.hasOwnProperty.call(nsState, c.name)
        ? nsState[c.name]
        : undefined;
    const existingLocal = Object.prototype.hasOwnProperty.call(local, c.name) ? local[c.name] : undefined;
    const val = existingLocal !== undefined ? existingLocal : existingNs !== undefined ? existingNs : c.default;
    local[c.name] = val;
    if (parsed.namespace) nsState[c.name] = val;
  }

  const hasControls = parsed.controls.some((c) => c.kind !== "let" && c.name != null);
  if (!hasControls && !parsed.graph) container.classList.add("im-ivm-static");
  if (parsed.plot) container.classList.add("im-ivm-plot");
  if (parsed.graph) container.classList.add("im-ivm-graph");

  const controlsEl = doc.createElement("div");
  controlsEl.className = "im-controls";

  const svgHost = doc.createElement("div");
  svgHost.className = "im-svg-host";

  /** @type {Array<() => void>} */
  const cleanups = [];
  /** @type {Map<string, HTMLElement>} */
  const valueLabels = new Map();
  /** @type {{ destroy: () => void, getModel: () => object, setLiveMotion?: (p: object|null) => void } | null} */
  let graphMount = null;
  /** @type {HTMLElement | null} */
  let tooltipEl = null;
  /** @type {SVGElement | null} */
  let hoverMark = null;

  function buildEnv() {
    /** @type {Record<string, unknown>} */
    const env = Object.create(null);
    if (parsed.namespace) Object.assign(env, nsState);
    Object.assign(env, local);

    for (const c of parsed.controls) {
      if (c.kind !== "let" || !c.name || !c.expression) continue;
      try {
        const v = evaluate(c.expression, env);
        env[c.name] = v;
        local[c.name] = v;
        if (parsed.namespace) nsState[c.name] = v;
      } catch (err) {
        console.warn("[ivm @let]", c.name, /** @type {Error} */ (err).message);
        env[c.name] = NaN;
      }
    }
    return env;
  }

  function wrapSvgTemplate(markup) {
    const src = String(markup ?? "").trim();
    if (!src) return src;
    const w = parsed.svgWidth;
    const h = parsed.svgHeight;
    if (w == null || h == null || !Number.isFinite(w) || !Number.isFinite(h)) {
      return src;
    }
    if (/^<svg\b/i.test(src)) return src;
    return (
      `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">\n` +
      src +
      `\n</svg>`
    );
  }

  /** Skip DOM writes when the substituted source is unchanged so CSS and SMIL keep running. */
  let lastFilled = null;

  /**
   * @param {string} markup
   */
  function paintSvg(markup) {
    let shadow = svgHost.shadowRoot;
    if (!shadow && typeof svgHost.attachShadow === "function") {
      try {
        shadow = svgHost.attachShadow({ mode: "open" });
      } catch (_) {
        shadow = null;
      }
    }
    const target = shadow || svgHost;
    const owner = svgHost.ownerDocument || globalThis.document;
    target.innerHTML = "";
    hoverMark = null;
    if (!markup) return;

    if (shadow && owner?.createElement) {
      const frame = owner.createElement("style");
      frame.textContent =
        ":host{display:block;overflow:hidden;transform:translate(0);position:relative}" +
        "svg{display:block;max-width:100%;height:auto;margin:0 auto}" +
        ".im-plot-hover{pointer-events:none}" +
        "@media (prefers-reduced-motion:reduce){:host *{animation:none!important}}";
      target.appendChild(frame);
    }

    const Parser = globalThis.DOMParser;
    if (!Parser) return;
    const parsedDoc = new Parser().parseFromString(markup, "image/svg+xml");
    const root = parsedDoc.documentElement;
    const rootName = String(root?.localName || root?.tagName || "").toLowerCase();
    if (!root || rootName === "parsererror" || rootName !== "svg") return;
    const node = typeof owner.importNode === "function" ? owner.importNode(root, true) : root;
    target.appendChild(node);
  }

  /** @type {HTMLElement | null} */
  let runtimeErrorsEl = null;

  function showRuntimeErrors(msgs) {
    const list = Array.isArray(msgs) ? msgs.filter(Boolean) : [];
    if (!list.length) {
      if (runtimeErrorsEl) {
        runtimeErrorsEl.remove();
        runtimeErrorsEl = null;
      }
      return;
    }
    if (!runtimeErrorsEl) {
      runtimeErrorsEl = doc.createElement("div");
      runtimeErrorsEl.className = "im-errors im-runtime-errors";
      if (svgHost.parentNode === container) container.insertBefore(runtimeErrorsEl, svgHost);
      else container.appendChild(runtimeErrorsEl);
    }
    runtimeErrorsEl.textContent = list.join("\n");
  }

  function applyGraphMotion(env) {
    if (!graphMount || !parsed.graph) return;
    const motion = parsed.graph.animated ? normalizeMotion(parsed.graph.motion) : null;
    if (!motion) {
      graphMount.setLiveMotion?.(null);
      return;
    }
    /** @type {Record<string, unknown>} */
    const patch = {};
    let used = false;
    if (motion.speedFrom) {
      const v = Number(env[motion.speedFrom]);
      if (Number.isFinite(v)) {
        patch.speed = v;
        used = true;
      }
    }
    if (motion.quantityFrom) {
      const v = Math.round(Number(env[motion.quantityFrom]));
      if (Number.isFinite(v)) {
        patch.quantity = v;
        used = true;
      }
    }
    // Always refresh animated graphs so quantity/speed literals stay in sync after remount
    if (parsed.graph.animated) {
      graphMount.setLiveMotion?.(used ? { ...motion, ...patch } : { ...motion });
    } else {
      graphMount.setLiveMotion?.(null);
    }
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.hidden = true;
    if (hoverMark && hoverMark.parentNode) hoverMark.parentNode.removeChild(hoverMark);
    hoverMark = null;
  }

  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = doc.createElement("div");
    tooltipEl.className = "im-plot-tooltip";
    tooltipEl.hidden = true;
    tooltipEl.setAttribute("role", "status");
    container.appendChild(tooltipEl);
    return tooltipEl;
  }

  /**
   * @param {{ series: string, x: number, y: number, px: number, py: number, stroke: string }} hit
   */
  function showTooltip(hit) {
    const tip = ensureTooltip();
    const fmt = (n) => {
      if (!Number.isFinite(n)) return "—";
      const a = Math.abs(n);
      if (a !== 0 && (a >= 1000 || a < 0.001)) return n.toExponential(3);
      return String(Math.round(n * 1000) / 1000);
    };
    tip.hidden = false;
    tip.innerHTML =
      `<strong>${escapeHtml(hit.series)}</strong>` +
      `<span>x = ${escapeHtml(fmt(hit.x))}</span>` +
      `<span>y = ${escapeHtml(fmt(hit.y))}</span>`;

    const root =
      svgHost.shadowRoot?.querySelector?.("svg") || svgHost.querySelector?.("svg");
    if (root) {
      if (hoverMark && hoverMark.parentNode) hoverMark.parentNode.removeChild(hoverMark);
      const owner = root.ownerDocument || doc;
      const g = owner.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "im-plot-hover");
      const c = owner.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", String(hit.px));
      c.setAttribute("cy", String(hit.py));
      c.setAttribute("r", "5");
      c.setAttribute("fill", hit.stroke || "#6d28d9");
      c.setAttribute("stroke", "#ffffff");
      c.setAttribute("stroke-width", "2");
      g.appendChild(c);
      root.appendChild(g);
      hoverMark = g;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function rebind() {
    const env = buildEnv();
    /** @type {string[]} */
    const softErrors = [];
    for (const [name, el] of valueLabels) {
      const v = env[name];
      el.textContent =
        typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v ?? "");
    }

    if (parsed.graph) {
      applyGraphMotion(env);
      showRuntimeErrors([]);
      return;
    }

    if (parsed.plot) {
      const model = normalizePlot({
        width: parsed.plot.width ?? undefined,
        height: parsed.plot.height ?? undefined,
        grid: parsed.plot.grid,
        legend: parsed.plot.legend,
        lockAspect: parsed.plot.lockAspect,
        x: parsed.plot.x || undefined,
        y: parsed.plot.y || undefined,
        series: parsed.plot.series || [],
      });
      let overlayMarkup = null;
      if (parsed.templateSvg) {
        const raw = String(parsed.templateSvg).trim();
        const wrapped =
          /^<svg\b/i.test(raw) || model.width == null
            ? raw
            : `<svg viewBox="0 0 ${model.width} ${model.height}" xmlns="http://www.w3.org/2000/svg">\n${raw}\n</svg>`;
        overlayMarkup = substitute(wrapped, env, softErrors);
      }
      const filled = buildPlotSvg(model, env, { errors: softErrors, overlayMarkup });
      showRuntimeErrors(softErrors);
      if (filled === lastFilled) return;
      lastFilled = filled;
      paintSvg(sanitizeSvg(filled));
      return;
    }
    if (!parsed.templateSvg) {
      showRuntimeErrors([]);
      if (lastFilled !== "") {
        lastFilled = "";
        paintSvg("");
      }
      return;
    }
    const filled = substitute(wrapSvgTemplate(parsed.templateSvg), env, softErrors);
    showRuntimeErrors(softErrors);
    if (filled === lastFilled) return;
    lastFilled = filled;
    paintSvg(sanitizeSvg(filled));
  }

  function setVar(name, value) {
    local[name] = value;
    if (parsed.namespace) nsState[name] = value;
    rebind();
  }

  for (const c of parsed.controls) {
    if (c.kind === "let" || c.name == null) continue;

    if (c.kind === "slider" || c.kind === "timer") {
      const row = doc.createElement("div");
      row.className = "im-control im-slider-row";

      const label = doc.createElement("label");
      label.className = "im-label";
      const title = doc.createElement("span");
      title.className = "im-label-text";
      title.textContent = c.label || c.name || "";
      label.appendChild(title);

      const valSpan = doc.createElement("span");
      valSpan.className = "im-value";
      valueLabels.set(c.name, valSpan);
      label.appendChild(valSpan);

      const input = doc.createElement("input");
      input.type = "range";
      input.min = String(c.range?.[0] ?? 0);
      input.max = String(c.range?.[1] ?? 100);
      input.step = String(c.step ?? 1);
      input.value = String(local[c.name] ?? c.default ?? 0);
      input.dataset.var = c.name;
      input.setAttribute("aria-label", c.label || c.name || "slider");

      input.addEventListener("input", () => {
        setVar(c.name, Number(input.value));
      });

      row.appendChild(label);
      row.appendChild(input);

      if (c.kind === "timer") {
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "im-timer-btn";
        btn.dataset.timer = c.name;
        let playing = false;
        let raf = 0;
        let lastTs = 0;
        const speed = c.speed || 30;
        const step = c.step ?? 1;
        const [lo, hi] = c.range || [0, 100];
        const loop = c.loop !== false;
        const rafFn = globalThis.requestAnimationFrame?.bind(globalThis);
        const cafFn = globalThis.cancelAnimationFrame?.bind(globalThis);

        const setPlaying = (p) => {
          playing = p;
          btn.textContent = playing ? "Pause" : "Play";
          btn.setAttribute("aria-pressed", playing ? "true" : "false");
          if (playing) {
            lastTs = globalThis.performance?.now?.() ?? Date.now();
            if (rafFn) raf = rafFn(tick);
          } else if (raf && cafFn) {
            cafFn(raf);
            raf = 0;
          }
        };

        function tick(ts) {
          if (!playing) return;
          const now = ts ?? (globalThis.performance?.now?.() ?? Date.now());
          const dt = (now - lastTs) / 1000;
          lastTs = now;
          let next = Number(local[c.name]) + step * speed * dt;
          if (next > hi) {
            const span = hi - lo || 1;
            next = loop ? lo + ((next - lo) % span) : hi;
            if (!loop) setPlaying(false);
          }
          if (next < lo) next = lo;
          local[c.name] = next;
          if (parsed.namespace) nsState[c.name] = next;
          input.value = String(next);
          rebind();
          if (playing && rafFn) raf = rafFn(tick);
        }

        btn.textContent = "Play";
        btn.addEventListener("click", () => setPlaying(!playing));
        row.appendChild(btn);

        cleanups.push(() => {
          playing = false;
          if (raf && cafFn) cafFn(raf);
        });
      }

      controlsEl.appendChild(row);
    } else if (c.kind === "input") {
      const row = doc.createElement("div");
      row.className = "im-control im-input-row";
      const label = doc.createElement("label");
      label.className = "im-label";
      label.textContent = c.label || c.name || "";
      const input = doc.createElement("input");
      input.type = "text";
      input.value = String(local[c.name] ?? "");
      input.dataset.var = c.name;
      input.addEventListener("input", () => setVar(c.name, input.value));
      row.appendChild(label);
      row.appendChild(input);
      controlsEl.appendChild(row);
    } else if (c.kind === "toggle") {
      const row = doc.createElement("div");
      row.className = "im-control im-toggle-row";
      const label = doc.createElement("label");
      label.className = "im-label im-toggle-label";
      const input = doc.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(local[c.name]);
      input.dataset.var = c.name;
      input.addEventListener("change", () => setVar(c.name, input.checked));
      const span = doc.createElement("span");
      span.textContent = c.label || c.name || "";
      label.appendChild(input);
      label.appendChild(span);
      row.appendChild(label);
      controlsEl.appendChild(row);
    }
  }

  if (hasControls) container.appendChild(controlsEl);

  if (parsed.graph) {
    const graphHost = doc.createElement("div");
    container.appendChild(graphHost);
    graphMount = mountGraphEditor(graphHost, parsed.graph, {
      onChange(model) {
        // Preserve control lines + animate bindings when rewriting the fence
        const body = serializeGraphWithControls(parsed, model);
        options.onGraphChange?.(body);
      },
    });
    rebind();
    return {
      destroy() {
        for (const fn of cleanups) fn();
        graphMount?.destroy();
        container.innerHTML = "";
      },
      getState() {
        return { ...buildEnv(), graph: graphMount?.getModel() };
      },
    };
  }

  container.appendChild(svgHost);

  if (parsed.plot) {
    const onMove = (event) => {
      const root =
        svgHost.shadowRoot?.querySelector?.("svg") || svgHost.querySelector?.("svg");
      if (!root) {
        hideTooltip();
        return;
      }
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        hideTooltip();
        return;
      }
      const vb = root.viewBox?.baseVal;
      const vbW = vb && vb.width ? vb.width : Number(root.getAttribute("width")) || rect.width;
      const vbH = vb && vb.height ? vb.height : Number(root.getAttribute("height")) || rect.height;
      const svgX = ((event.clientX - rect.left) / rect.width) * vbW;
      const svgY = ((event.clientY - rect.top) / rect.height) * vbH;
      const env = buildEnv();
      const model = {
        width: parsed.plot.width ?? undefined,
        height: parsed.plot.height ?? undefined,
        grid: parsed.plot.grid,
        legend: parsed.plot.legend,
        lockAspect: parsed.plot.lockAspect,
        x: parsed.plot.x || undefined,
        y: parsed.plot.y || undefined,
        series: parsed.plot.series || [],
      };
      const hit = hitTestPlot(model, env, svgX, svgY);
      if (!hit) {
        hideTooltip();
        return;
      }
      showTooltip(hit);
    };
    const onLeave = () => hideTooltip();
    svgHost.addEventListener("pointermove", onMove);
    svgHost.addEventListener("pointerleave", onLeave);
    cleanups.push(() => {
      svgHost.removeEventListener("pointermove", onMove);
      svgHost.removeEventListener("pointerleave", onLeave);
      hideTooltip();
    });
  }

  rebind();

  return {
    destroy() {
      for (const fn of cleanups) fn();
      container.innerHTML = "";
    },
    getState() {
      return { ...buildEnv() };
    },
  };
}

/**
 * Rewrite a graph fence while keeping controls / @ns / animate bindings.
 * @param {import('./parse-ivm.js').IvmBlock | object} parsed
 * @param {object} model
 */
function serializeGraphWithControls(parsed, model) {
  const lines = [];
  if (parsed.namespace) lines.push(`@ns ${parsed.namespace}`);
  for (const c of parsed.controls || []) {
    const line = serializeControlLine(c);
    if (line) lines.push(line);
  }
  // serializeGraph emits @graph / @animate / nodes / edges
  const graphBody = serializeGraph(mergeMotionBindings(model, parsed.graph?.motion));
  lines.push(graphBody.replace(/\s*$/, ""));
  return lines.join("\n").replace(/\s*$/, "\n");
}

/**
 * Keep speedFrom/quantityFrom when the editor rewrites motion literals.
 * @param {object} model
 * @param {object | null | undefined} originalMotion
 */
function mergeMotionBindings(model, originalMotion) {
  if (!model?.animated) return model;
  const next = {
    ...model,
    motion: normalizeMotion({
      ...normalizeMotion(originalMotion),
      ...normalizeMotion(model.motion),
      quantityFrom: originalMotion?.quantityFrom || model.motion?.quantityFrom,
      speedFrom: originalMotion?.speedFrom || model.motion?.speedFrom,
    }),
  };
  // If editor wrote literal quantity/speed, keep From names from original when present
  if (originalMotion?.quantityFrom) next.motion.quantityFrom = originalMotion.quantityFrom;
  if (originalMotion?.speedFrom) next.motion.speedFrom = originalMotion.speedFrom;
  return next;
}

/**
 * @param {object} c
 * @returns {string|null}
 */
function serializeControlLine(c) {
  if (!c || !c.kind) return null;
  if (c.kind === "let") {
    if (!c.name || c.expression == null) return null;
    return `@let ${c.name} = ${c.expression}`;
  }
  if (c.kind === "slider" || c.kind === "timer") {
    const [lo, hi] = c.range || [0, 1];
    let line = `@${c.kind} ${c.name}: ${lo}..${hi} = ${c.default ?? lo}`;
    if (c.step != null && c.step !== 1) line += ` step=${c.step}`;
    if (c.kind === "timer") {
      if (c.speed != null && c.speed !== 30) line += ` speed=${c.speed}`;
      if (c.loop === false) line += " noloop";
    }
    if (c.units) line += ` ${c.units}`;
    if (c.label) line += ` ${JSON.stringify(String(c.label))}`;
    return line;
  }
  if (c.kind === "input") {
    let line = `@input ${c.name}: ${JSON.stringify(String(c.default ?? ""))}`;
    if (c.label) line += ` ${JSON.stringify(String(c.label))}`;
    return line;
  }
  if (c.kind === "toggle") {
    let line = `@toggle ${c.name}: ${c.default ? "true" : "false"}`;
    if (c.label) line += ` ${JSON.stringify(String(c.label))}`;
    return line;
  }
  return null;
}
