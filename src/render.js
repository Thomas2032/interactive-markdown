/**
 * Mount IVM controls and bind SVG templates to live state.
 */

import { evaluate, substitute } from "./expr.js";
import { parseIvm } from "./parse-ivm.js";
import { sanitizeSvg } from "./sanitize-svg.js";
import { mountGraphEditor, serializeGraph } from "./graph-editor.js";

/** @type {Map<string, Record<string, unknown>>} */
const namespaces = new Map();

/**
 * @param {string|null} ns
 * @returns {Record<string, unknown>}
 */
function getNamespaceState(ns) {
  if (!ns) return {};
  if (!namespaces.has(ns)) namespaces.set(ns, {});
  return /** @type {Record<string, unknown>} */ (namespaces.get(ns));
}

/** Clear shared `@ns` state (call before re-rendering a whole document). */
export function resetNamespaces() {
  namespaces.clear();
}

/**
 * Mount one ```ivm fence body into a container element.
 * @param {HTMLElement} container
 * @param {string} fenceBody
 * @param {{ onGraphChange?: (body: string) => void }} [options]
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

  if (parsed.graph) {
    container.classList.add("im-ivm-graph");
    const graphHost = doc.createElement("div");
    container.appendChild(graphHost);
    const mounted = mountGraphEditor(graphHost, parsed.graph, {
      onChange(model) {
        options.onGraphChange?.(serializeGraph(model));
      },
    });
    return {
      destroy() {
        mounted.destroy();
        container.innerHTML = "";
      },
      getState() {
        return { graph: mounted.getModel() };
      },
    };
  }

  const nsState = getNamespaceState(parsed.namespace);
  /** @type {Record<string, unknown>} */
  const local = Object.create(null);

  for (const c of parsed.controls) {
    if (c.kind === "let" || c.name == null) continue;
    const existing =
      parsed.namespace && Object.prototype.hasOwnProperty.call(nsState, c.name)
        ? nsState[c.name]
        : undefined;
    const val = existing !== undefined ? existing : c.default;
    local[c.name] = val;
    if (parsed.namespace) nsState[c.name] = val;
  }

  const hasControls = parsed.controls.some((c) => c.kind !== "let" && c.name != null);
  if (!hasControls) container.classList.add("im-ivm-static");

  const controlsEl = doc.createElement("div");
  controlsEl.className = "im-controls";

  const svgHost = doc.createElement("div");
  svgHost.className = "im-svg-host";

  /** @type {Array<() => void>} */
  const cleanups = [];
  /** @type {Map<string, HTMLElement>} */
  const valueLabels = new Map();

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
    // Already a root <svg> — leave author markup alone
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
   * Mount markup in a shadow root so <style> in the figure cannot restyle the editor.
   * transform on the host makes position:fixed a local containing block.
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
    const doc = svgHost.ownerDocument || globalThis.document;
    target.innerHTML = "";
    if (!markup) return;

    // Scope figure CSS to this widget. transform makes position:fixed local.
    if (shadow && doc?.createElement) {
      const frame = doc.createElement("style");
      frame.textContent =
        ":host{display:block;overflow:hidden;transform:translate(0)}" +
        "svg{display:block;max-width:100%;height:auto;margin:0 auto}" +
        "@media (prefers-reduced-motion:reduce){:host *{animation:none!important}}";
      target.appendChild(frame);
    }

    // Parse as XML and adopt the node. innerHTML would lowercase camelCase
    // SVG tags (radialGradient, feGaussianBlur, animateMotion) and drop them.
    const Parser = globalThis.DOMParser;
    if (!Parser) return;
    const parsed = new Parser().parseFromString(markup, "image/svg+xml");
    const root = parsed.documentElement;
    const rootName = String(root?.localName || root?.tagName || "").toLowerCase();
    if (!root || rootName === "parsererror" || rootName !== "svg") return;
    const node = typeof doc.importNode === "function" ? doc.importNode(root, true) : root;
    target.appendChild(node);
  }

  function rebind() {
    const env = buildEnv();
    for (const [name, el] of valueLabels) {
      const v = env[name];
      el.textContent =
        typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v ?? "");
    }
    if (!parsed.templateSvg) {
      if (lastFilled !== "") {
        lastFilled = "";
        paintSvg("");
      }
      return;
    }
    const filled = substitute(wrapSvgTemplate(parsed.templateSvg), env);
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
  container.appendChild(svgHost);

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
