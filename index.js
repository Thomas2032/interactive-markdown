/**
 * Interactive Markdown (IVM) public API.
 *
 * Browser and Node (with a DOM) entry point. Pass a marked-compatible
 * parser to {@link renderDocument}, or load `marked` on `globalThis`.
 */

export { renderDocument } from "./src/markdown.js";
export { mountIvm, resetNamespaces } from "./src/render.js";
export { parseIvm, splitIvmFences } from "./src/parse-ivm.js";
export { evaluate, formatValue, substitute, CONSTANTS, FUNCTIONS } from "./src/expr.js";
export { sanitizeSvg, isSafeHref, SAFE_SVG_TAGS } from "./src/sanitize-svg.js";
