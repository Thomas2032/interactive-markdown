/**
 * Interactive Markdown (IVM) — public library entry.
 */
export { evaluate, substitute } from "./expr.js";
export { parseIvm, splitIvmFences } from "./parse-ivm.js";
export { sanitizeSvg } from "./sanitize-svg.js";
export { mountIvm, resetNamespaces } from "./render.js";
export { renderDocument } from "./markdown.js";
