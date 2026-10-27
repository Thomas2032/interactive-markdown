/**
 * Safe expression evaluator for Interactive Markdown.
 * Whitelist-only recursive-descent parser. NEVER uses eval or Function.
 *
 * Supports arrays, map/reduce helpers, remap/px/py coordinate helpers, user @fn macros
 * (via options.functions), fence angleMode (deg|rad) for sin/cos/tan family, and @phase helpers.
 */

const CONSTANTS = Object.freeze({
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  true: true,
  false: false,
});

const MAX_FN_DEPTH = 32;
const MAX_ARRAY = 4096;

/**
 * @param {'deg'|'rad'|null|undefined} angleMode
 * @param {{ name: string, min: number, max: number }[]} phases
 */
function buildFunctions(angleMode, phases) {
  const degMode = angleMode === "deg";
  const toRad = (x) => (degMode ? (Number(x) * Math.PI) / 180 : Number(x));
  const fromRad = (x) => (degMode ? (Number(x) * 180) / Math.PI : Number(x));

  /** @param {unknown} a */
  const asArray = (a) => {
    if (!Array.isArray(a)) throw new Error("Expected array");
    return a;
  };

  const phaseList = Array.isArray(phases) ? phases : [];

  /** @param {number} t @param {string} name */
  const findPhase = (t, name) => {
    const key = String(name);
    return phaseList.find((p) => p.name === key) || null;
  };

  return Object.freeze({
    abs: Math.abs,
    sqrt: Math.sqrt,
    pow: Math.pow,
    exp: Math.exp,
    ln: Math.log,
    log: (x, base) => (base === undefined ? Math.log10(x) : Math.log(x) / Math.log(base)),
    sin: (x) => Math.sin(toRad(x)),
    cos: (x) => Math.cos(toRad(x)),
    tan: (x) => Math.tan(toRad(x)),
    asin: (x) => fromRad(Math.asin(x)),
    acos: (x) => fromRad(Math.acos(x)),
    atan: (x) => fromRad(Math.atan(x)),
    atan2: (y, x) => fromRad(Math.atan2(y, x)),
    round: (x, digits) => {
      if (digits === undefined || digits === null) return Math.round(x);
      const f = 10 ** digits;
      return Math.round(x * f) / f;
    },
    floor: Math.floor,
    ceil: Math.ceil,
    trunc: Math.trunc,
    sign: Math.sign,
    min: Math.min,
    max: Math.max,
    clamp: (x, lo, hi) => Math.min(Math.max(x, lo), hi),
    mod: (a, b) => ((a % b) + b) % b,
    lerp: (a, b, t) => a + (b - a) * t,
    // Linear remap: value from [in0,in1] → [out0,out1] (safe SVG / plot pixel helper).
    // Named remap (not map) because map() is the array mapper.
    remap: (v, in0, in1, out0, out1) => {
      const x = Number(v);
      const a = Number(in0);
      const b = Number(in1);
      const c = Number(out0);
      const d = Number(out1);
      if (![x, a, b, c, d].every(Number.isFinite)) return NaN;
      if (b === a) return c;
      return c + ((x - a) * (d - c)) / (b - a);
    },
    // Shorthand: data → pixel X (left→right)
    px: (v, lo, hi, size) => {
      const x = Number(v);
      const a = Number(lo);
      const b = Number(hi);
      const w = Number(size);
      if (![x, a, b, w].every(Number.isFinite)) return NaN;
      if (b === a) return 0;
      return ((x - a) / (b - a)) * w;
    },
    // Shorthand: data → pixel Y with SVG y-down flip (top of range → y=0)
    py: (v, lo, hi, size) => {
      const x = Number(v);
      const a = Number(lo);
      const b = Number(hi);
      const h = Number(size);
      if (![x, a, b, h].every(Number.isFinite)) return NaN;
      if (b === a) return h;
      return h - ((x - a) / (b - a)) * h;
    },
    deg: (r) => (r * 180) / Math.PI,
    rad: (d) => (d * Math.PI) / 180,
    // Always degrees, regardless of angleMode
    sind: (d) => Math.sin((d * Math.PI) / 180),
    cosd: (d) => Math.cos((d * Math.PI) / 180),
    tand: (d) => Math.tan((d * Math.PI) / 180),
    asind: (x) => (Math.asin(x) * 180) / Math.PI,
    acosd: (x) => (Math.acos(x) * 180) / Math.PI,
    atand: (x) => (Math.atan(x) * 180) / Math.PI,

    // Array helpers
    len: (a) => asArray(a).length,
    nth: (a, i) => {
      const arr = asArray(a);
      const idx = Math.trunc(Number(i));
      if (idx < 0 || idx >= arr.length) throw new Error(`nth: index ${idx} out of range`);
      return arr[idx];
    },
    first: (a) => {
      const arr = asArray(a);
      if (!arr.length) throw new Error("first: empty array");
      return arr[0];
    },
    last: (a) => {
      const arr = asArray(a);
      if (!arr.length) throw new Error("last: empty array");
      return arr[arr.length - 1];
    },
    sum: (a) => asArray(a).reduce((s, v) => s + Number(v), 0),
    mean: (a) => {
      const arr = asArray(a);
      if (!arr.length) return NaN;
      return arr.reduce((s, v) => s + Number(v), 0) / arr.length;
    },
    join: (a, sep) => asArray(a).map((v) => formatValue(v)).join(sep === undefined ? "," : String(sep)),
    range: (start, end, step) => {
      const a = Number(start);
      const b = Number(end);
      let s = step === undefined || step === null ? 1 : Number(step);
      if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(s) || s === 0) {
        throw new Error("range: invalid bounds/step");
      }
      /** @type {number[]} */
      const out = [];
      if (s > 0) {
        for (let x = a; x <= b + 1e-12; x += s) {
          out.push(Math.round(x * 1e10) / 1e10);
          if (out.length > MAX_ARRAY) throw new Error("range: too many elements");
        }
      } else {
        for (let x = a; x >= b - 1e-12; x += s) {
          out.push(Math.round(x * 1e10) / 1e10);
          if (out.length > MAX_ARRAY) throw new Error("range: too many elements");
        }
      }
      return out;
    },
    // points(xs, ys) → "x1,y1 x2,y2 …" for SVG polyline/polygon
    points: (xs, ys) => {
      const ax = asArray(xs);
      const ay = asArray(ys);
      const n = Math.min(ax.length, ay.length);
      /** @type {string[]} */
      const parts = [];
      for (let i = 0; i < n; i++) {
        parts.push(`${formatValue(ax[i])},${formatValue(ay[i])}`);
      }
      return parts.join(" ");
    },

    // Phase helpers (named ranges from @phase)
    inPhase: (t, name) => {
      const p = findPhase(t, name);
      if (!p) return false;
      const x = Number(t);
      return Number.isFinite(x) && x >= p.min && x <= p.max;
    },
    phaseT: (t, name) => {
      const p = findPhase(t, name);
      if (!p) return 0;
      const x = Number(t);
      if (!Number.isFinite(x)) return 0;
      const span = p.max - p.min;
      if (span === 0) return x >= p.min ? 1 : 0;
      if (x < p.min) return 0;
      if (x > p.max) return 1;
      return (x - p.min) / span;
    },
    phaseAt: (t) => {
      const x = Number(t);
      if (!Number.isFinite(x)) return "";
      const hit = phaseList.find((p) => x >= p.min && x <= p.max);
      return hit ? hit.name : "";
    },
  });
}

