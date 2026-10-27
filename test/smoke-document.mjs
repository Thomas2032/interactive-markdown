import { readFileSync } from "node:fs";
import { parseHTML, DOMParser } from "linkedom";
import { insertFeature, parseDocument, serializeDocument, updateBlock } from "../src/document.js";

const { window, document } = parseHTML(
  "<!doctype html><html><body><div id='host'></div></body></html>"
);
globalThis.document = document;
globalThis.DOMParser = DOMParser;
globalThis.window = window;

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

function read(name) {
  return readFileSync(new URL("../examples/" + name, import.meta.url), "utf8");
}

console.log("=== document smoke ===");

const amplitude = parseDocument(read("amplitude.md"));
const figure = amplitude.blocks.find((b) => b.type === "figure");
assert("amplitude heading", amplitude.blocks.some((b) => b.type === "heading" && b.text === "Wave amplitude"));
assert("amplitude figure", !!figure);
assert("slider", figure?.controls.some((c) => c.kind === "slider" && c.name === "amp"));
assert("timer", figure?.controls.some((c) => c.kind === "timer" && c.name === "t" && c.loop === true));
assert(
  "formulas",
  figure?.controls.filter((c) => c.kind === "let").length === 2 &&
    figure.controls.some((c) => c.kind === "let" && /sind\(/.test(c.expression))
);
assert("circle", figure?.shapes?.some((s) => s.type === "circle"));
assert(
  "bound path",
  figure?.shapes?.some((s) => s.type === "path" && String(s.attrs.d).includes("{{y}}"))
);
const amplitudeOut = serializeDocument(amplitude.blocks);
assert("serialized slider", /@slider amp:/.test(amplitudeOut));
assert("serialized timer", /@timer t:/.test(amplitudeOut) && /loop/.test(amplitudeOut));
assert("serialized formula", /@let y =/.test(amplitudeOut));
assert("serialized circle", /<circle\b/.test(amplitudeOut));
const amplitudeAgain = parseDocument(amplitudeOut);
const figureAgain = amplitudeAgain.blocks.find((b) => b.type === "figure");
assert(
  "round trip shapes",
  figureAgain?.shapes?.some((s) => s.type === "circle") &&
    figureAgain.shapes.some((s) => String(s.attrs.d || "").includes("{{y}}"))
);

const graph = parseDocument(read("graph.md"));
const graphBlock = graph.blocks.find((b) => b.type === "graph");
assert("graph block", !!graphBlock);
assert("five nodes", graphBlock?.model.nodes.length === 5);
assert("four edges", graphBlock?.model.edges.length === 4);
const graphOut = serializeDocument(graph.blocks);
assert("graph fence", /@graph/.test(graphOut) && /@node trigger:/.test(graphOut) && /@edge act -> output/.test(graphOut));

const agent = parseDocument(read("agent-loop.md"));
const agentGraph = agent.blocks.find((b) => b.type === "graph");
assert("agent loop is a graph", !!agentGraph && agent.blocks.every((b) => b.type !== "figure"));
assert("agent loop animates", agentGraph?.model.animated === true && agentGraph.model.motion?.quantity === 3);
assert(
  "agent loop uses top and bottom",
  agentGraph?.model.edges.some((e) => e.fromSide === "bottom" && e.toSide === "top")
);
const agentOut = serializeDocument(agent.blocks);
assert("agent loop writes @animate", /@animate path=ortho quantity=3 direction=forward speed=2\.2/.test(agentOut));
assert("agent loop writes a vertical edge", /@edge trigger -> think from=bottom to=top/.test(agentOut));
assert("agent loop stays one fence", agentOut.split("```").length === 3);

const customSvg = parseDocument(
  "```ivm\n@svg\n<svg><style>@keyframes pulse{}</style><animateMotion path=\"M0 0\"/><feGaussianBlur stdDeviation=\"1\"/></svg>\n```\n"
);
const opaque = customSvg.blocks.find((b) => b.type === "figure" && b.customSvg);
assert("opaque figure", !!opaque && opaque.shapes == null);
assert("keeps keyframes", /@keyframes/.test(opaque?.customSvg || ""));
assert("keeps animateMotion", /animateMotion/.test(opaque?.customSvg || ""));
assert("keeps filter", /feGaussianBlur/.test(opaque?.customSvg || ""));
const opaqueOut = serializeDocument(customSvg.blocks);
assert("keyframes survive", /@keyframes/.test(opaqueOut));
assert("animateMotion survives", /animateMotion/.test(opaqueOut));
assert("filter survives", /feGaussianBlur/.test(opaqueOut));

let built = insertFeature({ blocks: [] }, "slider");
built = insertFeature(built.doc, "timer", { figureId: built.focusId });
built = insertFeature(built.doc, "formula", { figureId: built.focusId });
built = insertFeature(built.doc, "shape", { figureId: built.focusId, shapeType: "circle" });
const builtOut = serializeDocument(built.doc.blocks);
assert("new slider name", /@slider s1:/.test(builtOut));
assert("new timer name", /@timer t1:/.test(builtOut));
assert("new formula name", /@let y1 = 0/.test(builtOut));
assert("new circle", /<circle\b[^>]*r="16"/.test(builtOut));

const motion = parseDocument(read("circular-motion.md"));
const motionFigure = motion.blocks.find((b) => b.type === "figure");
assert("calc reads as formula", motionFigure?.controls.some((c) => c.kind === "let" && c.name === "a"));
assert(
  "text binding",
  motionFigure?.shapes?.some((s) => s.type === "text" && String(s.attrs.text).includes("{{round(a,1)}}"))
);
assert("formula writes @let", /@let a =/.test(serializeDocument(motion.blocks)));

let merged = insertFeature({ blocks: [] }, "graph");
merged = {
  doc: {
    blocks: updateBlock(merged.doc, merged.focusId, {
      model: {
        nodes: [{ id: "a", label: "A", x: 8, y: 8, kind: "action" }],
        edges: [],
        animated: true,
      },
    }).blocks,
  },
};
const mergedOut = serializeDocument(merged.doc.blocks);
assert("animated graph is one fence", /@graph/.test(mergedOut) && /@animate/.test(mergedOut) && /@node a:/.test(mergedOut));
assert("animated graph has no second svg fence", !/@svg/.test(mergedOut) && mergedOut.split("```").length === 3);
const mergedAgain = parseDocument(mergedOut);
assert("animated round trip is one graph", mergedAgain.blocks.filter((b) => b.type === "graph").length === 1);
assert("animated round trip stays a graph", mergedAgain.blocks.every((b) => b.type !== "figure"));
assert("animated flag stays", mergedAgain.blocks[0].model.animated === true);
assert("animated nodes stay", mergedAgain.blocks[0].model.nodes.length === 1 && mergedAgain.blocks[0].model.nodes[0].id === "a");

// --- P4 document model ---
const p4 = parseDocument(read("p4-demo.md"));
assert("p4 has graph", p4.blocks.some((b) => b.type === "graph"));
assert(
  "p4 graph namespace",
  p4.blocks.some((b) => b.type === "graph" && b.namespace === "demo")
);
assert(
  "p4 figure namespace",
  p4.blocks.some((b) => b.type === "figure" && b.namespace === "demo")
);
const p4Graph = p4.blocks.find((b) => b.type === "graph");
assert(
  "p4 animate binds",
  p4Graph?.model?.motion?.quantityFrom === "dots" && p4Graph?.model?.motion?.speedFrom === "pace"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
