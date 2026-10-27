import { evaluate } from "../src/expr.js";
import { parseIvm } from "../src/parse-ivm.js";
import { applyGraphLayout, normalizeLayoutName } from "../src/graph-layout.js";
import { serializeGraph } from "../src/graph-editor.js";
import { buildPlotSvg } from "../src/plot.js";
import { diagnoseFence } from "../src/diagnostics.js";
import { completionsAt } from "../src/autocomplete.js";

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

console.log("=== p2 layout/data/helpers smoke ===");

assert("layout alias dagre", normalizeLayoutName("dagre") === "dagre");
assert("layout alias flow", normalizeLayoutName("flow") === "dagre");
assert("layout alias layered", normalizeLayoutName("layered") === "dagre");
assert("layout bad", normalizeLayoutName("force") === null);

assert("remap mid", evaluate("remap(5, 0, 10, 0, 100)") === 50);
assert("remap edge", evaluate("remap(0, 0, 10, 20, 80)") === 20);
assert("px", evaluate("px(0.5, 0, 1, 200)") === 100);
assert("py flip", evaluate("py(0, 0, 1, 80)") === 80);
assert("py top", evaluate("py(1, 0, 1, 80)") === 0);

const laid = parseIvm(`
@graph layout=dagre
@node a: "A" kind=input
@node b: "B"
@node c: "C" kind=output
@edge a -> b
@edge b -> c
`);
assert("layout parse clean", laid.errors.length === 0, JSON.stringify(laid.errors));
assert("layout stored", laid.graph?.layout === "dagre");
assert("all autoPos", laid.graph.nodes.every((n) => n.autoPos));
assert("a leftmost", laid.graph.nodes.find((n) => n.id === "a").x < laid.graph.nodes.find((n) => n.id === "b").x);
assert("c rightmost", laid.graph.nodes.find((n) => n.id === "c").x > laid.graph.nodes.find((n) => n.id === "b").x);
assert(
  "distinct y or x chain",
  new Set(laid.graph.nodes.map((n) => n.x)).size === 3
);

const mixed = parseIvm(`
@graph layout=flow
@node pinned: "Pinned" x=10 y=200
@node free: "Free"
@edge pinned -> free
`);
assert("mixed clean", mixed.errors.length === 0, JSON.stringify(mixed.errors));
const pinned = mixed.graph.nodes.find((n) => n.id === "pinned");
const free = mixed.graph.nodes.find((n) => n.id === "free");
assert("pinned kept", pinned.x === 10 && pinned.y === 200 && !pinned.autoPos);
assert("free auto", free.autoPos === true);
assert("free not on pinned", !(free.x === 10 && free.y === 200));

const ser = serializeGraph(laid.graph);
assert("serialize layout flag", ser.startsWith("@graph layout=dagre"));
assert("serialize omits auto coords", !/@node a:.* x=/.test(ser), ser);

const again = parseIvm(ser);
assert("roundtrip layout", again.graph?.layout === "dagre" && again.errors.length === 0);
assert("roundtrip still layered", again.graph.nodes.find((n) => n.id === "c").x > again.graph.nodes.find((n) => n.id === "a").x);

const badLayout = parseIvm(`@graph layout=force\n@node a: "A"\n`);
assert("bad layout errors", badLayout.errors.some((e) => /unknown layout/.test(e)));

const dataBody = `
@data sales
month, value
Jan, 40
Feb, 55
Mar, 48
@plot 400x240
@axis x: cats=Jan,Feb,Mar "Month"
@axis y: 0..80 step=20
@series kind=bar from=sales fill=#7c3aed
  cats = month
  y = value
`;
const d = parseIvm(dataBody);
assert("data parse clean", d.errors.length === 0, JSON.stringify(d.errors));
assert("data table", d.data?.length === 1 && d.data[0].name === "sales");
assert("data cols", d.data[0].columnNames.join(",") === "month,value");
assert("data rows", d.data[0].columns.value.join(",") === "40,55,48");
assert("from qualifies cats", d.plot.series[0].catsExpression === "sales_month");
assert("from qualifies y", d.plot.series[0].yExpression === "sales_value" || d.plot.series[0].expression === "sales_value",
  JSON.stringify(d.plot.series[0]));

const env = {
  sales_month: d.data[0].columns.month,
  sales_value: d.data[0].columns.value,
};
const svg = buildPlotSvg(d.plot, env);
assert("bar from data renders", typeof svg === "string" && svg.includes("<rect"), svg.slice(0, 200));

const anchorBody = `
@slider amp: 0..1 = 0.5
@anchor tip x=170 y=40
@let cy = remap(amp, 0, 1, 70, 10)
@svg 200x80
  <circle cx="{{tip_x}}" cy="{{cy}}" r="8"/>
`;
const a = parseIvm(anchorBody);
assert("anchor parse", a.errors.length === 0 && a.anchors?.[0]?.name === "tip");
assert("anchor coords", a.anchors[0].x === 170 && a.anchors[0].y === 40);

const diag = diagnoseFence(dataBody);
assert(
  "diagnostics clean for @data series",
  diag.errorCount === 0,
  JSON.stringify(diag.diagnostics.filter((x) => x.severity === "error"))
);

const src = "```ivm\n@da\n```";
const comps = completionsAt(src, src.indexOf("@da") + 3);
assert(
  "autocomplete @data",
  !!comps && comps.items.some((c) => c.label === "@data"),
  JSON.stringify(comps)
);
const src2 = "```ivm\n@anc\n```";
const comps2 = completionsAt(src2, src2.indexOf("@anc") + 4);
assert(
  "autocomplete @anchor",
  !!comps2 && comps2.items.some((c) => c.label === "@anchor"),
  JSON.stringify(comps2)
);

// Manual layout API still works
const manual = {
  layout: "dagre",
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, autoPos: true },
    { id: "b", label: "B", x: 0, y: 0, autoPos: true },
  ],
  edges: [{ from: "a", to: "b" }],
};
applyGraphLayout(manual);
assert("manual apply", manual.nodes[0].x < manual.nodes[1].x);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
