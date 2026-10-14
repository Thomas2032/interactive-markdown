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
 *   @graph
 *   @node id: "Label" x=N y=N [kind=action|input|output|decision]
 *   @edge from -> to
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
 * @typedef {{ id: string, label: string, x: number, y: number, kind: string }} GraphNode
 * @typedef {{ from: string, to: string }} GraphEdge
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[] }} GraphModel
 * @typedef {{
 *   namespace: string|null,
 *   controls: Control[],
 *   templateSvg: string|null,
 *   graph: GraphModel|null,
 *   errors: string[],
 * }} IvmBlock
 */

const NODE_KINDS = new Set(["action", "input", "output", "decision"]);

/**
 * Read a leading "quoted" or 'quoted' string. Supports backslash escapes.
 * @param {string} s
 * @returns {{ value: string, rest: string } | null}
 */
function parseQuotedPrefix(s) {
  const str = String(s).trimStart();
  const quote = str[0];
  if (quote !== '"' && quote !== "'") return null;
  let value = "";
  let i = 1;
  while (i < str.length) {
    if (str[i] === "\\" && i + 1 < str.length) {
      value += str[i + 1];
      i += 2;
      continue;
    }
    if (str[i] === quote) return { value, rest: str.slice(i + 1).trim() };
    value += str[i];
    i++;
  }
  return null;
}

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
  /** @type {GraphModel | null} */
  let graph = null;

  const lines = String(body).replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line || line.startsWith("#")) {
      i++;
      continue;
    }

    // @graph — following @node / @edge lines are an editable graph
    if (/^@graph$/i.test(line)) {
      if (graph) errors.push("Duplicate @graph");
      else graph = { nodes: [], edges: [] };
      i++;
      continue;
    }
    if (/^@graph\b/i.test(line)) {
      errors.push("@graph takes no arguments");
      i++;
      continue;
    }

    // @node id: "Label" x=N y=N kind=action
    {
      const m = line.match(/^@node\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]+)$/i);
      if (m) {
        const id = m[1];
        if (!graph) {
          errors.push(`@node ${id}: only valid after @graph`);
          i++;
          continue;
        }
        const quoted = parseQuotedPrefix(m[2]);
        if (!quoted) {
          errors.push(`@node ${id}: expected "Label" x=N y=N`);
          i++;
          continue;
        }
        if (graph.nodes.some((n) => n.id === id)) {
          errors.push(`@node ${id}: duplicate id`);
          i++;
          continue;
        }
        const flags = parseFlags(quoted.rest);
        const x = flags.x !== undefined ? Number(flags.x) : 48;
        const y = flags.y !== undefined ? Number(flags.y) : 48;
        const rawKind = flags.kind !== undefined ? String(flags.kind).toLowerCase() : "action";
        if (!NODE_KINDS.has(rawKind)) {
          errors.push(`@node ${id}: unknown kind ${flags.kind}`);
        }
        graph.nodes.push({
          id,
          label: quoted.value,
          x: Number.isFinite(x) ? x : 48,
          y: Number.isFinite(y) ? y : 48,
          kind: NODE_KINDS.has(rawKind) ? rawKind : "action",
        });
        i++;
        continue;
      }
    }

    // @edge from -> to
    {
      const m = line.match(
        /^@edge\s+([A-Za-z_][A-Za-z0-9_]*)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/i
      );
      if (m) {
        const from = m[1];
        const to = m[2];
        if (!graph) {
          errors.push(`@edge ${from} -> ${to}: only valid after @graph`);
          i++;
          continue;
        }
        if (from === to) {
          errors.push(`@edge ${from} -> ${to}: a node cannot connect to itself`);
          i++;
          continue;
        }
        if (!graph.nodes.some((n) => n.id === from) || !graph.nodes.some((n) => n.id === to)) {
          errors.push(`@edge ${from} -> ${to}: unknown node`);
          i++;
          continue;
        }
        if (graph.edges.some((e) => e.from === from && e.to === to)) {
          errors.push(`@edge ${from} -> ${to}: duplicate edge`);
          i++;
          continue;
        }
        graph.edges.push({ from, to });
        i++;
        continue;
      }
    }

    if (graph) {
      errors.push(`Not allowed inside @graph: ${line}`);
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

  return { namespace, controls, templateSvg, graph, errors };
}

/**
 * Replace the Nth ```ivm fence (0-based) with a new interior.
 * Indexes are computed from the current source, so earlier edits stay consistent.
 * @param {string} source
 * @param {number} fenceIndex
 * @param {string} body
 * @returns {string}
 */
export function replaceIvmFence(source, fenceIndex, body) {
  const src = String(source).replace(/\r\n/g, "\n");
  const ivm = splitIvmFences(src).filter((s) => s.type === "ivm");
  const seg = ivm[fenceIndex];
  if (!seg) return src;
  const interior = String(body).replace(/\s*$/, "\n");
  const next = "```ivm\n" + interior + "```";
  return src.slice(0, seg.start) + next + src.slice(seg.end);
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
