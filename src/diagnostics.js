/**
 * Structured diagnostics for Interactive Markdown fences.
 * Used by the editor, soft-error UI strings, and `ivm check` CLI.
 */

import { evaluate, FUNCTION_NAMES, suggestName } from "./expr.js";
import { parseIvm, splitIvmFences } from "./parse-ivm.js";

/** @typedef {{
 *   file?: string|null,
 *   fence?: number|null,
 *   line?: number|null,
 *   severity: 'error'|'warning',
 *   code: string,
 *   message: string,
 *   hint?: string|null,
 * }} Diagnostic */

const DIRECTIVES = [
  "ns",
  "slider",
  "timer",
  "input",
  "toggle",
  "let",
  "calc",
  "fn",
  "angle",
  "phase",
  "svg",
  "plot",
  "axis",
  "series",
  "grid",
  "graph",
  "node",
  "edge",
  "animate",
  "s",
  "t",
  "i",
  "b",
  "l",
  "f",
  "mode",
];

const TRIG_CALL =
  /\b(sin|cos|tan)\s*\(\s*(-?\d+(?:\.\d+)?)\s*([,)])/gi;

/**
 * @param {string} name
 * @returns {string|null}
 */
export function suggestDirective(name) {
  const key = String(name || "")
    .replace(/^@/, "")
    .toLowerCase();
  if (!key) return null;
  if (DIRECTIVES.includes(key)) return null;
  const hit = suggestName(key, DIRECTIVES);
  return hit ? `@${hit}` : null;
}

/**
 * Format a diagnostic as a single human line.
 * @param {Diagnostic} d
 */
export function formatDiagnostic(d) {
  const parts = [];
  if (d.file) parts.push(d.file);
  if (d.fence != null) parts.push(`fence ${d.fence}`);
  if (d.line != null) parts.push(`line ${d.line}`);
  const loc = parts.length ? parts.join(" ") + ": " : "";
  const hint = d.hint ? ` (hint: ${d.hint})` : "";
  return `${loc}${d.severity}: ${d.message}${hint}`;
}

/**
 * Scan fence body for sin(45)-style degree footguns when @angle deg is absent.
 * @param {string} body
 * @param {'deg'|'rad'|null} angleMode
 * @returns {Diagnostic[]}
 */
export function scanAngleFootguns(body, angleMode) {
  /** @type {Diagnostic[]} */
  const out = [];
  if (angleMode === "deg") return out;
  const lines = String(body).replace(/\r\n/g, "\n").split("\n");
  let inSvg = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (/^@svg\b/i.test(line)) {
      inSvg = true;
      // Still scan {{expr}} inside SVG below
    }
    // Only expression-bearing contexts (skip prose inside SVG markup except {{…}})
    let hay = "";
    if (/^@(let|l|calc|fn|f)\b/i.test(line)) hay = line;
    else if (/^@(series)\b/i.test(line) || /^\s*(y|x|r)\s*=/.test(raw)) hay = line;
    else if (inSvg) {
      const parts = [];
      const re = /\{\{([^{}]+)\}\}/g;
      let mm;
      while ((mm = re.exec(raw))) parts.push(mm[1]);
      hay = parts.join(" ");
    } else {
      continue;
    }
    if (!hay) continue;
    TRIG_CALL.lastIndex = 0;
    let m;
    while ((m = TRIG_CALL.exec(hay))) {
      const arg = Number(m[2]);
      if (!Number.isFinite(arg)) continue;
      if (arg === 0 || arg === 1 || arg === -1) continue;
      if (Math.abs(arg) < 2) continue;
      const looksLikeDeg =
        Math.abs(arg) >= 2 &&
        (Number.isInteger(arg) || Math.abs(arg - Math.round(arg)) < 1e-9);
      if (!looksLikeDeg) continue;
      out.push({
        line: i + 1,
        severity: "warning",
        code: "angle-mode",
        message: `${m[1]}(${m[2]}) looks like degrees, but this fence uses radians (default)`,
        hint: "add `@angle deg`, or use sind/cosd/tand, or pass radians (e.g. pi/4)",
      });
    }
  }
  return out;
}

