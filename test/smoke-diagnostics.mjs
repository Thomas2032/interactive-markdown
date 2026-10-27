import { evaluate, suggestName, FUNCTION_NAMES } from "../src/expr.js";
import { parseIvm } from "../src/parse-ivm.js";
import {
  diagnoseFence,
  diagnoseMarkdown,
  formatDiagnostic,
  scanAngleFootguns,
} from "../src/diagnostics.js";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

console.log("=== diagnostics smoke ===");

assert("suggest sinn→sin", suggestName("sinn", FUNCTION_NAMES) === "sin");
assert("suggest cose→cos", suggestName("cose", FUNCTION_NAMES) === "cos");

try {
  evaluate("sinn(0)");
  assert("sinn throws", false);
} catch (err) {
  assert("sinn message hints sin", /did you mean `sin`/.test(err.message), err.message);
}

const badDir = parseIvm("@chart 1\n");
assert("unknown directive has line", badDir.diagnostics[0]?.line === 1);
assert(
  "unknown directive code",
  badDir.diagnostics[0]?.code === "unknown-directive",
  JSON.stringify(badDir.diagnostics)
);
assert("errors include line prefix", /^line 1:/.test(badDir.errors[0] || ""), badDir.errors[0]);

const foot = scanAngleFootguns("y = sin(45)\n", null);
assert("angle footgun warning", foot.length >= 1 && foot[0].severity === "warning", JSON.stringify(foot));
assert("no footgun with @angle deg", scanAngleFootguns("y = sin(45)\n", "deg").length === 0);

const fence = diagnoseFence(`@plot
@axis x: 0..1
@axis y: 0..1
@series
  y = nope(x)
`);
assert("series expr error", fence.errorCount >= 1, JSON.stringify(fence.diagnostics));
assert(
  "series hint did you mean or whitelist",
  fence.diagnostics.some((d) => /nope/.test(d.message)),
  JSON.stringify(fence.diagnostics)
);

const md = `# t

\`\`\`ivm
@slider a: 0..1 = 0.5
@let y = sin(90)
@svg
<svg><text>{{y}}</text></svg>
\`\`\`
`;
const doc = diagnoseMarkdown(md, { file: "t.md" });
assert("markdown finds fence", doc.fenceCount === 1);
assert("markdown angle warning", doc.warningCount >= 1, JSON.stringify(doc.diagnostics));
assert(
  "formatDiagnostic",
  /warning:/.test(formatDiagnostic(doc.diagnostics.find((d) => d.severity === "warning"))),
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const demo = join(root, "examples/p1-diagnostics-demo.md");
const cli = spawnSync(process.execPath, [join(root, "bin/ivm-check.mjs"), "--json", demo], {
  encoding: "utf8",
});
assert("cli exits non-zero on demo errors", cli.status === 1, String(cli.status));
let payload;
try {
  payload = JSON.parse(cli.stdout);
} catch (e) {
  payload = null;
}
assert("cli json shape", payload && Array.isArray(payload.diagnostics), cli.stdout.slice(0, 200));
assert("cli json has file", payload?.file?.includes("p1-diagnostics-demo"), payload?.file);
assert("cli json severities", payload.diagnostics.every((d) => d.severity && d.code && d.message));
assert("cli errorCount > 0", payload.errorCount > 0, String(payload.errorCount));

const okMd = "```ivm\n@slider a: 0..1 = 0.5\n@svg\n<svg/>\n```\n";
const ok = spawnSync(process.execPath, [join(root, "bin/ivm-check.mjs"), "--json"], {
  encoding: "utf8",
  input: okMd,
});
assert("cli clean exit 0", ok.status === 0, ok.stderr + ok.stdout);
const okPayload = JSON.parse(ok.stdout);
assert("cli clean no errors", okPayload.errorCount === 0);

const nsMd = [
  "```ivm",
  "@ns demo",
  "@svg 10x10",
  '<rect width="10" height="10"/>',
  "```",
  "",
  "```ivm",
  "@ns demmo",
  "@svg 10x10",
  '<rect width="10" height="10"/>',
  "```",
].join("\n");
const nsDoc = diagnoseMarkdown(nsMd);
assert(
  "ns typo warning",
  nsDoc.diagnostics.some((d) => d.code === "ns-typo"),
  JSON.stringify(nsDoc.diagnostics.filter((d) => String(d.code).startsWith("ns")))
);

const scrubFence = diagnoseFence(`@timer t: 0..4 = 0
@scrub t duration=4
@svg 100x40
<svg/>
`);
assert("scrub parses clean", scrubFence.errorCount === 0, JSON.stringify(scrubFence.diagnostics));
assert("scrub on parsed", scrubFence.parsed?.scrub?.name === "t" && scrubFence.parsed.scrub.duration === 4);


console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
