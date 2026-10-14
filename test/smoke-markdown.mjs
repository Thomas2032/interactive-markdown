import { readFileSync } from "node:fs";
import { parseHTML, DOMParser } from "linkedom";
import { marked } from "marked";
import { renderDocument } from "../src/markdown.js";

const { window, document } = parseHTML(
  "<!doctype html><html><body><div id='preview'></div></body></html>"
);
globalThis.document = document;
globalThis.DOMParser = DOMParser;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.performance = { now: () => Date.now() };

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

function svgScope(container) {
  const host = container.querySelector(".im-svg-host");
  return host?.shadowRoot || host || container;
}

console.log("=== markdown smoke ===");

const preview = document.getElementById("preview");
const src = `# Hello

A paragraph with **bold**.

\`\`\`ivm
@slider r: 1..20 = 10 "Radius"
@svg
<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="20" r="{{r}}" fill="#38bdf8"/>
</svg>
\`\`\`

Trailing text.
`;

const mount = renderDocument(preview, src, { marked });

assert("has md heading", !!preview.querySelector(".im-md h1"), preview.innerHTML.slice(0, 200));
assert("has bold", !!preview.querySelector(".im-md strong"));
assert("has ivm host", !!preview.querySelector(".im-ivm-host"));
assert("has slider", !!preview.querySelector('.im-ivm-host input[type="range"]'));
assert("has svg circle", !!svgScope(preview).querySelector("circle"));
assert("r default", svgScope(preview).querySelector("circle").getAttribute("r") === "10");
assert("trailing text", preview.textContent.includes("Trailing text"));

// two fences
const src2 = `
Intro

\`\`\`ivm
@toggle on: true
@svg
<svg xmlns="http://www.w3.org/2000/svg"><text>{{on}}</text></svg>
\`\`\`

Mid

\`\`\`ivm
@input name: "Ada" "Name"
@svg
<svg xmlns="http://www.w3.org/2000/svg"><text>{{name}}</text></svg>
\`\`\`
`;
mount.destroy();
assert("destroyed", preview.innerHTML === "");

const m2 = renderDocument(preview, src2, { marked });
assert("two ivm hosts", preview.querySelectorAll(".im-ivm-host").length === 2);
assert("toggle present", !!preview.querySelector('input[type="checkbox"]'));
assert("text input present", !!preview.querySelector('input[type="text"]'));

m2.destroy();
const agent = readFileSync(new URL("../examples/agent-loop.md", import.meta.url), "utf8");
const agentMount = renderDocument(preview, agent, { marked });
const fig = svgScope(preview).innerHTML || "";
assert("agent loop svg", !!svgScope(preview).querySelector("svg"));
assert("agent loop keyframes", /@keyframes\s+march/.test(fig), fig.slice(0, 300));
assert("agent loop motion", /animateMotion/i.test(fig));
assert("agent loop filter", /feGaussianBlur/i.test(fig));
assert("agent loop symbol use", /<use\b/i.test(fig) && /href="#i-bolt"/.test(fig), fig);
assert("agent loop stage", !!preview.querySelector(".im-ivm-static"));
const withoutNs = fig.replaceAll('xmlns="http://www.w3.org/2000/svg"', "");
assert("agent loop has no remote url", !/https?:\/\//i.test(withoutNs), withoutNs);
agentMount.destroy();

// plain md only
renderDocument(preview, "## Only md\n\n- a\n- b\n", { marked });
assert("list rendered", preview.querySelectorAll(".im-md li").length === 2);
assert("no ivm", preview.querySelectorAll(".im-ivm-host").length === 0);

// missing marked throws
let threw = false;
try {
  // clear any global
  delete globalThis.marked;
  renderDocument(preview, "# x");
} catch (e) {
  threw = /marked/.test(e.message);
}
assert("throws without marked", threw);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
