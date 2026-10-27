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
 *   @fn     | @f  name(param, …) = expression   (pure macro; no side effects)
 *   @angle  deg|rad                 (fence-wide trig mode; sin/cos use this unit)
 *   @phase  name: min..max          (named timeline span for inPhase/phaseT/phaseAt)
 *   @svg [WxH]
 *   …markup…   (remainder of fence; use {{expr}} in attrs/text)
 *   @plot [WxH] [grid|nogrid] [legend|nolegend|legend=pos] [lockAspect] [zoom]
 *   @axis x|y|y2: min..max [step=S] [scale=linear|log|symlog|categorical] [cats=A,B,C] ["Label"]
 *   @series [id] [kind=y|bar|scatter|parametric|polar] [axis=y|y2] [marker=circle|square|diamond]
 *           [size=N] [stroke=#hex] [fill=#hex] [fillOpacity=N] [width=N] [label="Name"]
 *     y = expression                 (Cartesian; free var `x`)
 *     x = … / y = … / t = min..max   (parametric; free var `t`)
 *     r = … / theta = min..max       (polar; free var `theta`)
 *     cats = A, B, C                 (bar categories)
 *     x = [..] / y = [..]           (scatter / bar value arrays)
 *   @legend pos=top-right|top-left|bottom-right|bottom-left
 *   @annotate x=N y=N "text" [dx=N] [dy=N] [axis=y|y2] [stroke=#hex]
 *   @grid on|off
 *   @scrub name duration=N [selector=.im-scrub]
 *   @graph
 *   @lane id: "Label" y=N [height=H] [fill=#hex]
 *   @group id: "Label"
 *   @animate [path=ortho|straight|curve] [quantity=N|name] [direction=forward|reverse] [speed=seconds|name]
 *   @node id: "Label" x=N y=N [kind=action|input|output|decision] [lane=id] [group=id]
 *   @edge from -> to [from=side] [to=side]
 *     sides: left|right|top|bottom|top-left|top-right|bottom-left|bottom-right
 *            (aliases: tl|tr|bl|br)
 *
 * Defaults: step=1, timer loop=true, speed=30. Omitted "Label" → UI shows name.
 * `@svg 200x80` stores width/height so the renderer can wrap non-root markup.
 * `@plot` builds a chart; optional trailing `@svg` is overlay chrome in the plot viewBox.
 * `@plot` / `@svg` stay exclusive of `@graph`. Controls (@slider/@timer/@let/…) may share a `@graph` fence.
 * `@animate` quantity/speed accept a number or a control name bound from the fence env.
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
 * @typedef {"left"|"right"|"top"|"bottom"|"top-left"|"top-right"|"bottom-left"|"bottom-right"} GraphSide
 * @typedef {{ id: string, label: string, x: number, y: number, kind: string, lane?: string, group?: string }} GraphNode
 * @typedef {{ from: string, to: string, fromSide?: GraphSide, toSide?: GraphSide }} GraphEdge
 * @typedef {{ path: string, quantity: number, direction: string, speed: number, quantityFrom?: string, speedFrom?: string }} GraphMotion
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[], animated?: boolean, motion?: GraphMotion, lanes?: GraphLane[], groups?: GraphGroup[] }} GraphModel
 * @typedef {{ min: number, max: number, step?: number, label?: string, scale?: 'linear'|'log'|'symlog'|'categorical', linthresh?: number, cats?: string[] }} PlotAxis
 * @typedef {{
 *   id?: string,
 *   label?: string,
 *   kind?: 'y'|'parametric'|'polar'|'bar'|'scatter',
 *   expression?: string,
 *   xExpression?: string,
 *   yExpression?: string,
 *   rExpression?: string,
 *   catsExpression?: string,
 *   tMin?: number,
 *   tMax?: number,
 *   stroke?: string,
 *   fill?: string,
 *   fillOpacity?: number,
 *   width?: number,
 *   marker?: 'circle'|'square'|'diamond',
 *   markerSize?: number,
 *   axis?: 'y'|'y2',
 * }} PlotSeries
 * @typedef {{
 *   x?: number,
 *   y?: number,
 *   text: string,
 *   dx?: number,
 *   dy?: number,
 *   stroke?: string,
 *   axis?: 'y'|'y2',
 * }} PlotAnnotation
 * @typedef {{
 *   width: number|null,
 *   height: number|null,
 *   grid: boolean,
 *   legend?: boolean,
 *   legendPos?: 'top-right'|'top-left'|'bottom-right'|'bottom-left',
 *   lockAspect?: boolean,
 *   zoom?: boolean,
 *   x: PlotAxis|null,
 *   y: PlotAxis|null,
 *   y2: PlotAxis|null,
 *   series: PlotSeries[],
 *   annotations?: PlotAnnotation[],
 * }} PlotModel
 * @typedef {{ id: string, label: string, y: number, height: number, fill?: string }} GraphLane
 * @typedef {{ id: string, label: string }} GraphGroup
 * @typedef {{ name: string, duration: number, selector: string }} IvmScrub
 * @typedef {{ name: string, params: string[], expression: string }} IvmFn
 * @typedef {{ name: string, min: number, max: number }} IvmPhase
 * @typedef {{
 *   namespace: string|null,
 *   controls: Control[],
 *   fns: IvmFn[],
 *   angleMode: 'deg'|'rad'|null,
 *   phases: IvmPhase[],
 *   templateSvg: string|null,
 *   svgWidth: number|null,
 *   svgHeight: number|null,
 *   graph: GraphModel|null,
 *   plot: PlotModel|null,
 *   scrub: IvmScrub|null,
 *   errors: string[],
 *   diagnostics: IvmDiagnostic[],
 * }} IvmBlock
 * @typedef {{
 *   line: number|null,
 *   severity: 'error'|'warning',
 *   code: string,
 *   message: string,
 *   hint?: string|null,
 * }} IvmDiagnostic
 */

const NODE_KINDS = new Set(["action", "input", "output", "decision"]);

const GRAPH_SIDE_ALIASES = Object.freeze({
  left: "left",
  right: "right",
  top: "top",
  bottom: "bottom",
  "top-left": "top-left",
  tl: "top-left",
  "top-right": "top-right",
  tr: "top-right",
  "bottom-left": "bottom-left",
  bl: "bottom-left",
  "bottom-right": "bottom-right",
  br: "bottom-right",
});

/**
 * @param {string} raw
 * @returns {GraphSide | null}
 */
function parseGraphSide(raw) {
  const key = String(raw || "").toLowerCase();
  return Object.prototype.hasOwnProperty.call(GRAPH_SIDE_ALIASES, key)
    ? /** @type {GraphSide} */ (GRAPH_SIDE_ALIASES[key])
    : null;
}


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

const DIRECTIVE_NAMES = [
  "ns", "slider", "timer", "input", "toggle", "let", "calc", "fn", "angle", "phase",
  "svg", "plot", "axis", "series", "grid", "legend", "annotate", "scrub",
  "graph", "lane", "group", "node", "edge", "animate",
  "s", "t", "i", "b", "l", "f", "mode",
];

/**
 * @param {string} name
 * @returns {string|null}
 */
function suggestDirectiveName(name) {
  const target = String(name || "").toLowerCase().replace(/^@/, "");
  if (!target || DIRECTIVE_NAMES.includes(target)) return null;
  let best = null;
  let bestScore = Infinity;
  for (const c of DIRECTIVE_NAMES) {
    const score = directiveEditDistance(target, c);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  const maxDist = target.length <= 4 ? 1 : 2;
  return bestScore <= maxDist ? best : null;
}

/** @param {string} a @param {string} b */
function directiveEditDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}


/**
 * @param {string} line
 * @param {(message: string, opts?: { hint?: string|null, code?: string }) => void} reportFn
 * @returns {GraphMotion}
 */
function readAnimate(line, reportFn) {
  /** @type {GraphMotion} */
  const motion = { path: "ortho", quantity: 1, direction: "forward", speed: 2.8 };
  const rest = line.replace(/^@animate\b/i, "").trim();
  if (!rest) return motion;
  for (const part of rest.split(/\s+/)) {
    const flag = part.match(/^(path|quantity|direction|speed)=(\S+)$/i);
    if (!flag) {
      reportFn(`@animate: unknown ${part}`, { code: "animate" });
      continue;
    }
    const key = flag[1].toLowerCase();
    const raw = flag[2];
    const value = raw.toLowerCase();
    if (key === "path") {
      if (value !== "ortho" && value !== "straight" && value !== "curve") {
        reportFn(`@animate: unknown path ${raw}`, {
          code: "animate",
          hint: "use path=ortho|straight|curve",
        });
      } else motion.path = value;
    } else if (key === "quantity") {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw) && Number.isNaN(Number(raw))) {
        motion.quantityFrom = raw;
      } else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 12) {
          reportFn("@animate: quantity must be 1..12 or a control name", { code: "animate" });
        } else motion.quantity = n;
      }
    } else if (key === "direction") {
      if (value !== "forward" && value !== "reverse") {
        reportFn(`@animate: unknown direction ${raw}`, {
          code: "animate",
          hint: "use direction=forward|reverse",
        });
      } else motion.direction = value;
    } else if (key === "speed") {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw) && Number.isNaN(Number(raw))) {
        motion.speedFrom = raw;
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0.2 || n > 30) {
          reportFn("@animate: speed must be seconds from 0.2 to 30 or a control name", {
            code: "animate",
          });
        } else motion.speed = Math.round(n * 10) / 10;
      }
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
  // Prefer a trailing quoted label (historical @slider … "Label").
  const end = rest.match(/\s+"([^"]*)"\s*$/) || rest.match(/\s+'([^']*)'\s*$/);
  if (end) return [rest.slice(0, end.index).trim(), end[1]];
  // Also allow mid-line quotes so attrs can follow, e.g.
  // @annotate x=1 y=55 "best month" dy=-14
  const mid = rest.match(/(?:^|\s)(?:"([^"]*)"|'([^']*)')(?=\s|$)/);
  if (!mid || mid.index === undefined) return [rest.trim(), undefined];
  const label = mid[1] !== undefined ? mid[1] : mid[2];
  const start = mid.index + (mid[0].startsWith(" ") || mid[0].startsWith("\t") ? 1 : 0);
  const before = rest.slice(0, start);
  const after = rest.slice(start + (mid[0].trimStart().length));
  return [(before + " " + after).replace(/\s+/g, " ").trim(), label];
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
  /** @type {IvmDiagnostic[]} */
  const diagnostics = [];

  /**
   * @param {number|null} lineNo 1-based fence line
   * @param {string} message
   * @param {{ hint?: string|null, code?: string, severity?: 'error'|'warning' }} [opts]
   */
  function report(lineNo, message, opts = {}) {
    const severity = opts.severity || "error";
    const hint = opts.hint || null;
    const code = opts.code || "parse";
    diagnostics.push({ line: lineNo, severity, code, message, hint });
    const loc = lineNo != null ? `line ${lineNo}: ` : "";
    const h = hint ? ` (hint: ${hint})` : "";
    errors.push(`${loc}${message}${h}`);
  }

  /** @type {Control[]} */
  const controls = [];
  /** @type {IvmFn[]} */
  const fns = [];
  /** @type {'deg'|'rad'|null} */
  let angleMode = null;
  /** @type {IvmPhase[]} */
  const phases = [];
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
  /** @type {IvmScrub | null} */
  let scrub = null;

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
        report(i + 1, "Duplicate @plot");
        i++;
        continue;
      }
      if (graph) {
        report(i + 1, "@plot cannot mix with @graph", {
          code: "mode-mix",
          hint: "use separate fences, or drop @graph",
        });
        i++;
        continue;
      }
      if (templateSvg) {
        report(i + 1, "@plot must come before @svg (overlay follows the plot)");
        i++;
        continue;
      }
      plot = {
        width: null,
        height: null,
        grid: true,
        legend: true,
        legendPos: "top-right",
        lockAspect: false,
        zoom: false,
        x: null,
        y: null,
        y2: null,
        series: [],
        annotations: [],
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
        if (/\bzoom\b/i.test(flags)) plot.zoom = true;
        const legendPosFlag = flags.match(/\blegend\s*=\s*(top-right|top-left|bottom-right|bottom-left)\b/i);
        if (legendPosFlag) {
          plot.legend = true;
          plot.legendPos = legendPosFlag[1].toLowerCase();
        }
        const leftover = flags
          .replace(/\blegend\s*=\s*(top-right|top-left|bottom-right|bottom-left)\b/gi, "")
          .replace(/\b(nogrid|grid|nolegend|legend|lockAspect|aspect|zoom)\b/gi, "")
          .trim();
        if (leftover) report(i + 1, `@plot: unknown ${leftover}`);
      }
      i++;
      continue;
    }

    // @grid on|off
    if (/^@grid\b/i.test(line)) {
      if (!plot) {
        report(i + 1, "@grid is only valid after @plot");
        i++;
        continue;
      }
      const rest = line.replace(/^@grid\b/i, "").trim().toLowerCase();
      if (rest === "off" || rest === "false" || rest === "0" || rest === "nogrid") plot.grid = false;
      else if (rest === "on" || rest === "true" || rest === "1" || rest === "grid" || rest === "") plot.grid = true;
      else report(i + 1, `@grid: expected on|off, got ${rest}`);
      i++;
      continue;
    }

    // @axis x|y|y2: min..max [step=S] [scale=…] [cats=…] ["Label"]
    {
      const m = line.match(/^@axis\s+(x|y2|y)\s*:\s*(.+)$/i);
      if (m) {
        if (!plot) {
          report(i + 1, `@axis ${m[1]}: only valid after @plot`);
          i++;
          continue;
        }
        const which = m[1].toLowerCase();
        const [rest, label] = takeLabel(m[2]);
        const rm = rest.match(
          /^(-?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)\.\.(-?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)\s*(.*)$/
        );
        let min = 0;
        let max = 1;
        let flagSrc = rest;
        if (rm) {
          min = Number(rm[1]);
          max = Number(rm[2]);
          flagSrc = rm[3] || "";
        } else if (!/\bcats\s*=/i.test(rest) && !/\bscale\s*=\s*categorical\b/i.test(rest)) {
          report(i + 1, `@axis ${which}: expected min..max [step=S] [scale=…]`);
          i++;
          continue;
        }
        const flags = parseFlags(flagSrc);
        const step = flags.step !== undefined ? Number(flags.step) : undefined;
        /** @type {PlotAxis} */
        const axis = {
          min: Number.isFinite(min) ? min : 0,
          max: Number.isFinite(max) ? max : 1,
        };
        if (step !== undefined && Number.isFinite(step) && step > 0) axis.step = step;
        if (label || flags.label) axis.label = label || flags.label;
        const scaleRaw = flags.scale !== undefined ? String(flags.scale).toLowerCase() : "linear";
        if (scaleRaw === "linear" || scaleRaw === "log" || scaleRaw === "symlog" || scaleRaw === "categorical") {
          axis.scale = scaleRaw;
        } else {
          report(i + 1, `@axis ${which}: unknown scale ${flags.scale}`, {
            code: "axis-scale",
            hint: "scale=linear|log|symlog|categorical",
          });
          axis.scale = "linear";
        }
        if (flags.linthresh !== undefined) {
          const lt = Number(flags.linthresh);
          if (Number.isFinite(lt) && lt > 0) axis.linthresh = lt;
          else report(i + 1, `@axis ${which}: linthresh must be > 0`);
        }
        if (flags.cats !== undefined) {
          axis.cats = String(flags.cats)
            .split(/\s*,\s*/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (!axis.scale || axis.scale === "linear") axis.scale = "categorical";
          if (axis.cats.length) {
            axis.min = -0.5;
            axis.max = axis.cats.length - 0.5;
            if (axis.step == null) axis.step = 1;
          }
        }
        if (which === "x") {
          if (plot.x) report(i + 1, "Duplicate @axis x");
          plot.x = axis;
        } else if (which === "y2") {
          if (plot.y2) report(i + 1, "Duplicate @axis y2");
          plot.y2 = axis;
        } else {
          if (plot.y) report(i + 1, "Duplicate @axis y");
          plot.y = axis;
        }
        i++;
        continue;
      }
    }

    // @series [id] [flags] [y|x|r = expr] — continuations: y=/x=/r=/t=/theta=
    if (/^@series\b/i.test(line)) {
      if (!plot) {
        report(i + 1, "@series is only valid after @plot");
        i++;
        continue;
      }
      const rest = line.replace(/^@series\b/i, "").trim();
      /** @type {PlotSeries} */
      const series = {};
      let tail = rest;
      const idMatch = tail.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/);
      const reservedIds = /^(stroke|fill|fillOpacity|width|label|kind|axis|marker|size|y|x|r|t|theta|cats)$/i;
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
      if (flags.kind !== undefined) {
        const k = String(flags.kind).toLowerCase();
        if (k === "y" || k === "bar" || k === "scatter" || k === "parametric" || k === "polar") {
          series.kind = k === "y" ? "y" : k;
        } else {
          report(i + 1, `@series: unknown kind ${flags.kind}`, {
            code: "series-kind",
            hint: "kind=y|bar|scatter|parametric|polar",
          });
        }
      }
      if (flags.axis !== undefined) {
        const a = String(flags.axis).toLowerCase();
        if (a === "y" || a === "y2") series.axis = a;
        else report(i + 1, `@series: axis must be y|y2`, { code: "series-axis" });
      }
      if (flags.marker !== undefined) {
        const mk = String(flags.marker).toLowerCase();
        if (mk === "circle" || mk === "square" || mk === "diamond") series.marker = mk;
        else report(i + 1, `@series: marker must be circle|square|diamond`);
      }
      if (flags.size !== undefined) {
        const n = Number(flags.size);
        if (Number.isFinite(n) && n > 0) series.markerSize = n;
        else report(i + 1, `@series: size must be > 0`);
      }
      if (flags.t !== undefined) {
        const tr = parseRange(flags.t);
        if (tr) {
          series.tMin = tr[0];
          series.tMax = tr[1];
        } else report(i + 1, `@series: bad t range ${flags.t}`);
      }
      if (flags.theta !== undefined) {
        const tr = parseRange(flags.theta);
        if (tr) {
          series.tMin = tr[0];
          series.tMax = tr[1];
        } else report(i + 1, `@series: bad theta range ${flags.theta}`);
      }
      // Continuations on following lines
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (!next.trim() || next.trim().startsWith("#")) {
          j++;
          continue;
        }
        const cont = next.match(/^\s*(y|x|r|t|theta|cats)\s*=\s*(.+)$/i);
        if (!cont) break;
        const key = cont[1].toLowerCase();
        const value = cont[2].trim();
        if (key === "y") series.expression = value;
        else if (key === "x") series.xExpression = value;
        else if (key === "r") series.rExpression = value;
        else if (key === "cats") series.catsExpression = value;
        else if (key === "t" || key === "theta") {
          const tr = parseRange(value);
          if (tr) {
            series.tMin = tr[0];
            series.tMax = tr[1];
          } else report(i + 1, `@series: bad ${key} range ${value}`);
        }
        i = j;
        j++;
      }
      // Infer / validate kind
      const explicitKind = series.kind;
      if (explicitKind === "bar") {
        if (!series.expression && !series.yExpression) {
          report(i + 1, "@series kind=bar needs y = values (array or expression)", {
            code: "series-kind",
            hint: "y = [10, 20, 15] with cats = A, B, C",
          });
        } else {
          if (series.expression && !series.yExpression) series.yExpression = series.expression;
          plot.series.push(series);
        }
      } else if (explicitKind === "scatter") {
        if (series.xExpression && (series.expression || series.yExpression)) {
          if (series.expression && !series.yExpression) {
            series.yExpression = series.expression;
            delete series.expression;
          }
          if (!series.marker) series.marker = "circle";
          plot.series.push(series);
        } else if (series.expression) {
          if (!series.marker) series.marker = "circle";
          plot.series.push(series);
        } else {
          report(i + 1, "@series kind=scatter needs y = … or x=/y= arrays", {
            code: "series-kind",
          });
        }
      } else if (series.rExpression || explicitKind === "polar") {
        series.kind = "polar";
        if (series.tMin === undefined) series.tMin = 0;
        if (series.tMax === undefined) series.tMax = Math.PI * 2;
        if (!series.rExpression) report(i + 1, "@series: polar needs r = expression");
        else plot.series.push(series);
      } else if (
        (series.xExpression && (series.expression || series.yExpression) && !explicitKind) ||
        explicitKind === "parametric"
      ) {
        series.kind = "parametric";
        if (series.expression && !series.yExpression) {
          series.yExpression = series.expression;
          delete series.expression;
        }
        if (series.tMin === undefined) series.tMin = 0;
        if (series.tMax === undefined) series.tMax = Math.PI * 2;
        if (!(series.xExpression && series.yExpression)) {
          report(i + 1, "@series: parametric needs both x = and y =");
        } else plot.series.push(series);
      } else if (series.expression || explicitKind === "y") {
        series.kind = "y";
        if (!series.expression) {
          report(i + 1, "@series: expected y = expression");
        } else plot.series.push(series);
      } else if (series.xExpression && !series.expression) {
        report(i + 1, "@series: parametric needs both x = and y =");
      } else {
        report(i + 1, "@series: expected y = expression (or x=/y= parametric, r= polar, kind=bar|scatter)", {
          code: "series-kind",
          hint: "Cartesian: y = …; bar: kind=bar + cats= + y=; scatter: kind=scatter + x=/y=",
        });
      }
      i++;
      continue;
    }


    // @legend pos=…
    if (/^@legend\b/i.test(line)) {
      if (!plot) {
        report(i + 1, "@legend is only valid after @plot");
        i++;
        continue;
      }
      const rest = line.replace(/^@legend\b/i, "").trim();
      const flags = parseFlags(rest);
      const posRaw = (flags.pos || rest.replace(/^pos=/i, "").trim() || "").toLowerCase();
      const allowed = new Set(["top-right", "top-left", "bottom-right", "bottom-left"]);
      if (allowed.has(posRaw)) {
        plot.legend = true;
        plot.legendPos = /** @type {any} */ (posRaw);
      } else if (/\bnolegend\b/i.test(rest) || posRaw === "off" || posRaw === "none") {
        plot.legend = false;
      } else if (!rest) {
        plot.legend = true;
      } else {
        report(i + 1, `@legend: expected pos=top-right|top-left|bottom-right|bottom-left`, {
          code: "legend-pos",
        });
      }
      i++;
      continue;
    }

    // @annotate x=N y=N "text" …
    if (/^@annotate\b/i.test(line)) {
      if (!plot) {
        report(i + 1, "@annotate is only valid after @plot");
        i++;
        continue;
      }
      const rest = line.replace(/^@annotate\b/i, "").trim();
      const [restNoLabel, textLabel] = takeLabel(rest);
      const flags = parseFlags(restNoLabel);
      const label = textLabel || flags.text || flags.label;
      if (!label) {
        report(i + 1, '@annotate: expected "text"', { code: "annotate" });
        i++;
        continue;
      }
      const x = flags.x !== undefined ? Number(flags.x) : NaN;
      const y = flags.y !== undefined ? Number(flags.y) : NaN;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        report(i + 1, "@annotate: requires x= and y=", { code: "annotate" });
        i++;
        continue;
      }
      /** @type {PlotAnnotation} */
      const ann = { x, y, text: String(label) };
      if (flags.dx !== undefined && Number.isFinite(Number(flags.dx))) ann.dx = Number(flags.dx);
      if (flags.dy !== undefined && Number.isFinite(Number(flags.dy))) ann.dy = Number(flags.dy);
      if (flags.stroke) ann.stroke = String(flags.stroke);
      if (flags.axis === "y2" || flags.axis === "y") ann.axis = flags.axis;
      if (!plot.annotations) plot.annotations = [];
      plot.annotations.push(ann);
      i++;
      continue;
    }

    // @scrub name duration=N [selector=.im-scrub]
    if (/^@scrub\b/i.test(line)) {
      if (scrub) {
        report(i + 1, "Duplicate @scrub");
        i++;
        continue;
      }
      const rest = line.replace(/^@scrub\b/i, "").trim();
      const m = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)\b(.*)$/);
      if (!m) {
        report(i + 1, "@scrub: expected @scrub name duration=N", {
          code: "scrub",
          hint: "binds a timer/slider to CSS animation-delay on .im-scrub elements",
        });
        i++;
        continue;
      }
      const flags = parseFlags(m[2] || "");
      const duration = flags.duration !== undefined ? Number(flags.duration) : NaN;
      if (!Number.isFinite(duration) || duration <= 0) {
        report(i + 1, "@scrub: duration must be > 0 seconds", { code: "scrub" });
        i++;
        continue;
      }
      scrub = {
        name: m[1],
        duration,
        selector: flags.selector ? String(flags.selector) : ".im-scrub",
      };
      i++;
      continue;
    }

    // @lane id: "Label" y=N [height=H] [fill=#hex]
    {
      const m = line.match(/^@lane\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]+)$/i);
      if (m) {
        const id = m[1];
        if (!graph) {
          report(i + 1, `@lane ${id}: only valid after @graph`);
          i++;
          continue;
        }
        const quoted = parseQuotedPrefix(m[2]);
        if (!quoted) {
          report(i + 1, `@lane ${id}: expected "Label" y=N`);
          i++;
          continue;
        }
        if ((graph.lanes || []).some((l) => l.id === id)) {
          report(i + 1, `@lane ${id}: duplicate id`);
          i++;
          continue;
        }
        const flags = parseFlags(quoted.rest);
        const y = flags.y !== undefined ? Number(flags.y) : 0;
        const height = flags.height !== undefined ? Number(flags.height) : 120;
        if (!graph.lanes) graph.lanes = [];
        /** @type {GraphLane} */
        const lane = {
          id,
          label: quoted.value,
          y: Number.isFinite(y) ? y : 0,
          height: Number.isFinite(height) && height > 0 ? height : 120,
        };
        if (flags.fill) lane.fill = String(flags.fill);
        graph.lanes.push(lane);
        i++;
        continue;
      }
    }

    // @group id: "Label"
    {
      const m = line.match(/^@group\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]+)$/i);
      if (m) {
        const id = m[1];
        if (!graph) {
          report(i + 1, `@group ${id}: only valid after @graph`);
          i++;
          continue;
        }
        const quoted = parseQuotedPrefix(m[2]);
        if (!quoted) {
          report(i + 1, `@group ${id}: expected "Label"`);
          i++;
          continue;
        }
        if ((graph.groups || []).some((g) => g.id === id)) {
          report(i + 1, `@group ${id}: duplicate id`);
          i++;
          continue;
        }
        if (!graph.groups) graph.groups = [];
        graph.groups.push({ id, label: quoted.value });
        i++;
        continue;
      }
    }

    // @graph — following @node / @edge lines are an editable graph
    if (/^@graph$/i.test(line)) {
      if (plot) report(i + 1, "@graph cannot mix with @plot", {
        code: "mode-mix",
        hint: "use separate fences, or drop @plot",
      });
      else if (graph) report(i + 1, "Duplicate @graph");
      else graph = { nodes: [], edges: [], lanes: [], groups: [] };
      i++;
      continue;
    }
    if (/^@graph\b/i.test(line)) {
      report(i + 1, "@graph takes no arguments");
      i++;
      continue;
    }

    // @node id: "Label" x=N y=N kind=action
    {
      const m = line.match(/^@node\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]+)$/i);
      if (m) {
        const id = m[1];
        if (!graph) {
          report(i + 1, `@node ${id}: only valid after @graph`);
          i++;
          continue;
        }
        const quoted = parseQuotedPrefix(m[2]);
        if (!quoted) {
          report(i + 1, `@node ${id}: expected "Label" x=N y=N`);
          i++;
          continue;
        }
        if (graph.nodes.some((n) => n.id === id)) {
          report(i + 1, `@node ${id}: duplicate id`);
          i++;
          continue;
        }
        const flags = parseFlags(quoted.rest);
        const x = flags.x !== undefined ? Number(flags.x) : 48;
        const y = flags.y !== undefined ? Number(flags.y) : 48;
        const rawKind = flags.kind !== undefined ? String(flags.kind).toLowerCase() : "action";
        if (!NODE_KINDS.has(rawKind)) {
          report(i + 1, `@node ${id}: unknown kind ${flags.kind}`, {
            code: "node-kind",
            hint: "kind=action|input|output|decision",
          });
        }
        /** @type {GraphNode} */
        const node = {
          id,
          label: quoted.value,
          x: Number.isFinite(x) ? x : 48,
          y: Number.isFinite(y) ? y : 48,
          kind: NODE_KINDS.has(rawKind) ? rawKind : "action",
        };
        if (flags.lane) node.lane = String(flags.lane);
        if (flags.group) node.group = String(flags.group);
        graph.nodes.push(node);
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
          report(i + 1, `@edge ${from} -> ${to}: only valid after @graph`);
          i++;
          continue;
        }
        if (!graph.nodes.some((n) => n.id === from) || !graph.nodes.some((n) => n.id === to)) {
          report(i + 1, `@edge ${from} -> ${to}: unknown node`);
          i++;
          continue;
        }
        if (graph.edges.some((e) => e.from === from && e.to === to)) {
          report(i + 1, `@edge ${from} -> ${to}: duplicate edge`);
          i++;
          continue;
        }
        /** @type {GraphEdge} */
        const edge = { from, to };
        const tail = (m[3] || "").trim();
        let sideError = false;
        if (tail) {
          for (const part of tail.split(/\s+/)) {
            const flag = part.match(/^(from|to)=(\S+)$/i);
            if (!flag) {
              report(i + 1, `@edge ${from} -> ${to}: unknown ${part}`);
              sideError = true;
              continue;
            }
            const side = parseGraphSide(flag[2]);
            if (!side) {
              report(i + 1, `@edge ${from} -> ${to}: unknown side ${flag[2]}`, {
                code: "edge-side",
                hint: "left|right|top|bottom|top-left|top-right|bottom-left|bottom-right (tl|tr|bl|br)",
              });
              sideError = true;
              continue;
            }
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
      if (!graph) report(i + 1, "@animate is only valid after @graph");
      else if (graph.animated) report(i + 1, "Duplicate @animate");
      else {
        graph.animated = true;
        graph.motion = readAnimate(line, (message, opts) => report(i + 1, message, opts));
      }
      i++;
      continue;
    }

    // Controls and @ns may share a @graph fence; @svg/@plot stay exclusive (checked above).
    // Fall through so @slider/@timer/@let/@ns parse below. Reject leftover graph junk after controls.

    // @svg [WxH] — remainder of fence is SVG markup (overlay when @plot is set)
    if (/^@svg\b/i.test(line)) {
      if (graph) {
        report(i + 1, "@svg cannot mix with @graph", {
          code: "mode-mix",
          hint: "use @plot + overlay @svg, or a separate fence",
        });
        i++;
        continue;
      }
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

    // @angle deg|rad  (aliases: @mode deg|rad)
    {
      const m = line.match(/^@(?:angle|mode)\s+(deg|rad)\s*$/i);
      if (m) {
        angleMode = /** @type {'deg'|'rad'} */ (m[1].toLowerCase());
        i++;
        continue;
      }
    }

    // @phase name: min..max
    {
      const m = line.match(
        /^@phase\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(-?[0-9]*\.?[0-9]+)\.\.(-?[0-9]*\.?[0-9]+)\s*$/i
      );
      if (m) {
        const name = m[1];
        const min = Number(m[2]);
        const max = Number(m[3]);
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
          report(i + 1, `@phase ${name}: invalid range`);
        } else if (phases.some((p) => p.name === name)) {
          report(i + 1, `@phase ${name}: duplicate phase`);
        } else {
          phases.push({ name, min, max });
        }
        i++;
        continue;
      }
    }

    // @fn / @f name(params) = expression
    {
      const m = line.match(
        /^@(fn|f)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*=\s*(.+)$/i
      );
      if (m) {
        const name = m[2];
        const paramsRaw = m[3].trim();
        const expression = m[4].trim();
        /** @type {string[]} */
        const params = [];
        if (paramsRaw) {
          for (const part of paramsRaw.split(",")) {
            const p = part.trim();
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) {
              report(i + 1, `@fn ${name}: bad param ${part.trim()}`);
              params.length = 0;
              break;
            }
            if (params.includes(p)) {
              report(i + 1, `@fn ${name}: duplicate param ${p}`);
              params.length = 0;
              break;
            }
            params.push(p);
          }
        }
        if (fns.some((f) => f.name === name)) {
          report(i + 1, `@fn ${name}: duplicate function`);
        } else if (expression) {
          fns.push({ name, params, expression });
        } else {
          report(i + 1, `@fn ${name}: missing body`);
        }
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
          report(i + 1, `@${kind} ${name}: expected min..max [= default]`);
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

    if (graph) {
      report(i + 1, `Not allowed inside @graph: ${line}`, { code: "graph-context" });
    } else {
      const at = line.match(/^@([A-Za-z_][A-Za-z0-9_]*)/);
      const sug = at ? suggestDirectiveName(at[1]) : null;
      report(i + 1, `Unrecognized line: ${line}`, {
        code: at ? "unknown-directive" : "unrecognized",
        hint: sug ? `did you mean @${sug}?` : (at ? "check the IVM directive list (@plot, @svg, @graph, @slider, …)" : null),
      });
    }
    i++;
  }

  return { namespace, controls, fns, angleMode, phases, templateSvg, svgWidth, svgHeight, graph, plot, scrub, errors, diagnostics };
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
