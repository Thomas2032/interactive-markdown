import { parseIvm, splitIvmFences } from "../src/parse-ivm.js";

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

console.log("=== parse-ivm smoke ===");

const body = `
@ns demo
@slider amp: 5..60 = 30 step=1 "Amplitude"
@timer t: 0..360 = 0 speed=30 loop "Phase"
@input title: "Hello" "Title"
@toggle show: true "Show"
@let a = amp + t
@calc b = a / 2
@svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="{{amp}}" />
</svg>
`;

const p = parseIvm(body);
assert("no errors", p.errors.length === 0, JSON.stringify(p.errors));
assert("namespace", p.namespace === "demo");
assert("control count", p.controls.length === 6, String(p.controls.length));
assert("slider", p.controls[0].kind === "slider" && p.controls[0].name === "amp");
assert("slider range", p.controls[0].range[0] === 5 && p.controls[0].range[1] === 60);
assert("slider default", p.controls[0].default === 30);
assert("slider step", p.controls[0].step === 1);
assert("slider label", p.controls[0].label === "Amplitude");
assert("timer", p.controls[1].kind === "timer" && p.controls[1].loop === true);
assert("timer speed", p.controls[1].speed === 30);
assert("input", p.controls[2].kind === "input" && p.controls[2].default === "Hello");
assert("toggle", p.controls[3].kind === "toggle" && p.controls[3].default === true);
assert("let", p.controls[4].kind === "let" && p.controls[4].expression === "amp + t");
assert("calc->let", p.controls[5].kind === "let" && p.controls[5].name === "b");
assert("svg present", typeof p.templateSvg === "string" && p.templateSvg.includes("<svg"));
assert("svg has {{amp}}", p.templateSvg.includes("{{amp}}"));
assert("full svg no size", p.svgWidth == null && p.svgHeight == null);

// noloop
const t2 = parseIvm(`@timer x: 0..10 = 0 noloop\n@svg\n<svg/>\n`);
assert("noloop", t2.controls[0].loop === false);

// defaults when flags omitted
const defs = parseIvm(`@slider n: 0..10 = 3\n@timer u: 0..5 = 0\n@svg\n<svg/>\n`);
assert("default step", defs.controls[0].step === 1);
assert("label undefined", defs.controls[0].label === undefined);
assert("timer default loop", defs.controls[1].loop === true);
assert("timer default speed", defs.controls[1].speed === 30);

// short aliases
const aliases = parseIvm(`
@s amp: 5..55 = 28
@t t: 0..100 = 0 speed=25
@i title: "Hi"
@b on: false
@l y = amp * 2
@svg 200x80
  <circle r="{{amp}}"/>
`);
assert("alias errors", aliases.errors.length === 0, JSON.stringify(aliases.errors));
assert("alias @s", aliases.controls[0].kind === "slider" && aliases.controls[0].name === "amp");
assert("alias @t", aliases.controls[1].kind === "timer");
assert("alias @i", aliases.controls[2].kind === "input");
assert("alias @b", aliases.controls[3].kind === "toggle");
assert("alias @l", aliases.controls[4].kind === "let" && aliases.controls[4].name === "y");
assert("svg WxH width", aliases.svgWidth === 200);
assert("svg WxH height", aliases.svgHeight === 80);
assert("slim svg body", aliases.templateSvg.includes("<circle") && !/^<svg\b/i.test(aliases.templateSvg.trim()));

// deg/rad flag
const deg = parseIvm(`@timer spin: 0..360 = 0 deg speed=40\n@slider a: 0..180 = 90 rad\n@svg\n<svg/>\n`);
assert("deg units", deg.controls[0].units === "deg");
assert("rad units", deg.controls[1].units === "rad");

// bad slider
const bad = parseIvm(`@slider z: nope\n`);
assert("bad slider errors", bad.errors.length >= 1);

// split fences
const md = `# Title

Hello

\`\`\`ivm
@slider r: 1..10 = 5 "R"
@svg
<svg><circle r="{{r}}"/></svg>
\`\`\`

After

\`\`\`ivm
@toggle on: false
@svg
<svg/>
\`\`\`
`;
const segs = splitIvmFences(md);
assert("seg count", segs.length === 4, String(segs.length)); // text, ivm, text, ivm
assert("seg0 text", segs[0].type === "text" && segs[0].content.includes("# Title"));
assert("seg1 ivm", segs[1].type === "ivm" && segs[1].content.includes("@slider"));
assert("seg2 text", segs[2].type === "text" && segs[2].content.includes("After"));
assert("seg3 ivm", segs[3].type === "ivm" && segs[3].content.includes("@toggle"));

// must not recognize old dialect lines as valid controls
const old = parseIvm(`slider amp range=5..60 default=30\ntemplate svg:\n<svg/>\n`);
assert("rejects old slider line", old.errors.some((e) => /Unrecognized/.test(e)));
assert("no controls from old dialect", old.controls.length === 0);
assert("old template not @svg", old.templateSvg === null);

// comments / blanks
const c = parseIvm(`# comment\n\n@slider n: 0..1 = 0\n@svg\n<svg/>\n`);
assert("skips comments", c.controls.length === 1 && c.errors.length === 0);


// Cartesian @plot
const plot = parseIvm(`
@plot 480x320
@axis x: -10..10 step=2 "x"
@axis y: 0..0.8 step=0.2 "density"
@slider mu: -5..5 = 0
@series density stroke=#6d28d9 fill=#7c3aed fillOpacity=0.25
  y = exp(-x*x)
`);
assert("plot errors", plot.errors.length === 0, JSON.stringify(plot.errors));
assert("plot model", !!plot.plot && plot.plot.series.length === 1);
assert("plot size", plot.plot.width === 480 && plot.plot.height === 320);
assert("plot axis label", plot.plot.y.label === "density");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
