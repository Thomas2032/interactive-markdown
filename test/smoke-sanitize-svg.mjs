import { DOMParser } from "linkedom";
import { sanitizeSvg, isSafeHref, SAFE_SVG_TAGS } from "../src/sanitize-svg.js";

globalThis.DOMParser = DOMParser;
// XMLSerializer intentionally omitted — module falls back to element.toString()

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

console.log("=== sanitize-svg smoke ===");

assert("isSafeHref #", isSafeHref("#foo") === true);
assert("isSafeHref data image", isSafeHref("data:image/png;base64,xx") === true);
assert("isSafeHref http", isSafeHref("https://evil.test/x") === false);
assert("isSafeHref javascript", isSafeHref("javascript:alert(1)") === false);
assert("isSafeHref relative", isSafeHref("../x.svg") === false);
assert("SAFE_SVG_TAGS has path", SAFE_SVG_TAGS.includes("path"));

const clean = sanitizeSvg(`
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g>
    <rect x="0" y="0" width="10" height="10" fill="#fff"/>
    <circle cx="50" cy="50" r="10"/>
    <line x1="0" y1="0" x2="1" y2="1"/>
    <path d="M0 0 L10 10"/>
    <text x="1" y="2">hi</text>
    <defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>
    <animate attributeName="opacity" from="0" to="1" dur="1s"/>
  </g>
</svg>`);
assert("keeps svg root", /<svg\b/i.test(clean), clean.slice(0, 120));
assert("keeps rect", /<rect\b/i.test(clean));
assert("keeps circle", /<circle\b/i.test(clean));
assert("keeps line", /<line\b/i.test(clean));
assert("keeps path", /<path\b/i.test(clean));
assert("keeps text", /<text\b/i.test(clean));
assert("keeps g", /<g\b/i.test(clean));
assert("keeps defs/gradient", /<defs\b/i.test(clean) && /linearGradient/i.test(clean));
assert("keeps animate", /<animate\b/i.test(clean));

const withScript = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg">
  <script>alert(1)</script>
  <circle r="5" onclick="alert(1)" onload="evil()"/>
  <foreignObject><div>x</div></foreignObject>
  <a href="https://evil.test">x</a>
  <image href="https://evil.test/a.png"/>
  <image href="data:image/png;base64,abc"/>
  <use href="#g"/>
</svg>`);
assert("strips script", !/<script\b/i.test(withScript), withScript);
assert("strips foreignObject", !/foreignObject/i.test(withScript));
assert("strips onclick", !/onclick/i.test(withScript));
assert("strips onload", !/onload/i.test(withScript));
assert("strips external a href", !/evil\.test/i.test(withScript), withScript);
assert("strips external image href", !/a\.png/i.test(withScript));
assert("keeps data image", /data:image\/png/i.test(withScript), withScript);
assert("strips use", !/<use\b/i.test(withScript));
assert("keeps circle after sanitize", /<circle\b/i.test(withScript));

const frag = sanitizeSvg(`<circle cx="1" cy="2" r="3"/>`);
assert("wraps fragment", /<svg\b/i.test(frag) && /<circle\b/i.test(frag), frag);

const empty = sanitizeSvg("   ");
assert("empty -> empty", empty === "");

const xlink = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image xlink:href="https://evil.test/x.png"/>
  <image xlink:href="#local"/>
</svg>`);
assert("strips xlink external", !/evil\.test/i.test(xlink), xlink);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
