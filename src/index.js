/**
 * Interactive Markdown (IVM) — public library entry.
 */
export { evaluate, substitute } from "./expr.js";
export { parseIvm, splitIvmFences } from "./parse-ivm.js";
export { sanitizeSvg } from "./sanitize-svg.js";
export { mountIvm, resetNamespaces } from "./render.js";
export { renderDocument } from "./markdown.js";
export { buildPlotSvg, normalizePlot } from "./plot.js";
export { diagnoseFence, diagnoseMarkdown, formatDiagnostic } from "./diagnostics.js";
export { completionsAt, attachAutocomplete } from "./autocomplete.js";
export { suggestName, FUNCTION_NAMES } from "./expr.js";
export { applyGraphLayout, normalizeLayoutName } from "./graph-layout.js";
