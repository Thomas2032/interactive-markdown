import { evaluate, formatValue, substitute, CONSTANTS, FUNCTIONS } from "../src/expr.js";

let passed = 0;
let failed = 0;
function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log("  OK ", name);
  } else {
    failed++;
    console.log("  FAIL", name, detail);
  }
}

console.log("=== expr smoke ===");

// arithmetic
assert("1+2*3", evaluate("1+2*3") === 7);
assert("(1+2)*3", evaluate("(1+2)*3") === 9);
assert("2^3", evaluate("2^3") === 8);
assert("2**4", evaluate("2**4") === 16);
assert("10%3", evaluate("10%3") === 1);
assert("unary -", evaluate("-5 + 2") === -3);
assert("unary !", evaluate("!0") === true);

// comparisons / logic / ternary
assert("ternary", evaluate("1 > 0 ? 10 : 20") === 10);
assert("&&", evaluate("1 && 2") === 2);
assert("||", evaluate("0 || 5") === 5);
assert("==", evaluate("3 == 3") === true);

// functions + constants
assert("sin(0)", evaluate("sin(0)") === 0);
assert("cos(0)", Math.abs(evaluate("cos(0)") - 1) < 1e-12);
assert("pi", Math.abs(evaluate("pi") - Math.PI) < 1e-12);
assert("round(pi,2)", evaluate("round(pi, 2)") === 3.14);
assert("clamp", evaluate("clamp(5,0,3)") === 3);
assert("lerp", evaluate("lerp(0,10,0.5)") === 5);
assert("min/max", evaluate("min(3,1,4)") === 1 && evaluate("max(3,1,4)") === 4);
assert("deg/rad", Math.abs(evaluate("deg(rad(90))") - 90) < 1e-10);

// env vars
assert("env", evaluate("amp + 1", { amp: 30 }) === 31);
assert("computed-like", evaluate("round(100 + radius*cos(a*pi/180), 2)", { radius: 50, a: 0 }) === 150);

// strings
assert("string", evaluate("'hi'") === "hi");
assert("toggle str", evaluate("on == 'true'", { on: "true" }) === true);

// formatValue
assert("format num", formatValue(1.23456789) === "1.234568");
assert("format bool", formatValue(true) === "true");

// {{expr}} substitute
assert(
  "sub simple",
  substitute("r={{radius}}", { radius: 50 }) === "r=50"
);
assert(
  "sub expr",
  substitute("x={{round(100+radius*cos(0),2)}}", { radius: 50 }) === "x=150"
);
assert(
  "sub leaves single braces",
  substitute("M 10 {40} Q", {}) === "M 10 {40} Q"
);
assert(
  "sub multi",
  substitute("{{a}}+{{b}}", { a: 1, b: 2 }) === "1+2"
);

// security: no eval of identifiers outside whitelist
let threw = false;
try {
  evaluate("constructor");
} catch {
  threw = true;
}
assert("unknown ident throws", threw);

threw = false;
try {
  evaluate("eval(1)");
} catch {
  threw = true;
}
assert("eval fn throws", threw);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
