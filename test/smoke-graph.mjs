import { parseHTML, DOMParser } from "linkedom";
import { marked } from "marked";
import { parseIvm, replaceIvmFence } from "../src/parse-ivm.js";
import {
  addEdge,
  mountGraphEditor,
  moveNode,
  nextNodePosition,
  removeSelection,
  serializeGraph,
  setMotion,
  normalizeMotion,
} from "../src/graph-editor.js";
import { renderDocument } from "../src/markdown.js";

const { window, document } = parseHTML(
  "<!doctype html><html><body><div id='host'></div><div id='preview'></div></body></html>"
);
globalThis.document = document;
globalThis.DOMParser = DOMParser;
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

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

console.log("=== graph smoke ===");

const sample = `
@graph
@node trigger: "Trigger" x=40 y=168 kind=input
@node think: "Think" x=280 y=72
@edge trigger -> think
`;

const parsed = parseIvm(sample);
assert("graph parses", parsed.errors.length === 0, JSON.stringify(parsed.errors));
assert("two nodes", parsed.graph.nodes.length === 2);
assert("default kind action", parsed.graph.nodes[1].kind === "action");
assert("input kind", parsed.graph.nodes[0].kind === "input");
assert("one edge", parsed.graph.edges.length === 1 && parsed.graph.edges[0].to === "think");

const dup = parseIvm(`@graph\n@node a: "A" x=1 y=2\n@node a: "B" x=3 y=4\n`);
assert("duplicate id", dup.errors.some((e) => /duplicate id/.test(e)));
assert("keeps first id", dup.graph.nodes.length === 1 && dup.graph.nodes[0].label === "A");

const missing = parseIvm(`@graph\n@node a: "A" x=1 y=2\n@edge a -> b\n`);
assert("missing endpoint", missing.errors.some((e) => /unknown node/.test(e)));
assert("omits bad edge", missing.graph.edges.length === 0);

const mixed = parseIvm(`@slider amp: 0..1 = 0.5\n@graph\n@node a: "A" x=1 y=2\n@animate quantity=amp speed=pace\n@slider pace: 0.5..5 = 2\n`);
assert("controls allowed with graph", mixed.errors.length === 0, JSON.stringify(mixed.errors));
assert("graph+slider controls", mixed.controls.length === 2 && mixed.controls[0].name === "amp");
assert("animate quantityFrom", mixed.graph.motion.quantityFrom === "amp");
assert("animate speedFrom", mixed.graph.motion.speedFrom === "pace");

const unknown = parseIvm(`@graph\n@node a: "A" x=1 y=2 kind=nope\n`);
assert("unknown kind errors", unknown.errors.some((e) => /unknown kind/.test(e)));
assert("unknown kind falls back", unknown.graph.nodes[0].kind === "action");

const quoted = parseIvm(`@graph\n@node a: "say \\"hi\\"" x=8 y=16\n`);
assert("escaped label", quoted.errors.length === 0 && quoted.graph.nodes[0].label === 'say "hi"');

const round = {
  nodes: [
    { id: "a", label: 'say "hi"', x: 8, y: 16, kind: "action" },
    { id: "b", label: "Out", x: 40, y: 16, kind: "output" },
  ],
  edges: [{ from: "a", to: "b" }],
};
const again = parseIvm(serializeGraph(round));
assert("serialize roundtrip", again.errors.length === 0, JSON.stringify(again.errors));
assert("roundtrip label", again.graph.nodes[0].label === 'say "hi"');
assert("action omitted", !serializeGraph(round).includes("kind=action"));
assert("output kept", serializeGraph(round).includes("kind=output"));
assert("still graph omits @animate", !serializeGraph(round).includes("@animate"));
const animated = { ...round, animated: true };
assert("animated writes @animate", serializeGraph(animated).includes("@animate"));
const animatedAgain = parseIvm(serializeGraph(animated));
assert("animated flag parses", animatedAgain.graph.animated === true);
const kept = moveNode(animated, "a", 20, 20);
assert("move keeps animated", kept.animated === true && serializeGraph(kept).includes("@animate"));