/** Default (rad) function table for introspection / tests. */
const FUNCTIONS = buildFunctions("rad", []);

function tokenize(input) {
  const tokens = [];
  let i = 0;
  const s = String(input);

  while (i < s.length) {
    const c = s[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      let value = "";
      while (j < s.length && s[j] !== quote) {
        if (s[j] === "\\" && j + 1 < s.length) {
          value += s[j + 1];
          j += 2;
        } else {
          value += s[j];
          j++;
        }
      }
      if (j >= s.length) throw new Error(`Unterminated string at ${i}`);
      tokens.push({ type: "string", value });
      i = j + 1;
      continue;
    }

    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      if (j < s.length && (s[j] === "e" || s[j] === "E")) {
        j++;
        if (j < s.length && (s[j] === "+" || s[j] === "-")) j++;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
      }
      const raw = s.slice(i, j);
      const num = Number(raw);
      if (Number.isNaN(num)) throw new Error(`Invalid number: ${raw}`);
      tokens.push({ type: "number", value: num });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      tokens.push({ type: "ident", value: s.slice(i, j) });
      i = j;
      continue;
    }

    const two = s.slice(i, i + 2);
    if (
      two === "**" ||
      two === "&&" ||
      two === "||" ||
      two === "==" ||
      two === "!=" ||
      two === "<=" ||
      two === ">="
    ) {
      tokens.push({ type: "op", value: two });
      i += 2;
      continue;
    }

    if ("+-*/%^()<>,?:![]".includes(c) || c === "<" || c === ">") {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }

    throw new Error(`Unexpected character '${c}' at ${i}`);
  }

  tokens.push({ type: "eof" });
  return tokens;
}