/**
 * Try evaluating @let / @fn / @series expressions with a stub env; soft-collect errors.
 * @param {import('./parse-ivm.js').IvmBlock | ReturnType<typeof parseIvm>} parsed
 * @returns {Diagnostic[]}
 */
export function checkExpressions(parsed) {
  /** @type {Diagnostic[]} */
  const out = [];
  /** @type {Record<string, unknown>} */
  const env = Object.create(null);
  env.x = 0;
  env.t = 0;
  env.theta = 0;
  env._ = 0;
  env.i = 0;
  env.acc = 0;
  for (const c of parsed.controls || []) {
    if (c.name) {
      if (c.kind === "input") env[c.name] = String(c.default ?? "");
      else if (c.kind === "toggle") env[c.name] = Boolean(c.default);
      else if (c.kind === "let") {
        /* evaluated below in order */
      } else env[c.name] = Number(c.default ?? 0);
    }
  }

  /** @type {Record<string, { params: string[], expression: string }>} */
  const functions = Object.create(null);
  for (const fn of parsed.fns || []) {
    functions[fn.name] = { params: fn.params, expression: fn.expression };
  }

  const exprOpts = {
    angleMode: parsed.angleMode,
    functions,
    phases: parsed.phases || [],
  };

  for (const fn of parsed.fns || []) {
    try {
      /** @type {Record<string, unknown>} */
      const local = Object.create(null);
      Object.assign(local, env);
      for (const p of fn.params) local[p] = 0;
      evaluate(fn.expression, local, exprOpts);
    } catch (err) {
      const msg = /** @type {Error} */ (err).message || String(err);
      out.push({
        line: null,
        severity: "error",
        code: "expr-fn",
        message: `@fn ${fn.name}: ${msg}`,
        hint: hintForExprMessage(msg),
      });
    }
  }

  for (const c of parsed.controls || []) {
    if (c.kind !== "let" || !c.expression) continue;
    try {
      const v = evaluate(c.expression, env, exprOpts);
      if (c.name) env[c.name] = v;
    } catch (err) {
      const msg = /** @type {Error} */ (err).message || String(err);
      out.push({
        line: null,
        severity: "error",
        code: "expr-let",
        message: `@let ${c.name}: ${msg}`,
        hint: hintForExprMessage(msg),
      });
    }
  }

  if (parsed.plot && Array.isArray(parsed.plot.series)) {
    for (const series of parsed.plot.series) {
      const label = series.label || series.id || "(unnamed)";
      const exprs = [];
      if (series.expression) exprs.push(["y", series.expression]);
      if (series.xExpression) exprs.push(["x", series.xExpression]);
      if (series.yExpression) exprs.push(["y", series.yExpression]);
      if (series.rExpression) exprs.push(["r", series.rExpression]);
      for (const [which, source] of exprs) {
        try {
          evaluate(source, env, exprOpts);
        } catch (err) {
          const msg = /** @type {Error} */ (err).message || String(err);
          out.push({
            line: null,
            severity: "error",
            code: "expr-series",
            message: `@series ${label} (${which}): ${msg}`,
            hint: hintForExprMessage(msg),
          });
        }
      }
    }
  }

  // SVG {{expr}} placeholders — light scan
  if (parsed.templateSvg) {
    const re = /\{\{([^{}]+)\}\}/g;
    let m;
    while ((m = re.exec(parsed.templateSvg))) {
      const source = m[1].trim();
      if (!source) continue;
      try {
        evaluate(source, env, exprOpts);
      } catch (err) {
        const msg = /** @type {Error} */ (err).message || String(err);
        out.push({
          line: null,
          severity: "error",
          code: "expr-svg",
          message: `{{${source}}}: ${msg}`,
          hint: hintForExprMessage(msg),
        });
      }
    }
  }

  return out;
}

/**
 * @param {string} msg
 * @returns {string|null}
 */
function hintForExprMessage(msg) {
  const unknownFn = msg.match(/Unknown function:\s*([A-Za-z_][A-Za-z0-9_]*)/i);
  if (unknownFn) {
    const sug = suggestName(unknownFn[1], FUNCTION_NAMES);
    return sug ? `did you mean \`${sug}\`?` : "check the whitelist function list (sin, cos, abs, …)";
  }
  const unknownId = msg.match(/Unknown identifier:\s*([A-Za-z_][A-Za-z0-9_]*)/i);
  if (unknownId) {
    return `define \`@slider\`/\`@let\` named \`${unknownId[1]}\`, or use a built-in constant (pi, e, tau)`;
  }
  return null;
}