const moved = moveNode(
  { nodes: [{ id: "a", label: "A", x: 0, y: 0, kind: "action" }], edges: [] },
  "a",
  15,
  17
);
assert("snap 8px", moved.nodes[0].x === 16 && moved.nodes[0].y === 16);
const slot = nextNodePosition([
  { id: "a", label: "A", x: 32, y: 32, kind: "action" },
  { id: "b", label: "B", x: 240, y: 32, kind: "action" },
]);
assert("next slot skips occupied", slot.x === 448 && slot.y === 32, JSON.stringify(slot));

const base = {
  nodes: [
    { id: "trigger", label: "Trigger", x: 0, y: 0, kind: "input" },
    { id: "think", label: "Think", x: 80, y: 0, kind: "action" },
  ],
  edges: [],
};
const first = addEdge(base, "trigger", "think");
assert("edge added", first.ok && first.model.edges.length === 1);
const dupEdge = addEdge(first.model, "trigger", "think");
assert("duplicate edge rejected", !dupEdge.ok && dupEdge.reason === "duplicate");
assert("duplicate leaves model", dupEdge.model.edges.length === 1);
const reverse = addEdge(first.model, "think", "trigger");
assert("reverse edge ok", reverse.ok && reverse.model.edges.length === 2);
const vertical = addEdge(base, "trigger", "think", { fromSide: "bottom", toSide: "top" });
assert("bottom to top edge", vertical.ok && vertical.model.edges[0].fromSide === "bottom" && vertical.model.edges[0].toSide === "top");
assert(
  "serialize vertical edge",
  serializeGraph(vertical.model).includes("@edge trigger -> think from=bottom to=top")
);
const verticalAgain = parseIvm(serializeGraph(vertical.model));
assert(
  "parse vertical edge",
  verticalAgain.graph.edges[0].fromSide === "bottom" && verticalAgain.graph.edges[0].toSide === "top"
);
const self = addEdge(base, "trigger", "trigger", { fromSide: "bottom-left", toSide: "top-left" });
assert("self edge ok", self.ok && self.model.edges.length === 1 && self.model.edges[0].from === "trigger");
assert("self edge corner ports", self.model.edges[0].fromSide === "bottom-left" && self.model.edges[0].toSide === "top-left");
assert(
  "serialize self edge",
  serializeGraph(self.model).includes("@edge trigger -> trigger from=bottom-left to=top-left")
);
const selfAgain = parseIvm(serializeGraph(self.model));
assert(
  "parse self edge",
  selfAgain.errors.length === 0 &&
    selfAgain.graph.edges[0].from === selfAgain.graph.edges[0].to &&
    selfAgain.graph.edges[0].fromSide === "bottom-left"
);
const corner = addEdge(base, "trigger", "think", { fromSide: "tr", toSide: "bl" });
assert("corner alias normalize", corner.ok && corner.model.edges[0].fromSide === "top-right" && corner.model.edges[0].toSide === "bottom-left");

const removed = removeSelection(first.model, { type: "node", id: "trigger" });
assert("delete node drops edges", removed.nodes.length === 1 && removed.edges.length === 0);

const host = document.getElementById("host");
const mounted = mountGraphEditor(host, {
  nodes: [
    { id: "a", label: "Alpha", x: 32, y: 32, kind: "action" },
    { id: "b", label: "Beta", x: 240, y: 32, kind: "decision" },
  ],
  edges: [{ from: "a", to: "b" }],
});
assert("dom nodes", host.querySelectorAll(".im-graph-node").length === 2);
assert("decision diamond", !!host.querySelector(".im-graph-diamond"));
assert("visible edge", !!host.querySelector(".im-graph-edge[marker-end]"));
assert("read-only has no edit bar", !host.querySelector(".im-graph-bar"));
assert("read-only has no ports", host.querySelectorAll(".im-graph-port").length === 0);
assert("read-only class", !!host.querySelector(".im-graph-readonly"));
mounted.destroy();
assert("destroy clears", host.innerHTML === "");