class Parser {
  /**
   * @param {ReturnType<typeof tokenize>} tokens
   * @param {Record<string, unknown>} env
   * @param {{
   *   angleMode?: 'deg'|'rad'|null,
   *   functions?: Record<string, { params: string[], expression: string }>,
   *   phases?: { name: string, min: number, max: number }[],
   *   depth?: number,
   * }} options
   */
  constructor(tokens, env, options = {}) {
    this.tokens = tokens;
    this.pos = 0;
    this.env = env || {};
    this.options = options || {};
    this.angleMode = options.angleMode === "deg" ? "deg" : "rad";
    this.userFns = options.functions || {};
    this.phases = options.phases || [];
    this.depth = options.depth || 0;
    this.fns = buildFunctions(this.angleMode, this.phases);
  }

  peek() {
    return this.tokens[this.pos];
  }

  consume() {
    return this.tokens[this.pos++];
  }

  matchOp(...ops) {
    const t = this.peek();
    if (t.type === "op" && ops.includes(t.value)) {
      this.consume();
      return t.value;
    }
    return null;
  }

  expectOp(op) {
    const t = this.consume();
    if (t.type !== "op" || t.value !== op) {
      throw new Error(`Expected '${op}', got ${t.type}:${t.value}`);
    }
  }

  parse() {
    const value = this.parseTernary();
    if (this.peek().type !== "eof") {
      throw new Error(`Unexpected token: ${this.peek().type}:${this.peek().value}`);
    }
    return value;
  }

