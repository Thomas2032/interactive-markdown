/**
 * Mount IVM controls and bind SVG templates to live state.
 */

import { evaluate, substitute } from "./expr.js";
import { parseIvm } from "./parse-ivm.js";
import { sanitizeSvg } from "./sanitize-svg.js";

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
 * @returns {{ destroy: () => void, getState: () => Record<string, unknown> }}
 */
export function mountIvm(container, fenceBody) {
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

  const controlsEl = doc.createElement("div");
  controlsEl.className = "im-controls";
  container.appendChild(controlsEl);

  const svgHost = doc.createElement("div");
  svgHost.className = "im-svg-host";
  container.appendChild(svgHost);

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

  function rebind() {
    const env = buildEnv();
    for (const [name, el] of valueLabels) {
      const v = env[name];
      el.textContent =
        typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v ?? "");
    }
    if (!parsed.templateSvg) {
      svgHost.innerHTML = "";
      return;
    }
    const filled = substitute(parsed.templateSvg, env);
    svgHost.innerHTML = sanitizeSvg(filled);
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
