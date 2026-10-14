import { parseHTML, DOMParser } from "linkedom";
import { parseIvm } from "../src/parse-ivm.js";
import { buildPlotSvg, normalizePlot, serializePlotLines, ticks, DEFAULT_WIDTH, DEFAULT_HEIGHT } from "../src/plot.js";
import { mountIvm, resetNamespaces } from "../src/render.js";
import { parseDocument, serializeDocument, serializeFigure, updatePlotAxis, updatePlotSeries } from "../src/document.js";

const { window, document } = parseHTML(
  "<!doctype html><html><body><div id='host'></div></body></html>"
);
globalThis.document = document;
globalThis.DOMParser = DOMParser;
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

console.log("=== plot smoke ===");

const body = `
@plot
@axis x: -10..10 step=2 "x"
@axis y: 0..0.8 step=0.2 "density"
@slider mu: -5..5 = 0 step=0.1 "μ (mean)"
@slider sigma: 0.5..4 = 1.5 step=0.1 "σ (std dev)"
@series density stroke=#6d28d9 fill=#7c3aed fillOpacity=0.25
  y = (1/(sigma*sqrt(2*pi))) * exp(-0.5*((x-mu)/sigma)^2)
`;

const p = parseIvm(body);
assert("parse errors", p.errors.length === 0, JSON.stringify(p.errors));
assert("has plot", !!p.plot);
assert("no graph", p.plot && !p.graph);
assert("no svg template", p.templateSvg == null);
assert("axis x", p.plot.x?.min === -10 && p.plot.x?.max === 10 && p.plot.x?.step === 2);
assert("axis x label", p.plot.x?.label === "x");
assert("axis y", p.plot.y?.min === 0 && p.plot.y?.max === 0.8 && p.plot.y?.step === 0.2);
assert("axis y label", p.plot.y?.label === "density");
assert("grid default", p.plot.grid === true);
assert("series count", p.plot.series.length === 1);
assert("series id", p.plot.series[0].id === "density");
assert("series stroke", p.plot.series[0].stroke === "#6d28d9");
assert("series fill", p.plot.series[0].fill === "#7c3aed");
assert("series opacity", p.plot.series[0].fillOpacity === 0.25);
assert("series expr", p.plot.series[0].expression.includes("sigma"));
assert("controls", p.controls.length === 2 && p.controls[0].name === "mu");

// inline y=
const inline = parseIvm(`@plot\n@series s stroke=#f00 y = sin(x)\n`);
assert("inline y=", inline.plot?.series[0]?.expression === "sin(x)", JSON.stringify(inline.plot?.series));

// nogrid
const ng = parseIvm(`@plot 400x300 nogrid\n@axis x: 0..1\n@axis y: 0..1\n@series y = x\n`);
assert("size", ng.plot?.width === 400 && ng.plot?.height === 300);
assert("nogrid", ng.plot?.grid === false);

// reject mix
const mix = parseIvm(`@plot\n@svg\n<svg/>\n`);
assert("no mix svg", mix.errors.some((e) => /cannot mix/.test(e)));

// ticks helper
const xt = ticks(-10, 10, 2);
assert("tick count", xt.length === 11, String(xt.length));
assert("tick ends", xt[0] === -10 && xt[xt.length - 1] === 10);