  parseTernary() {
    let cond = this.parseOr();
    if (this.matchOp("?")) {
      const a = this.parseTernary();
      this.expectOp(":");
      const b = this.parseTernary();
      return cond ? a : b;
    }
    return cond;
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.matchOp("||")) {
      const right = this.parseAnd();
      left = left || right;
    }
    return left;
  }

  parseAnd() {
    let left = this.parseEquality();
    while (this.matchOp("&&")) {
      const right = this.parseEquality();
      left = left && right;
    }
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    for (;;) {
      const op = this.matchOp("==", "!=");
      if (!op) break;
      const right = this.parseComparison();
      left = op === "==" ? left == right : left != right;
    }
    return left;
  }

  parseComparison() {
    let left = this.parseAdd();
    for (;;) {
      const op = this.matchOp("<", ">", "<=", ">=");
      if (!op) break;
      const right = this.parseAdd();
      if (op === "<") left = left < right;
      else if (op === ">") left = left > right;
      else if (op === "<=") left = left <= right;
      else left = left >= right;
    }
    return left;
  }

  parseAdd() {
    let left = this.parseMul();
    for (;;) {
      const op = this.matchOp("+", "-");
      if (!op) break;
      const right = this.parseMul();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  parseMul() {
    let left = this.parseUnary();
    for (;;) {
      const op = this.matchOp("*", "/", "%");
      if (!op) break;
      const right = this.parseUnary();
      if (op === "*") left = left * right;
      else if (op === "/") left = left / right;
      else left = left % right;
    }
    return left;
  }

  parseUnary() {
    if (this.matchOp("!")) return !this.parseUnary();
    if (this.matchOp("+")) return +this.parseUnary();
    if (this.matchOp("-")) return -this.parseUnary();
    return this.parsePow();
  }

  parsePow() {
    let base = this.parsePrimary();
    const op = this.matchOp("^", "**");
    if (op) {
      const exp = this.parseUnary();
      return Math.pow(base, exp);
    }
    return base;
  }

  /**
   * Mapper / reducer: bare fn name, string expr, or evaluated string.
   * @returns {{ type: 'fn', name: string } | { type: 'expr', source: string }}
   */
  parseMapper() {
    const t = this.peek();
    if (t.type === "string") {
      this.consume();
      return { type: "expr", source: t.value };
    }
    if (t.type === "ident") {
      const next = this.tokens[this.pos + 1];
      if (!(next && next.type === "op" && next.value === "(")) {
        this.consume();
        return { type: "fn", name: t.value };
      }
    }
    const v = this.parseTernary();
    if (typeof v === "string") return { type: "expr", source: v };
    throw new Error("map/reduce: mapper must be a function name or string expression");
  }

  /**
   * @param {string} name
   * @param {unknown[]} args
   */
  callNamed(name, args) {
    if (Object.prototype.hasOwnProperty.call(this.fns, name) && name !== "map" && name !== "reduce") {
      const fn = this.fns[name];
      return fn(...args);
    }
    if (Object.prototype.hasOwnProperty.call(this.userFns, name)) {
      if (this.depth >= MAX_FN_DEPTH) throw new Error(`Function recursion limit (${MAX_FN_DEPTH})`);
      const ufn = this.userFns[name];
      /** @type {Record<string, unknown>} */
      const childEnv = Object.create(null);
      Object.assign(childEnv, this.env);
      for (let i = 0; i < ufn.params.length; i++) {
        childEnv[ufn.params[i]] = args[i];
      }
      return evaluate(ufn.expression, childEnv, {
        angleMode: this.angleMode,
        functions: this.userFns,
        phases: this.phases,
        depth: this.depth + 1,
      });
    }
    const hint = suggestName(name, listKnownFunctionNames(this));
    throw new Error(
      hint ? `Unknown function: ${name} (did you mean \`${hint}\`?)` : `Unknown function: ${name}`
    );
  }

  /**
   * @param {unknown} arr
   * @param {{ type: string, name?: string, source?: string }} mapper
   */
  applyMap(arr, mapper) {
    if (!Array.isArray(arr)) throw new Error("map: first argument must be an array");
    if (arr.length > MAX_ARRAY) throw new Error("map: array too large");
    return arr.map((item, i) => {
      if (mapper.type === "fn") {
        return this.callNamed(/** @type {string} */ (mapper.name), [item]);
      }
      /** @type {Record<string, unknown>} */
      const local = Object.create(null);
      Object.assign(local, this.env);
      local._ = item;
      local.i = i;
      return evaluate(/** @type {string} */ (mapper.source), local, {
        angleMode: this.angleMode,
        functions: this.userFns,
        phases: this.phases,
        depth: this.depth + 1,
      });
    });
  }

  /**
   * @param {unknown} arr
   * @param {{ type: string, name?: string, source?: string }} reducer
   * @param {unknown} init
   */
  applyReduce(arr, reducer, init) {
    if (!Array.isArray(arr)) throw new Error("reduce: first argument must be an array");
    if (arr.length > MAX_ARRAY) throw new Error("reduce: array too large");
    let acc = init;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (reducer.type === "fn") {
        acc = this.callNamed(/** @type {string} */ (reducer.name), [acc, item]);
      } else {
        /** @type {Record<string, unknown>} */
        const local = Object.create(null);
        Object.assign(local, this.env);
        local.acc = acc;
        local._ = item;
        local.i = i;
        acc = evaluate(/** @type {string} */ (reducer.source), local, {
          angleMode: this.angleMode,
          functions: this.userFns,
          phases: this.phases,
          depth: this.depth + 1,
        });
      }
    }
    return acc;
  }

  parsePrimary() {
    const t = this.peek();

    if (t.type === "number") {
      this.consume();
      return t.value;
    }

    if (t.type === "string") {
      this.consume();
      return t.value;
    }

    if (t.type === "op" && t.value === "[") {
      this.consume();
      /** @type {unknown[]} */
      const items = [];
      if (!(this.peek().type === "op" && this.peek().value === "]")) {
        items.push(this.parseTernary());
        while (this.matchOp(",")) {
          items.push(this.parseTernary());
        }
      }
      this.expectOp("]");
      if (items.length > MAX_ARRAY) throw new Error("array literal too large");
      return items;
    }

    if (t.type === "ident") {
      this.consume();
      const name = t.value;

      if (this.peek().type === "op" && this.peek().value === "(") {
        this.consume();

        if (name === "map") {
          const arr = this.parseTernary();
          this.expectOp(",");
          const mapper = this.parseMapper();
          this.expectOp(")");
          return this.applyMap(arr, mapper);
        }
        if (name === "reduce") {
          const arr = this.parseTernary();
          this.expectOp(",");
          const reducer = this.parseMapper();
          this.expectOp(",");
          const init = this.parseTernary();
          this.expectOp(")");
          return this.applyReduce(arr, reducer, init);
        }

        const args = [];
        if (!(this.peek().type === "op" && this.peek().value === ")")) {
          args.push(this.parseTernary());
          while (this.matchOp(",")) {
            args.push(this.parseTernary());
          }
        }
        this.expectOp(")");
        return this.callNamed(name, args);
      }

      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
        return CONSTANTS[name];
      }
      if (Object.prototype.hasOwnProperty.call(this.env, name)) {
        return this.env[name];
      }
      const hint = suggestName(name, Object.keys(this.env).concat(Object.keys(CONSTANTS)));
      throw new Error(
        hint ? `Unknown identifier: ${name} (did you mean \`${hint}\`?)` : `Unknown identifier: ${name}`
      );
    }

    if (t.type === "op" && t.value === "(") {
      this.consume();
      const v = this.parseTernary();
      this.expectOp(")");
      return v;
    }

    throw new Error(`Unexpected token in primary: ${t.type}:${t.value}`);
  }
}

