/**
 * Parse ```ivm fence body into controls + SVG template.
 * Interactive Markdown (IVM) dialect.
 *
 * Line forms:
 *   @ns name
 *   @slider name: min..max = default step=S "Label"
 *   @timer  name: min..max = default speed=N step=S loop|noloop "Label"
 *   @input  name: "default" "Label"
 *   @toggle name: true|false "Label"
 *   @let    name = expression
 *   @calc   name = expression   (alias of @let)
 *   @svg
 *   <svg>...</svg>   (remainder of fence; use {{expr}} in attrs/text)
 */

/**
 * @typedef {'slider'|'timer'|'input'|'toggle'|'let'} ControlKind
 * @typedef {{
 *   kind: ControlKind,
 *   name?: string,
 *   range?: [number, number],
 *   step?: number,
 *   default?: unknown,
 *   speed?: number,
 *   loop?: boolean,
 *   label?: string,
 *   expression?: string,
 * }} Control
 * @typedef {{
 *   namespace: string|null,
 *   controls: Control[],
 *   templateSvg: string|null,
 *   errors: string[],
 * }} IvmBlock
 */

function unquote(s) {
  if (s == null) return s;
  const t = String(s).trim();
  const m = t.match(/^"(.*)"$/) || t.match(/^'(.*)'$/);
  return m ? m[1] : t;
}

/** @returns {[string, string|undefined]} */
function takeLabel(rest) {
  const m = rest.match(/\s+"([^"]*)"\s*$/) || rest.match(/\s+'([^']*)'\s*$/);
  if (!m) return [rest.trim(), undefined];
  return [rest.slice(0, m.index).trim(), m[1]];
}

/** @param {string} rest */
function parseFlags(rest) {
  /** @type {Record<string, string>} */
  const out = {};
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(rest))) {
    out[m[1]] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
  }
  if (/\bnoloop\b/i.test(rest)) out.loop = "false";
  else if (/\bloop\b/i.test(rest) && out.loop === undefined) out.loop = "true";
  return out;
}

function parseBool(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const s = String(raw).trim().toLowerCase();
  if (s === "true" || s === "yes" || s === "1") return true;
  if (s === "false" || s === "no" || s === "0") return false;
  return fallback;
}

/**
 * @param {string} body  fence interior (no ```ivm wrapper)
 * @returns {IvmBlock}
 */