const emptyHost = document.createElement("div");
document.body.appendChild(emptyHost);
const emptyMount = mountGraphEditor(emptyHost, { nodes: [], edges: [] });
assert("empty copy", emptyHost.querySelector(".im-graph-empty")?.textContent.includes("empty"));
assert("empty has no add button", !emptyHost.querySelector("[data-action=add]"));
emptyMount.destroy();

const motionHost = document.createElement("div");
document.body.appendChild(motionHost);
const motion = mountGraphEditor(
  motionHost,
  {
    nodes: [
      { id: "a", label: "A", x: 8, y: 8, kind: "action" },
      { id: "b", label: "B", x: 200, y: 8, kind: "action" },
    ],
    edges: [{ from: "a", to: "b" }],
    animated: true,
  }
);
assert("marching edge", !!motionHost.querySelector(".im-graph-edge.is-animated"));
assert("traveling dot", !!motionHost.querySelector("animateMotion"));
assert("node pulse stage", motionHost.querySelector(".im-graph-stage")?.classList.contains("is-animated"));
assert("edge svg has no scene viewBox", !motionHost.querySelector(".im-graph-edges")?.getAttribute("viewBox"));
assert("arrow glyph viewBox stays", motionHost.querySelector("marker")?.getAttribute("viewBox") === "0 0 10 10");
assert("read-only animated has no ports", motionHost.querySelectorAll(".im-graph-port").length === 0);
assert("read-only animated has no motion toolbar", !motionHost.querySelector(".im-graph-motion-bar"));
motion.setLiveMotion({ quantity: 3, speed: 1.5, path: "curve", direction: "reverse" });
assert("live motion dots", motionHost.querySelectorAll("animateMotion").length === 3);
assert("live reverse", motionHost.querySelector("animateMotion")?.getAttribute("keyPoints") === "1;0");
assert("live curve path", /C /.test(motionHost.querySelector(".im-graph-edge.is-animated")?.getAttribute("d") || ""));
motion.destroy();

const preview = document.getElementById("preview");
const src = `# Flow

\`\`\`ivm
@graph
@node a: "A" x=8 y=8
\`\`\`

\`\`\`ivm
@slider r: 1..5 = 2
@svg
<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><circle r="{{r}}"/></svg>
\`\`\`
`;
const docMount = renderDocument(preview, src, { marked });
assert("preview graph", preview.querySelectorAll(".im-graph-node").length === 1);
assert("slider still mounts", !!preview.querySelector("input[type=range]"));
assert("preview graph is read-only", !!preview.querySelector(".im-graph-readonly"));
assert("preview has no add node", !preview.querySelector("[data-action=add]"));
docMount.destroy();

const replaced = replaceIvmFence(src, 0, '@graph\n@node z: "Z" x=8 y=8 kind=input\n');
assert("replaced first fence", replaced.includes('@node z: "Z"'));
assert("second fence kept", replaced.includes("@slider r:"));
const replacedSecond = replaceIvmFence(src, 1, "@slider r: 1..9 = 3\n@svg\n<svg/>\n");
assert("second fence replaced", replacedSecond.includes("1..9"));
assert("first fence kept", replacedSecond.includes('@node a: "A"'));

const portsHost = document.createElement("div");
document.body.appendChild(portsHost);
const portsMounted = mountGraphEditor(portsHost, {
  nodes: [{ id: "loop", label: "Loop", x: 40, y: 40, kind: "action" }],
  edges: [{ from: "loop", to: "loop", fromSide: "bottom-left", toSide: "top-left" }],
  animated: true,
  motion: { path: "curve", quantity: 2, direction: "forward", speed: 2, quantityFrom: "dots", speedFrom: "pace" },
});
assert("self edge drawn", !!portsHost.querySelector(".im-graph-edge"));
assert("read-only self-edge has no ports", portsHost.querySelectorAll(".im-graph-port").length === 0);
portsMounted.setLiveMotion({ quantity: 5, speed: 1.2 });
assert("live motion dots", portsHost.querySelectorAll("animateMotion").length === 5);
portsMounted.destroy();

