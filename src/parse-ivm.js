/**
 * Parse ```ivm fence body into controls + SVG template.
 * Interactive Markdown (IVM) dialect.
 *
 * Line forms (long names are canonical; short aliases also parse):
 *   @ns name
 *   @slider | @s  name: min..max = default [step=S] [deg|rad] ["Label"]
 *   @timer  | @t  name: min..max = default [speed=N] [step=S] [loop|noloop] [deg|rad] ["Label"]
 *   @input  | @i  name: "default" ["Label"]
 *   @toggle | @b  name: true|false ["Label"]
 *   @let    | @l  name = expression
 *   @calc         name = expression   (alias of @let; prefer @let in docs/generators)
 *   @svg [WxH]
 *   …markup…   (remainder of fence; use {{expr}} in attrs/text)
 *   @plot [WxH] [grid|nogrid]
 *   @axis x|y: min..max [step=S] ["Label"]
 *   @series [id] [stroke=#hex] [fill=#hex] [fillOpacity=N] [width=N] [label="Name"]
 *     y = expression                 (Cartesian; free var `x`)
 *     x = … / y = … / t = min..max   (parametric; free var `t`)
 *     r = … / theta = min..max       (polar; free var `theta`)
 *   @grid on|off
 *   @graph
 *   @animate [path=ortho|straight|curve] [quantity=N] [direction=forward|reverse] [speed=seconds]
 *   @node id: "Label" x=N y=N [kind=action|input|output|decision]
 *   @edge from -> to [from=right|left|top|bottom] [to=left|right|top|bottom]
 *
 * Defaults: step=1, timer loop=true, speed=30. Omitted "Label" → UI shows name.
 * `@svg 200x80` stores width/height so the renderer can wrap non-root markup.
 * `@plot` builds a chart; optional trailing `@svg` is overlay chrome in the plot viewBox.
 * `@plot` / `@svg` stay exclusive of `@graph`.
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
 *   units?: 'deg'|'rad',
 * }} Control
 * @typedef {"left"|"right"|"top"|"bottom"} GraphSide
 * @typedef {{ id: string, label: string, x: number, y: number, kind: string }} GraphNode
 * @typedef {{ from: string, to: string, fromSide?: GraphSide, toSide?: GraphSide }} GraphEdge
 * @typedef {{ path: string, quantity: number, direction: string, speed: number }} GraphMotion
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[], animated?: boolean, motion?: GraphMotion }} GraphModel
 * @typedef {{ min: number, max: number, step?: number, label?: string, scale?: 'linear'|'log'|'symlog', linthresh?: number }} PlotAxis
 * @typedef {{
 *   id?: string,
 *   label?: string,
 *   kind?: 'y'|'parametric'|'polar',
 *   expression?: string,
 *   xExpression?: string,
 *   yExpression?: string,
 *   rExpression?: string,
 *   tMin?: number,
 *   tMax?: number,
 *   stroke?: string,
 *   fill?: string,
 *   fillOpacity?: number,
 *   width?: number,
 * }} PlotSeries
 * @typedef {{
 *   width: number|null,
 *   height: number|null,
 *   grid: boolean,
 *   legend?: boolean,
 *   lockAspect?: boolean,
 *   x: PlotAxis|null,
 *   y: PlotAxis|null,
 *   series: PlotSeries[],
 * }} PlotModel
 * @typedef {{
 *   namespace: string|null,
 *   controls: Control[],
 *   templateSvg: string|null,
 *   svgWidth: number|null,
 *   svgHeight: number|null,
 *   graph: GraphModel|null,
 *   plot: PlotModel|null,
 *   errors: string[],
 * }} IvmBlock
 */

const NODE_KINDS = new Set(["action", "input", "output", "decision"]);

const KIND_ALIASES = Object.freeze({
  s: "slider",
  slider: "slider",
  t: "timer",
  timer: "timer",
  i: "input",
  input: "input",
  b: "toggle",
  toggle: "toggle",
  l: "let",
  let: "let",
  calc: "let",
});