/**
 * Attach line numbers to parse diagnostics that lack them by scanning the body.
 * @param {string} body
 * @param {Diagnostic[]} diags
 */
function attachMissingLines(body, diags) {
  const lines = String(body).replace(/\r\n/g, "\n").split("\n");
  for (const d of diags) {
    if (d.line != null) continue;
    const needle = d.message.match(/@series\s+(\S+)/i)?.[1]
      || d.message.match(/@fn\s+(\S+)/i)?.[1]
      || d.message.match(/@let\s+(\S+)/i)?.[1]
      || null;
    if (!needle || needle === "(unnamed)") continue;
    const name = needle.replace(/:$/, "");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(name)) {
        d.line = i + 1;
        break;
      }
    }
  }
}

/**
 * Diagnose a single fence body.
 * @param {string} body
 * @param {{ file?: string|null, fence?: number|null }} [meta]
 */
export function diagnoseFence(body, meta = {}) {
  const parsed = parseIvm(body);
  /** @type {Diagnostic[]} */
  const diagnostics = [];

  // From parser (already line-tagged when available)
  for (const d of parsed.diagnostics || []) {
    diagnostics.push({
      file: meta.file ?? null,
      fence: meta.fence ?? null,
      line: d.line ?? null,
      severity: d.severity || "error",
      code: d.code || "parse",
      message: d.message,
      hint: d.hint ?? null,
    });
  }

  // Legacy string errors without structured entry (shouldn't happen after parse update)
  if ((!parsed.diagnostics || !parsed.diagnostics.length) && parsed.errors?.length) {
    for (const text of parsed.errors) {
      const m = String(text).match(/^line\s+(\d+):\s*(.*?)(?:\s*\(hint:\s*(.*)\))?$/i);
      diagnostics.push({
        file: meta.file ?? null,
        fence: meta.fence ?? null,
        line: m ? Number(m[1]) : null,
        severity: "error",
        code: "parse",
        message: m ? m[2] : String(text),
        hint: m && m[3] ? m[3] : null,
      });
    }
  }

  diagnostics.push(
    ...scanAngleFootguns(body, parsed.angleMode).map((d) => ({
      ...d,
      file: meta.file ?? null,
      fence: meta.fence ?? null,
    }))
  );

  diagnostics.push(
    ...checkExpressions(parsed).map((d) => ({
      ...d,
      file: meta.file ?? null,
      fence: meta.fence ?? null,
    }))
  );

  attachMissingLines(body, diagnostics);

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;
  return { parsed, diagnostics, errorCount, warningCount };
}

/**
 * Diagnose every ```ivm fence in a markdown document.
 * @param {string} markdown
 * @param {{ file?: string|null }} [meta]
 */
export function diagnoseMarkdown(markdown, meta = {}) {
  const segments = splitIvmFences(markdown);
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  let errorCount = 0;
  let warningCount = 0;
  let fenceIndex = 0;
  /** @type {ReturnType<typeof diagnoseFence>[]} */
  const fences = [];

  for (const seg of segments) {
    if (seg.type !== "ivm") continue;
    const result = diagnoseFence(seg.content, {
      file: meta.file ?? null,
      fence: fenceIndex,
    });
    // Convert fence-local lines to document lines when possible
    const bodyStartInFence = 1; // first line of fence body
    const prefix = markdown.slice(0, seg.start);
    const fenceHeaderLine = prefix.split("\n").length; // line of ```ivm
    for (const d of result.diagnostics) {
      if (d.line != null) {
        d.line = fenceHeaderLine + d.line; // body line 1 → right after ```ivm
      }
      diagnostics.push(d);
    }
    errorCount += result.errorCount;
    warningCount += result.warningCount;
    fences.push(result);
    fenceIndex++;
    void bodyStartInFence;
  }

  return { diagnostics, errorCount, warningCount, fenceCount: fenceIndex, fences };
}

export { DIRECTIVES, FUNCTION_NAMES };
