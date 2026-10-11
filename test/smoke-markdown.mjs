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
assert("has svg circle", !!preview.querySelector(".im-ivm-host svg circle"));
assert("r default", preview.querySelector("circle").getAttribute("r") === "10");
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

// plain md only
m2.destroy();
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