// build svg
const model = normalizePlot({
  x: p.plot.x,
  y: p.plot.y,
  grid: true,
  series: p.plot.series,
});
const svg = buildPlotSvg(model, { mu: 0, sigma: 1.5 });
assert("svg root", /^<svg\b/.test(svg));
assert("white bg", /fill="#ffffff"/.test(svg));
assert("grid present", /im-plot-grid/.test(svg));
assert("series path", /im-plot-series/.test(svg) && /stroke="#6d28d9"/.test(svg));
assert("fill under curve", /fill="#7c3aed"/.test(svg) && /fill-opacity="0\.25"/.test(svg));
assert("x label", />x<\/text>/.test(svg));
assert("y label rotated", /density/.test(svg) && /rotate\(-90/.test(svg));
assert("tick -10", />-10</.test(svg));
assert("tick 0.8", />0\.8</.test(svg));

// mount live
resetNamespaces();
const host = document.getElementById("host");
const mount = mountIvm(host, body);
assert("plot class", host.classList.contains("im-ivm-plot"));
assert("sliders", host.querySelectorAll("input[type=range]").length === 2);
const scope = host.querySelector(".im-svg-host")?.shadowRoot || host.querySelector(".im-svg-host") || host;
assert("mounted svg", !!scope.querySelector("svg"));
assert("mounted path", scope.querySelectorAll("path").length >= 1);

const sigma = host.querySelector('input[data-var="sigma"]');
const before = scope.querySelector("svg")?.innerHTML || "";
sigma.value = "3";
sigma.dispatchEvent(new window.Event("input", { bubbles: true }));
const after = (host.querySelector(".im-svg-host")?.shadowRoot || host.querySelector(".im-svg-host") || host)
  .querySelector("svg")?.innerHTML || "";
assert("recompute on slider", after !== before && after.includes("path"));

mount.destroy();

// document round-trip
const md = `# T\n\n\`\`\`ivm\n${body.trim()}\n\`\`\`\n`;
const doc = parseDocument(md);
assert("doc plot block", doc.blocks.some((b) => b.type === "plot"));
const plotBlock = doc.blocks.find((b) => b.type === "plot");
const fence = serializeFigure(plotBlock);
assert("serialize @plot", fence.includes("@plot") && !/@plot\s+0x0\b/.test(fence), fence.split("\n")[0]);
assert("serialize axis", fence.includes('@axis x:') && fence.includes('"density"'));
assert("serialize series", fence.includes("@series") && fence.includes("y ="));
const again = parseIvm(fence);
assert("round-trip series", again.plot?.series[0]?.expression.includes("exp"));
assert("round-trip controls", again.controls.some((c) => c.name === "mu"));

const out = serializeDocument(doc.blocks);
assert("doc serialize has plot", out.includes("@plot") && out.includes("@series"));

// Regression: missing WxH must not become @plot 0x0 after editor normalize/serialize
assert("parse missing size is null", p.plot.width == null && p.plot.height == null);
const nullSized = normalizePlot({ width: null, height: null, x: p.plot.x, y: p.plot.y, series: p.plot.series });
assert("null size → default W", nullSized.width === DEFAULT_WIDTH, String(nullSized.width));
assert("null size → default H", nullSized.height === DEFAULT_HEIGHT, String(nullSized.height));
const zeroSized = normalizePlot({ width: 0, height: 0, x: p.plot.x, y: p.plot.y, series: p.plot.series });
assert("zero size → default W", zeroSized.width === DEFAULT_WIDTH);
assert("zero size → default H", zeroSized.height === DEFAULT_HEIGHT);
const nanSized = normalizePlot({ width: NaN, height: undefined, x: p.plot.x, y: p.plot.y, series: [] });
assert("NaN/missing size → defaults", nanSized.width === DEFAULT_WIDTH && nanSized.height === DEFAULT_HEIGHT);

const bareLines = serializePlotLines({ width: null, height: null, x: p.plot.x, y: p.plot.y, series: p.plot.series });
assert("serialize bare @plot", bareLines[0] === "@plot" || bareLines[0].startsWith("@plot "), bareLines[0]);
assert("serialize never 0x0", !/@plot\s+0x0\b/.test(bareLines[0]), bareLines[0]);

const zeroSvg = buildPlotSvg({ width: 0, height: 0, x: p.plot.x, y: p.plot.y, series: p.plot.series }, { mu: 0, sigma: 1.5 });
assert(
  "render 0 size uses defaults",
  new RegExp(`viewBox="0 0 ${DEFAULT_WIDTH} ${DEFAULT_HEIGHT}"`).test(zeroSvg),
  zeroSvg.slice(0, 120)
);
assert("render not 0x0 viewBox", !/viewBox="0 0 0 0"/.test(zeroSvg));

// Document editor path: parse bare @plot → edit axis/series → serialize
const bareMd = `# T\n\n\`\`\`ivm\n${body.trim()}\n\`\`\`\n`;
let editDoc = parseDocument(bareMd);
const editBlock = editDoc.blocks.find((b) => b.type === "plot");
assert("editor plot stored defaults not 0", editBlock.plot.width === DEFAULT_WIDTH && editBlock.plot.height === DEFAULT_HEIGHT,
  `${editBlock.plot.width}x${editBlock.plot.height}`);
editDoc = { blocks: updatePlotAxis(editDoc, editBlock.id, "y", { max: 1 }).blocks };
editDoc = { blocks: updatePlotSeries(editDoc, editBlock.id, 0, { stroke: "#112233" }).blocks };
const edited = editDoc.blocks.find((b) => b.id === editBlock.id);
const editedFence = serializeFigure(edited);
assert("editor edit no 0x0", !/@plot\s+0x0\b/.test(editedFence), editedFence.split("\n")[0]);
assert("editor edit keeps @plot", /^@plot\b/m.test(editedFence));
assert("editor edit applied y max", /@axis y: 0\.\.1\b/.test(editedFence), editedFence);
assert("editor edit applied stroke", editedFence.includes("#112233"));
const editedOut = serializeDocument(editDoc.blocks);
assert("doc edit no 0x0", !/@plot\s+0x0\b/.test(editedOut), editedOut.match(/@plot[^\n]*/)?.[0]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