// editable:true still exposes editor chrome (legacy / unit coverage)
const editHost = document.createElement("div");
document.body.appendChild(editHost);
let added = "";
const editMount = mountGraphEditor(editHost, { nodes: [], edges: [] }, {
  editable: true,
  onChange(model) {
    added = serializeGraph(model);
  },
});
assert("editable shows bar", !!editHost.querySelector(".im-graph-bar"));
editHost.querySelector("[data-action=add]").dispatchEvent(new window.Event("click", { bubbles: true }));
assert("editable add writes n1", added.includes('@node n1: "Node" x=32 y=32'), added);
editMount.destroy();

// P4: toolbar literal edits clear quantityFrom/speedFrom bindings
const boundModel = {
  nodes: [{ id: "a", label: "A", x: 0, y: 0, kind: "action" }],
  edges: [],
  animated: true,
  motion: { path: "curve", quantity: 2, direction: "forward", speed: 2.4, quantityFrom: "dots", speedFrom: "pace" },
};
const clearedQty = setMotion(boundModel, { quantity: 4 });
assert("literal quantity clears quantityFrom", clearedQty.motion.quantity === 4 && !clearedQty.motion.quantityFrom);
assert("literal quantity keeps speedFrom", clearedQty.motion.speedFrom === "pace");
const rebound = setMotion(clearedQty, { quantityFrom: "dots" });
assert("rebinding quantityFrom", rebound.motion.quantityFrom === "dots");
const shown = normalizeMotion(rebound.motion);
assert("normalize keeps binding", shown.quantityFrom === "dots");

const laneBody = `
@graph
@lane fe: "Front" y=0 height=100 fill=#eff6ff
@group api: "API"
@node a: "A" x=40 y=20 lane=fe group=api
@node b: "B" x=240 y=20 lane=fe group=api
@edge a -> b
`;
const laneP = parseIvm(laneBody);
assert("lane parse", laneP.errors.length === 0 && laneP.graph?.lanes?.length === 1, JSON.stringify(laneP.errors));
assert("group parse", laneP.graph?.groups?.[0]?.id === "api");
assert("node lane", laneP.graph?.nodes[0]?.lane === "fe");
const laneSer = serializeGraph(laneP.graph);
assert("serialize lane", /@lane fe:/.test(laneSer) && /lane=fe/.test(laneSer));
assert("serialize group", /@group api:/.test(laneSer) && /group=api/.test(laneSer));


// Zoom / pan viewport (CSS transform; model coords unchanged)
const zoomParsed = parseIvm(`@graph\n@node a: "A" x=40 y=40\n@node b: "B" x=200 y=40\n@edge a -> b\n`);
assert("graph zoom default on", zoomParsed.graph?.zoom === true);
const noz = parseIvm(`@graph nozoom\n@node a: "A" x=1 y=2\n`);
assert("graph nozoom", noz.graph?.zoom === false && noz.errors.length === 0, JSON.stringify(noz.errors));
const zoomHost = document.getElementById("host");
zoomHost.innerHTML = "";
const zoomMount = mountGraphEditor(zoomHost, zoomParsed.graph);
assert("zoomable canvas", !!zoomHost.querySelector(".im-graph-canvas.im-graph-zoomable"));
const stage = zoomHost.querySelector(".im-graph-stage");
const beforeX = zoomParsed.graph.nodes[0].x;
zoomHost.querySelector(".im-graph-canvas").dispatchEvent(
  new window.Event("wheel", { bubbles: true, cancelable: true })
);
// linkedom may not fully implement WheelEvent; call resetView and check API
assert("resetView API", typeof zoomMount.resetView === "function");
zoomMount.resetView();
assert("reset transform identity", !stage.style.transform || /scale\(1\)/.test(stage.style.transform) || stage.style.transform.includes("scale(1)"));
const afterModel = zoomMount.getModel();
assert("zoom does not mutate node x", afterModel.nodes[0].x === beforeX);
zoomMount.destroy();
const nozHost = document.createElement("div");
document.body.appendChild(nozHost);
const nozMount = mountGraphEditor(nozHost, noz.graph);
assert("nozoom skips zoomable", !nozHost.querySelector(".im-graph-zoomable"));
nozMount.destroy();
const serNoz = serializeGraph(noz.graph);
assert("serialize graph nozoom", /@graph nozoom\b/.test(serNoz), serNoz);


console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

