import * as ivm from "../index.js";

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

console.log("=== package exports ===");

const fns = [
  "renderDocument",
  "mountIvm",
  "resetNamespaces",
  "parseIvm",
  "splitIvmFences",
  "evaluate",
  "formatValue",
  "substitute",
  "sanitizeSvg",
  "isSafeHref",
];

for (const name of fns) {
  assert(`${name} is a function`, typeof ivm[name] === "function");
}

assert("CONSTANTS.pi", ivm.CONSTANTS && ivm.CONSTANTS.pi === Math.PI);
assert("FUNCTIONS.clamp", typeof ivm.FUNCTIONS?.clamp === "function");
assert("SAFE_SVG_TAGS includes svg", Array.isArray(ivm.SAFE_SVG_TAGS) && ivm.SAFE_SVG_TAGS.includes("svg"));
assert("evaluate 1+2", ivm.evaluate("1+2") === 3);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
