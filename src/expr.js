/**
 * Safe expression evaluator for Interactive Markdown.
 * Whitelist-only recursive-descent parser. NEVER uses eval or Function.
 */

const CONSTANTS = Object.freeze({
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  true: true,
  false: false,
});

const FUNCTIONS = Object.freeze({
  abs: Math.abs,
  sqrt: Math.sqrt,
  pow: Math.pow,
  exp: Math.exp,
  ln: Math.log,
  log: (x, base) => (base === undefined ? Math.log10(x) : Math.log(x) / Math.log(base)),
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
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
  deg: (r) => (r * 180) / Math.PI,
  rad: (d) => (d * Math.PI) / 180,
  sind: (d) => Math.sin((d * Math.PI) / 180),
  cosd: (d) => Math.cos((d * Math.PI) / 180),
  tand: (d) => Math.tan((d * Math.PI) / 180),
  asind: (x) => (Math.asin(x) * 180) / Math.PI,
  acosd: (x) => (Math.acos(x) * 180) / Math.PI,
  atand: (x) => (Math.atan(x) * 180) / Math.PI,
});

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

    // Multi-char operators
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

    if ("+-*/%^()<>,?:!".includes(c) || c === "<" || c === ">") {
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
  constructor(tokens, env) {
    this.tokens = tokens;
    this.pos = 0;
    this.env = env || {};
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
    // right-associative: ^ and **
    const op = this.matchOp("^", "**");
    if (op) {
      const exp = this.parseUnary();
      return Math.pow(base, exp);
    }
    return base;
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

    if (t.type === "ident") {
      this.consume();
      const name = t.value;

      // function call
      if (this.peek().type === "op" && this.peek().value === "(") {
        this.consume();
        const args = [];
        if (!(this.peek().type === "op" && this.peek().value === ")")) {
          args.push(this.parseTernary());
          while (this.matchOp(",")) {
            args.push(this.parseTernary());
          }
        }
        this.expectOp(")");
        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`Unknown function: ${name}`);
        return fn(...args);
      }

      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
        return CONSTANTS[name];
      }
      if (Object.prototype.hasOwnProperty.call(this.env, name)) {
        return this.env[name];
      }
      throw new Error(`Unknown identifier: ${name}`);
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
 * @returns {unknown}
 */
export function evaluate(source, env = {}) {
  const tokens = tokenize(source);
  const parser = new Parser(tokens, env);
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
    // Trim floating noise while keeping useful precision
    const rounded = Math.round(value * 1e6) / 1e6;
    return String(rounded);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "";
  return String(value);
}

/**
 * Replace {{expr}} placeholders in a string using the evaluator.
 * Double-brace form avoids clashing with lone { } in SVG path data.
 * @param {string} template
 * @param {Record<string, unknown>} env
 * @returns {string}
 */
export function substitute(template, env = {}) {
  let out = "";
  let i = 0;
  const s = String(template);

  while (i < s.length) {
    if (s[i] === "{" && s[i + 1] === "{") {
      let depth = 1; // counts {{ ... }} pairs via inner { } for nested exprs
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
              out += formatValue(evaluate(expr, env));
            } catch (err) {
              out += "{{" + expr + "}}";
              console.warn("[ivm expr]", err.message, "in", expr);
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

export { CONSTANTS, FUNCTIONS };