/**
 * @param {string} line
 * @param {string[]} errors
 * @returns {GraphMotion}
 */
function readAnimate(line, errors) {
  /** @type {GraphMotion} */
  const motion = { path: "ortho", quantity: 1, direction: "forward", speed: 2.8 };
  const rest = line.replace(/^@animate\b/i, "").trim();
  if (!rest) return motion;
  for (const part of rest.split(/\s+/)) {
    const flag = part.match(/^(path|quantity|direction|speed)=(\S+)$/i);
    if (!flag) {
      errors.push(`@animate: unknown ${part}`);
      continue;
    }
    const key = flag[1].toLowerCase();
    const raw = flag[2];
    const value = raw.toLowerCase();
    if (key === "path") {
      if (value !== "ortho" && value !== "straight" && value !== "curve") {
        errors.push(`@animate: unknown path ${raw}`);
      } else motion.path = value;
    } else if (key === "quantity") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 12) errors.push("@animate: quantity must be 1..12");
      else motion.quantity = n;
    } else if (key === "direction") {
      if (value !== "forward" && value !== "reverse") errors.push(`@animate: unknown direction ${raw}`);
      else motion.direction = value;
    } else if (key === "speed") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0.2 || n > 30) errors.push("@animate: speed must be seconds from 0.2 to 30");
      else motion.speed = Math.round(n * 10) / 10;
    }
  }
  return motion;
}

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
  if (/\bdeg\b/i.test(rest)) out.units = "deg";
  else if (/\brad\b/i.test(rest)) out.units = "rad";
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
 * Parse min..max used by series parameter ranges.
 * @param {string} raw
 * @returns {[number, number] | null}
 */
