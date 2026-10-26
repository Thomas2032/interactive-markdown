import { DOMParser } from "linkedom";
import { sanitizeSvg, sanitizeCss, isSafeHref, SAFE_SVG_TAGS } from "../src/sanitize-svg.js";

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
assert("isSafeHref rejects svg data", isSafeHref("data:image/svg+xml,xxx") === false);
assert("isSafeHref http", isSafeHref("https://evil.test/x") === false);
assert("isSafeHref javascript", isSafeHref("javascript:alert(1)") === false);
assert("isSafeHref relative traversal", isSafeHref("../x.svg") === false);
assert("isSafeHref relative local", isSafeHref("assets/icon.png") === true);
assert("isSafeHref root-relative", isSafeHref("/icons/a.png") === true);
assert("isSafeHref data font", isSafeHref("data:font/woff2;base64,AA==") === true);
assert("isSafeHref protocol-relative", isSafeHref("//evil.test/x.png") === false);
assert("SAFE_SVG_TAGS has path", SAFE_SVG_TAGS.includes("path"));
assert("SAFE_SVG_TAGS has style", SAFE_SVG_TAGS.includes("style"));
assert("SAFE_SVG_TAGS has filter", SAFE_SVG_TAGS.includes("filter"));

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
  <use href="https://evil.test/sprite.svg#g"/>
</svg>`);
assert("strips script", !/<script\b/i.test(withScript), withScript);
assert("strips foreignObject", !/foreignObject/i.test(withScript));
assert("strips onclick", !/onclick/i.test(withScript));
assert("strips onload", !/onload/i.test(withScript));
assert("strips external a href", !/evil\.test/i.test(withScript), withScript);
assert("strips external image href", !/a\.png/i.test(withScript));
assert("keeps data image", /data:image\/png/i.test(withScript), withScript);
const localImg = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><image href="assets/icon.png"/><image href="https://evil.test/a.png"/></svg>`);
assert("keeps relative image", /assets\/icon\.png/i.test(localImg), localImg);
assert("strips remote image still", !/evil\.test/i.test(localImg), localImg);
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

const animated = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg">
  <style>
    @import url("https://evil.test/a.css");
    @font-face { font-family: x; src: url(https://evil.test/a.woff); }
    .a { background: url("https://evil.test/a.png"); filter: url(#glow); }
    .b { background: \\75 rl(https://evil.test/b.png); }
    @keyframes move { to { stroke-dashoffset: -20 } }
    .dot { animation: move 1s infinite; }
  </style>
  <defs>
    <filter id="glow"><feGaussianBlur stdDeviation="3"/></filter>
    <symbol id="g"><circle r="2"/></symbol>
  </defs>
  <use href="#g"/>
  <use href="../sprite.svg#g"/>
  <rect width="10" height="10" filter="url(#glow)" marker-end="url(#ah)"/>
  <animate attributeName="href" to="javascript:alert(1)"/>
  <animate attributeName="opacity" from="0" to="1" dur="1s"/>
  <animateMotion dur="2s" path="M0 0 H10"/>
</svg>`);
assert("keeps keyframes", /@keyframes\s+move/.test(animated), animated);
assert("keeps animation class", /animation:\s*move/.test(animated), animated);
assert("keeps fragment filter url", /url\(#glow\)/.test(animated), animated);
assert("keeps marker url", /url\(#ah\)/.test(animated), animated);
assert("keeps gaussian blur", /feGaussianBlur/i.test(animated), animated);
assert("keeps internal use", /<use\b[^>]*href="#g"/i.test(animated), animated);
assert("drops external use", (animated.match(/<use\b/gi) || []).length === 1, animated);
assert("drops href animation", !/attributeName="href"/i.test(animated), animated);
assert("keeps opacity animation", /attributeName="opacity"/i.test(animated), animated);
assert("keeps animateMotion", /animateMotion/i.test(animated), animated);
assert("animated svg has no remote url", !/evil\.test/i.test(animated), animated);
assert("animated svg has no import", !/@import/i.test(animated), animated);
assert("animated svg font-face kept but remote cleared", /@font-face/i.test(animated) && !/evil\.test/i.test(animated), animated);
assert("animated svg has no javascript", !/javascript/i.test(animated), animated);

const css = sanitizeCss(
  '@import "https://evil.test/x.css"; .a{filter:url(#glow)} </style><script>alert(1)</script>'
);
assert("css keeps fragment url", css.includes("url(#glow)"), css);
assert("css strips breakout", !css.includes("<"), css);
assert("css strips import host", !css.includes("evil.test"), css);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
