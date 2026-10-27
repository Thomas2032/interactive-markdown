/**
 * Markdown pipeline: render MD text; mount ```ivm fences as live widgets.
 */

import { splitIvmFences } from "./parse-ivm.js";
import { mountIvm, resetNamespaces } from "./render.js";

/**
 * Resolve a marked-compatible parser ({ parse(md) => html }).
 * Prefers an explicit override, then globalThis.marked (CDN), then optional inject.
 * @param {{ parse: (md: string) => string } | null | undefined} override
 */
function resolveMarked(override) {
  if (override && typeof override.parse === "function") return override;
  const g = globalThis.marked;
  if (g && typeof g.parse === "function") return g;
  throw new Error(
    "marked library not loaded — include marked via CDN or pass { marked } to renderDocument"
  );
}

/**
 * Render full Interactive Markdown into a preview element.
 * @param {HTMLElement} previewEl
 * @param {string} source
 * @param {{ marked?: { parse: (md: string) => string }, envStore?: Map<string, Record<string, unknown>>, namespaces?: Map<string, Record<string, unknown>> }} [options]
 * @returns {{ destroy: () => void }}
 */
export function renderDocument(previewEl, source, options = {}) {
  if (!options.namespaces && !options.envStore) resetNamespaces();
  previewEl.innerHTML = "";

  const doc = previewEl.ownerDocument || globalThis.document;
  /** @type {Array<{ destroy: () => void }>} */
  const mounts = [];
  const segments = splitIvmFences(source);
  const marked = resolveMarked(options.marked);

  if (typeof marked.setOptions === "function") {
    marked.setOptions({ gfm: true, breaks: false });
  }

  let ivmIndex = 0;
  for (const seg of segments) {
    if (seg.type === "text") {
      if (!seg.content.trim()) continue;
      const wrap = doc.createElement("div");
      wrap.className = "im-md";
      wrap.innerHTML = marked.parse(seg.content);
      previewEl.appendChild(wrap);
    } else if (seg.type === "ivm") {
      const fenceIndex = ivmIndex++;
      const host = doc.createElement("div");
      host.className = "im-ivm-host";
      previewEl.appendChild(host);
      mounts.push(
        mountIvm(host, seg.content, {
          envStore: options.envStore,
          envKey: options.envStore ? `ivm:${fenceIndex}` : undefined,
          namespaces: options.namespaces,
        })
      );
    }
  }

  return {
    destroy() {
      for (const m of mounts) m.destroy();
      previewEl.innerHTML = "";
    },
  };
}