function parseRange(raw) {
  const m = String(raw)
    .trim()
    .match(/^(-?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)\.\.(-?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
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
  /** @type {number|null} */
  let svgWidth = null;
  /** @type {number|null} */
  let svgHeight = null;
  /** @type {GraphModel | null} */
  let graph = null;
  /** @type {PlotModel | null} */
  let plot = null;

  const lines = String(body).replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line || line.startsWith("#")) {
      i++;
      continue;
    }

    // @plot [WxH] [grid|nogrid] [legend|nolegend] [lockAspect]
    if (/^@plot\b/i.test(line)) {
      if (plot) {
        errors.push("Duplicate @plot");
        i++;
        continue;
      }
      if (graph) {
        errors.push("@plot cannot mix with @graph");
        i++;
        continue;
      }
      if (templateSvg) {
        errors.push("@plot must come before @svg (overlay follows the plot)");
        i++;
        continue;
      }
      plot = {
        width: null,
        height: null,
        grid: true,
        legend: true,
        lockAspect: false,
        x: null,
        y: null,
        series: [],
      };
      const rest = line.replace(/^@plot\b/i, "").trim();
      if (rest) {
        const size = rest.match(/^(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\b/);
        let flags = rest;
        if (size) {
          plot.width = Number(size[1]);
          plot.height = Number(size[2]);
          flags = rest.slice(size[0].length).trim();
        }
        if (/\bnogrid\b/i.test(flags)) plot.grid = false;
        else if (/\bgrid\b/i.test(flags)) plot.grid = true;
        if (/\bnolegend\b/i.test(flags)) plot.legend = false;
        else if (/\blegend\b/i.test(flags)) plot.legend = true;
        if (/\b(lockAspect|aspect)\b/i.test(flags)) plot.lockAspect = true;
        const leftover = flags
          .replace(/\b(nogrid|grid|nolegend|legend|lockAspect|aspect)\b/gi, "")
          .trim();
        if (leftover) errors.push(`@plot: unknown ${leftover}`);
      }
      i++;
      continue;
    }

    // @grid on|off
    if (/^@grid\b/i.test(line)) {
      if (!plot) {
        errors.push("@grid is only valid after @plot");
        i++;
        continue;
      }
      const rest = line.replace(/^@grid\b/i, "").trim().toLowerCase();
      if (rest === "off" || rest === "false" || rest === "0" || rest === "nogrid") plot.grid = false;
      else if (rest === "on" || rest === "true" || rest === "1" || rest === "grid" || rest === "") plot.grid = true;
      else errors.push(`@grid: expected on|off, got ${rest}`);
      i++;
      continue;
    }

    // @axis x|y: min..max [step=S] [scale=linear|log|symlog] [linthresh=N] ["Label"]
    {
      const m = line.match(/^@axis\s+([xy])\s*:\s*(.+)$/i);
      if (m) {
        if (!plot) {
          errors.push(`@axis ${m[1]}: only valid after @plot`);
          i++;
          continue;
        }
        const which = m[1].toLowerCase();
        const [rest, label] = takeLabel(m[2]);
        const rm = rest.match(
          /^(-?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)\.\.(-?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)\s*(.*)$/
        );
        if (!rm) {
          errors.push(`@axis ${which}: expected min..max [step=S] [scale=…]`);
          i++;
          continue;
        }
        const min = Number(rm[1]);
        const max = Number(rm[2]);
        const flags = parseFlags(rm[3] || "");
        const step = flags.step !== undefined ? Number(flags.step) : undefined;
        /** @type {PlotAxis} */
        const axis = {
          min: Number.isFinite(min) ? min : 0,
          max: Number.isFinite(max) ? max : 1,
        };
        if (step !== undefined && Number.isFinite(step) && step > 0) axis.step = step;
        if (label || flags.label) axis.label = label || flags.label;
        const scaleRaw = flags.scale !== undefined ? String(flags.scale).toLowerCase() : "linear";
        if (scaleRaw === "linear" || scaleRaw === "log" || scaleRaw === "symlog") {
          axis.scale = scaleRaw;
        } else {
          errors.push(`@axis ${which}: unknown scale ${flags.scale}`);
          axis.scale = "linear";
        }
        if (flags.linthresh !== undefined) {
          const lt = Number(flags.linthresh);
          if (Number.isFinite(lt) && lt > 0) axis.linthresh = lt;
          else errors.push(`@axis ${which}: linthresh must be > 0`);
        }
        if (which === "x") {
          if (plot.x) errors.push("Duplicate @axis x");
          plot.x = axis;
        } else {
          if (plot.y) errors.push("Duplicate @axis y");
          plot.y = axis;
        }
        i++;
        continue;
      }
    }

    // @series [id] [flags] [y|x|r = expr] — continuations: y=/x=/r=/t=/theta=
    if (/^@series\b/i.test(line)) {
      if (!plot) {
        errors.push("@series is only valid after @plot");
        i++;
        continue;
      }
      const rest = line.replace(/^@series\b/i, "").trim();
      /** @type {PlotSeries} */
      const series = {};
      let tail = rest;
      const idMatch = tail.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/);
      const reservedIds = /^(stroke|fill|fillOpacity|width|label|y|x|r|t|theta)$/i;
      if (idMatch && !reservedIds.test(idMatch[1])) {
        series.id = idMatch[1];
        tail = tail.slice(idMatch[0].length).trim();
      }
      // Inline assignment on the same line (y= / x= / r=) — take the rightmost form
      const inline = tail.match(/\b(y|x|r)\s*=\s*(.+)$/i);
      if (inline) {
        const key = inline[1].toLowerCase();
        const expr = inline[2].trim();
        if (key === "y") series.expression = expr;
        else if (key === "x") series.xExpression = expr;
        else series.rExpression = expr;
        tail = tail.slice(0, inline.index).trim();
      }
      const [tailNoLabel, inlineLabel] = takeLabel(tail);
      const flags = parseFlags(tailNoLabel);
      if (inlineLabel || flags.label) series.label = inlineLabel || flags.label;
      if (flags.stroke) series.stroke = flags.stroke;
      if (flags.fill) series.fill = flags.fill;
      if (flags.fillOpacity !== undefined) {
        const n = Number(flags.fillOpacity);
        if (Number.isFinite(n)) series.fillOpacity = n;
      }
      if (flags.width !== undefined) {
        const n = Number(flags.width);
        if (Number.isFinite(n)) series.width = n;
      }
      if (flags.t !== undefined) {
        const tr = parseRange(flags.t);
        if (tr) {
          series.tMin = tr[0];
          series.tMax = tr[1];
        } else errors.push(`@series: bad t range ${flags.t}`);
      }
      if (flags.theta !== undefined) {
        const tr = parseRange(flags.theta);
        if (tr) {
          series.tMin = tr[0];
          series.tMax = tr[1];
        } else errors.push(`@series: bad theta range ${flags.theta}`);
      }
      // Continuations on following lines
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (!next.trim() || next.trim().startsWith("#")) {
          j++;
          continue;
        }
        const cont = next.match(/^\s*(y|x|r|t|theta)\s*=\s*(.+)$/i);
        if (!cont) break;
        const key = cont[1].toLowerCase();
        const value = cont[2].trim();
        if (key === "y") series.expression = value;
        else if (key === "x") series.xExpression = value;
        else if (key === "r") series.rExpression = value;
        else if (key === "t" || key === "theta") {
          const tr = parseRange(value);
          if (tr) {
            series.tMin = tr[0];
            series.tMax = tr[1];
          } else errors.push(`@series: bad ${key} range ${value}`);
        }
        i = j;
        j++;
      }
      // Infer kind
      if (series.rExpression) {
        series.kind = "polar";
        if (series.tMin === undefined) series.tMin = 0;
        if (series.tMax === undefined) series.tMax = Math.PI * 2;
        if (!series.rExpression) errors.push("@series: polar needs r = expression");
      } else if (series.xExpression && (series.expression || series.yExpression)) {
        series.kind = "parametric";
        if (series.expression && !series.yExpression) {
          series.yExpression = series.expression;
          delete series.expression;
        }
        if (series.tMin === undefined) series.tMin = 0;
        if (series.tMax === undefined) series.tMax = Math.PI * 2;
      } else if (series.expression) {
        series.kind = "y";
      } else if (series.xExpression && !series.expression) {
        errors.push("@series: parametric needs both x = and y =");
      } else {
        errors.push("@series: expected y = expression (or x=/y= parametric, or r= polar)");
      }
      if (series.kind) plot.series.push(series);
      i++;
      continue;
    }

    // @graph — following @node / @edge lines are an editable graph
    if (/^@graph$/i.test(line)) {
      if (plot) errors.push("@graph cannot mix with @plot");
      else if (graph) errors.push("Duplicate @graph");
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

    // @edge from -> to [from=side] [to=side]
    {
      const m = line.match(
        /^@edge\s+([A-Za-z_][A-Za-z0-9_]*)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s+([^\s].*))?$/i
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
        /** @type {GraphEdge} */
        const edge = { from, to };
        const tail = (m[3] || "").trim();
        let sideError = false;
        if (tail) {
          for (const part of tail.split(/\s+/)) {
            const flag = part.match(/^(from|to)=(left|right|top|bottom)$/i);
            if (!flag) {
              errors.push(`@edge ${from} -> ${to}: unknown ${part}`);
              sideError = true;
              continue;
            }
            const side = /** @type {GraphSide} */ (flag[2].toLowerCase());
            if (flag[1].toLowerCase() === "from") edge.fromSide = side;
            else edge.toSide = side;
          }
        }
        if (edge.fromSide === "right") delete edge.fromSide;
        if (edge.toSide === "left") delete edge.toSide;
        if (!sideError) graph.edges.push(edge);
        i++;
        continue;
      }
    }

    if (/^@animate\b/i.test(line)) {
      if (!graph) errors.push("@animate is only valid after @graph");
      else if (graph.animated) errors.push("Duplicate @animate");
      else {
        graph.animated = true;
        graph.motion = readAnimate(line, errors);
      }
      i++;
      continue;
    }

    if (graph) {
      errors.push(`Not allowed inside @graph: ${line}`);
      i++;
      continue;
    }

    // @svg [WxH] — remainder of fence is SVG markup (overlay when @plot is set)
    if (/^@svg\b/i.test(line)) {
      const after = line.replace(/^@svg\b/i, "").trim();
      const size = after.match(/^(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*$/);
      if (size) {
        svgWidth = Number(size[1]);
        svgHeight = Number(size[2]);
      } else if (after) {
        // Inline markup on the same line (legacy): treat as template start
        const parts = [after];
        i++;
        while (i < lines.length) {
          parts.push(lines[i]);
          i++;
        }
        templateSvg = parts.join("\n").replace(/^\n+/, "").replace(/\n+$/, "\n");
        break;
      }
      const parts = [];
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

    // @let / @l / @calc name = expression
    {
      const m = line.match(/^@(let|l|calc)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/i);
      if (m) {
        controls.push({ kind: "let", name: m[2], expression: m[3].trim() });
        i++;
        continue;
      }
    }

    // @slider|@s|@timer|@t name: min..max = default …
    {
      const m = line.match(/^@(slider|s|timer|t)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/i);
      if (m) {
        const kind = KIND_ALIASES[m[1].toLowerCase()];
        const name = m[2];
        const [rest, label] = takeLabel(m[3]);
        const rm = rest.match(
          /^(-?[0-9]*\.?[0-9]+)\.\.(-?[0-9]*\.?[0-9]+)\s*(?:=\s*(-?[0-9]*\.?[0-9]+))?\s*(.*)$/
        );
        if (!rm) {
          errors.push(`@${kind} ${name}: expected min..max [= default]`);
          i++;
          continue;
        }
        const range = /** @type {[number, number]} */ ([Number(rm[1]), Number(rm[2])]);
        const def = rm[3] !== undefined ? Number(rm[3]) : range[0];
        const flags = parseFlags(rm[4] || "");
        const step = flags.step !== undefined ? Number(flags.step) : 1;
        /** @type {Control} */
        const ctrl = {
          kind,
          name,
          range,
          step: Number.isFinite(step) ? step : 1,
          default: Number.isFinite(def) ? def : range[0],
          label: label || flags.label || undefined,
        };
        if (flags.units === "deg" || flags.units === "rad") {
          ctrl.units = /** @type {'deg'|'rad'} */ (flags.units);
        }
        if (kind === "timer") {
          const speed = flags.speed !== undefined ? Number(flags.speed) : 30;
          ctrl.speed = Number.isFinite(speed) && speed > 0 ? speed : 30;
          ctrl.loop = flags.loop === undefined ? true : parseBool(flags.loop, true);
        }
        controls.push(ctrl);
        i++;
        continue;
      }
    }

    // @input|@i name: "default" "Label"
    {
      const m = line.match(/^@(input|i)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.+)$/i);
      if (m) {
        const name = m[2];
        const [rest, label] = takeLabel(m[3]);
        controls.push({
          kind: "input",
          name,
          default: unquote(rest) ?? "",
          label: label || undefined,
        });
        i++;
        continue;
      }
    }

    // @toggle|@b name: true|false "Label"
    {
      const m = line.match(/^@(toggle|b)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.+)$/i);
      if (m) {
        const name = m[2];
        const [rest, label] = takeLabel(m[3]);
        controls.push({
          kind: "toggle",
          name,
          default: parseBool(rest, false),
          label: label || undefined,
        });
        i++;
        continue;
      }
    }

    errors.push(`Unrecognized line: ${line}`);
    i++;
  }

  return { namespace, controls, templateSvg, svgWidth, svgHeight, graph, plot, errors };
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