/**
 * Evaluate a whitelist expression against an environment of variables.
 * @param {string} source
 * @param {Record<string, unknown>} env
 * @param {{
 *   angleMode?: 'deg'|'rad'|null,
 *   functions?: Record<string, { params: string[], expression: string }>,
 *   phases?: { name: string, min: number, max: number }[],
 *   depth?: number,
 * }} [options]
 * @returns {unknown}
 */

/**
 * @param {string} name
 * @param {Iterable<string>} candidates
 * @returns {string|null}
 */
export function suggestName(name, candidates) {
  const target = String(name || "").toLowerCase();
  if (!target) return null;
  let best = null;
  let bestScore = Infinity;
  let bestRank = Infinity;
  for (const raw of candidates) {
    const c = String(raw);
    if (!c) continue;
    const lower = c.toLowerCase();
    if (lower === target) return c;
    const score = editDistance(target, lower);
    // Prefer prefix / near-prefix matches on ties (sinn → sin over sign)
    let rank = score * 10;
    if (lower.startsWith(target) || target.startsWith(lower)) rank -= 3;
    rank += Math.abs(lower.length - target.length);
    if (score < bestScore || (score === bestScore && rank < bestRank)) {
      bestScore = score;
      bestRank = rank;
      best = c;
    }
  }
  // Allow small typos only
  const maxDist = target.length <= 4 ? 1 : 2;
  return bestScore <= maxDist ? best : null;
}

/**
 * @param {string} a
 * @param {string} b
 */
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  /** @type {number[]} */
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    /** @type {number[]} */
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** Built-in whitelist function names (rad table; names identical in deg mode). */
export const FUNCTION_NAMES = Object.freeze([
  ...Object.keys(FUNCTIONS),
  "map",
  "reduce",
].sort());

/**
 * @param {{ fns: Record<string, unknown>, userFns: Record<string, unknown> }} parser
 */
function listKnownFunctionNames(parser) {
  return [
    ...Object.keys(parser.fns || {}),
    ...Object.keys(parser.userFns || {}),
    "map",
    "reduce",
  ];
}

export function evaluate(source, env = {}, options = {}) {
  const tokens = tokenize(source);
  const parser = new Parser(tokens, env, options);
  return parser.parse();
}

/**
 * Format a value for SVG attribute / text insertion.
 * @param {unknown} value
 * @returns {string}
 */
export function formatValue(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    const rounded = Math.round(value * 1e6) / 1e6;
    return String(rounded);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.map(formatValue).join(",");
  if (value == null) return "";
  return String(value);
}

/**
 * Replace {{expr}} placeholders in a string using the evaluator.
 * @param {string} template
 * @param {Record<string, unknown>} env
 * @param {string[]} [errors]
 * @param {Parameters<typeof evaluate>[2]} [options]
 * @returns {string}
 */
export function substitute(template, env = {}, errors, options = {}) {
  let out = "";
  let i = 0;
  const s = String(template);

  while (i < s.length) {
    if (s[i] === "{" && s[i + 1] === "{") {
      let depth = 1;
      let j = i + 2;
      let inStr = null;
      while (j < s.length) {
        const c = s[j];
        if (inStr) {
          if (c === "\\" && j + 1 < s.length) {
            j += 2;
            continue;
          }
          if (c === inStr) inStr = null;
          j++;
          continue;
        }
        if (c === "'" || c === '"') {
          inStr = c;
          j++;
          continue;
        }
        if (c === "{" && s[j + 1] === "{") {
          depth++;
          j += 2;
          continue;
        }
        if (c === "}" && s[j + 1] === "}") {
          depth--;
          if (depth === 0) {
            const expr = s.slice(i + 2, j);
            try {
              out += formatValue(evaluate(expr, env, options));
            } catch (err) {
              out += "{{" + expr + "}}";
              const msg = /** @type {Error} */ (err).message || String(err);
              if (errors) errors.push(`{{${expr.trim()}}}: ${msg}`);
              else console.warn("[ivm expr]", msg, "in", expr);
            }
            i = j + 2;
            break;
          }
          j += 2;
          continue;
        }
        j++;
      }
      if (depth !== 0) {
        out += s[i];
        i++;
      }
      continue;
    }
    out += s[i];
    i++;
  }
  return out;
}

export { CONSTANTS, FUNCTIONS, buildFunctions, listKnownFunctionNames };
