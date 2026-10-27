import { completionsAt, fenceAtOffset, DIRECTIVE_COMPLETIONS } from "../src/autocomplete.js";

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

console.log("=== autocomplete smoke ===");

const md = `# hi

\`\`\`ivm
@sl
@series
  y = si
@edge a -> b from=
\`\`\`
`;

const fence = fenceAtOffset(md, md.indexOf("@sl") + 3);
assert("fenceAtOffset inside ivm", !!fence);

const atDir = completionsAt(md, md.indexOf("@sl") + 3);
assert("directive completions", !!atDir && atDir.items.some((i) => i.label === "@slider"), JSON.stringify(atDir));

const atFn = completionsAt(md, md.indexOf("y = si") + 6);
assert("function completions", !!atFn && atFn.items.some((i) => i.label === "sin"), JSON.stringify(atFn));

const atPort = completionsAt(md, md.indexOf("from=") + 5);
assert("port completions", !!atPort && atPort.items.some((i) => i.label === "left"), JSON.stringify(atPort));

const outside = completionsAt("# no fence\n", 3);
assert("no completions outside fence", outside === null);

assert("directive list non-empty", DIRECTIVE_COMPLETIONS.length >= 10);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