export function parseIvm(body) {
  const errors = [];
  /** @type {Control[]} */
  const controls = [];
  let namespace = null;
  let templateSvg = null;

  const lines = String(body).replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line || line.startsWith("#")) {
      i++;
      continue;
    }

    // @svg — remainder of fence is SVG markup
    if (/^@svg\b/i.test(line)) {
      const after = line.replace(/^@svg\b/i, "");
      const parts = [];
      if (after.trim()) parts.push(after.trim());
      i++;
      while (i < lines.length) {
        parts.push(lines[i]);
        i++;
      }
      templateSvg = parts.join("\n").replace(/^\n+/, "").replace(/\n+$/, "\n");
      break;
    }

    // @ns NAME
    {
      const m = line.match(/^@ns\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
      if (m) {
        namespace = m[1];
        i++;
        continue;
      }
    }

    // @let / @calc name = expression
    {
      const m = line.match(/^@(?:let|calc)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/i);
      if (m) {
        controls.push({ kind: "let", name: m[1], expression: m[2].trim() });
        i++;
        continue;
      }
    }

    // @slider name: min..max = default step=S "Label"
    {
      const m = line.match(/^@slider\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/i);
      if (m) {
        const name = m[1];
        const [rest, label] = takeLabel(m[2]);
        const rm = rest.match(
          /^(-?[0-9]*\.?[0-9]+)\.\.(-?[0-9]*\.?[0-9]+)\s*(?:=\s*(-?[0-9]*\.?[0-9]+))?\s*(.*)$/
        );
        if (!rm) {
          errors.push(`@slider ${name}: expected min..max [= default]`);
          i++;
          continue;
        }
        const range = /** @type {[number, number]} */ ([Number(rm[1]), Number(rm[2])]);
        const def = rm[3] !== undefined ? Number(rm[3]) : range[0];
        const flags = parseFlags(rm[4] || "");
        const step = flags.step !== undefined ? Number(flags.step) : 1;
        controls.push({
          kind: "slider",
          name,
          range,
          step: Number.isFinite(step) ? step : 1,
          default: Number.isFinite(def) ? def : range[0],
          label: label || flags.label,
        });
        i++;
        continue;
      }
    }

    // @timer name: min..max = default speed=N step=S loop|noloop "Label"
    {
      const m = line.match(/^@timer\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/i);
      if (m) {
        const name = m[1];
        const [rest, label] = takeLabel(m[2]);
        const rm = rest.match(
          /^(-?[0-9]*\.?[0-9]+)\.\.(-?[0-9]*\.?[0-9]+)\s*(?:=\s*(-?[0-9]*\.?[0-9]+))?\s*(.*)$/
        );
        if (!rm) {
          errors.push(`@timer ${name}: expected min..max [= default]`);
          i++;
          continue;
        }
        const range = /** @type {[number, number]} */ ([Number(rm[1]), Number(rm[2])]);
        const def = rm[3] !== undefined ? Number(rm[3]) : range[0];
        const flags = parseFlags(rm[4] || "");
        const step = flags.step !== undefined ? Number(flags.step) : 1;
        const speed = flags.speed !== undefined ? Number(flags.speed) : 30;
        const loop = flags.loop === undefined ? true : parseBool(flags.loop, true);
        controls.push({
          kind: "timer",
          name,
          range,
          step: Number.isFinite(step) ? step : 1,
          default: Number.isFinite(def) ? def : range[0],
          speed: Number.isFinite(speed) && speed > 0 ? speed : 30,
          loop,
          label: label || flags.label,
        });
        i++;
        continue;
      }
    }

    // @input name: "default" "Label"
    {
      const m = line.match(/^@input\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.+)$/i);
      if (m) {
        const name = m[1];
        const [rest, label] = takeLabel(m[2]);
        controls.push({ kind: "input", name, default: unquote(rest) ?? "", label });
        i++;
        continue;
      }
    }

    // @toggle name: true|false "Label"
    {
      const m = line.match(/^@toggle\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.+)$/i);
      if (m) {
        const name = m[1];
        const [rest, label] = takeLabel(m[2]);
        controls.push({
          kind: "toggle",
          name,
          default: parseBool(rest, false),
          label,
        });
        i++;
        continue;
      }
    }

    errors.push(`Unrecognized line: ${line}`);
    i++;
  }

  return { namespace, controls, templateSvg, errors };
}

/**
 * Split markdown into text and ```ivm fence segments.
 * @param {string} markdown
 * @returns {{ type: 'text'|'ivm', content: string, start: number, end: number }[]}
 */
export function splitIvmFences(markdown) {
  const src = String(markdown).replace(/\r\n/g, "\n");
  /** @type {{ type: 'text'|'ivm', content: string, start: number, end: number }[]} */
  const segments = [];
  const re = /^```ivm[ \t]*\n([\s\S]*?)^```[ \t]*$/gm;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) {
      const content = src.slice(last, m.index);
      if (content.trim().length) {
        segments.push({ type: "text", content, start: last, end: m.index });
      }
    }
    segments.push({
      type: "ivm",
      content: m[1],
      start: m.index,
      end: m.index + m[0].length,
    });
    last = m.index + m[0].length;
  }
  if (last < src.length) {
    const content = src.slice(last);
    if (content.trim().length) {
      segments.push({ type: "text", content, start: last, end: src.length });
    }
  }
  if (segments.length === 0) {
    segments.push({ type: "text", content: src, start: 0, end: src.length });
  }
  return segments;
}
