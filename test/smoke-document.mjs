import { readFileSync } from "node:fs";
import { parseHTML, DOMParser } from "linkedom";
import { marked } from "marked";
import { insertFeature, parseDocument, serializeDocument, updateBlock } from "../src/document.js";
import { mountDocumentEditor } from "../src/document-editor.js";

const { window, document } = parseHTML(
  "<!doctype html><html><body><div id='host'></div></body></html>"
);
globalThis.document = document;
globalThis.DOMParser = DOMParser;
globalThis.window = window;
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

const host = document.getElementById("host");
let seen = null;
const editor = mountDocumentEditor(host, "", {
  onChange(markdown) {
    seen = markdown;
  },
});
assert("mount does not write", seen === null);
const button = host.querySelector("[data-add=slider]");
button.dispatchEvent(new window.Event("click", { bubbles: true }));
assert("add slider writes @slider", typeof seen === "string" && /@slider\s+s1:/.test(seen), seen);
const label = host.querySelector('.im-doc-inspector [data-field="label"]');
label.value = "Amplitude";
label.dispatchEvent(new window.Event("input", { bubbles: true }));
assert("label edit keeps the field", label.isConnected && label.value === "Amplitude");
assert("label edit writes the source", /@slider s1:.* "Amplitude"/.test(seen), seen);
editor.destroy();

const graphHost = document.createElement("div");
document.body.appendChild(graphHost);
let graphSeen = null;
mountDocumentEditor(graphHost, read("graph.md"), {
  onChange(markdown) {
    graphSeen = markdown;
  },
});
const addNode = graphHost.querySelector('.im-graph-bar [data-action="add"]');
addNode.dispatchEvent(new window.Event("click", { bubbles: true }));
assert("graph add writes a node", typeof graphSeen === "string" && /@node n1:/.test(graphSeen), graphSeen);
assert("graph.md stays still", graphSeen && !/@animate/.test(graphSeen));
assert("graph add leaves the canvas mounted", !!graphHost.querySelector(".im-graph-canvas"));

const proseHost = document.createElement("div");
document.body.appendChild(proseHost);
mountDocumentEditor(proseHost, read("amplitude.md"), { marked });
const prose = proseHost.querySelectorAll(".im-doc-prose");
assert("prose regions", prose.length === 2);
assert("heading renders as html", prose[0]?.querySelector("h1")?.textContent === "Wave amplitude");
assert("later prose renders as html", prose[1]?.querySelector("h2")?.textContent === "Tips");
assert("prose is not wrapped in a block", ![...prose].some((el) => el.closest(".im-doc-block")));
assert("one interactive block", proseHost.querySelectorAll(".im-doc-block").length === 1);

const dragHost = document.createElement("div");
document.body.appendChild(dragHost);
let dragSeen = "";
mountDocumentEditor(dragHost, "# Wave amplitude\n\nHello\n", {
  onChange(markdown) {
    dragSeen = markdown;
  },
});
const headingBtn = dragHost.querySelector("[data-add=heading]");
const point = (type, x, y) => {
  const event = new window.Event(type, { bubbles: true });
  event.clientX = x;
  event.clientY = y;
  event.button = 0;
  event.pointerId = 1;
  return event;
};
headingBtn.dispatchEvent(point("pointerdown", 10, 10));
document.dispatchEvent(point("pointermove", 12, 48));
document.dispatchEvent(point("pointerup", 12, 48));
headingBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
assert("drag snap inserts one heading", dragSeen.startsWith("## Heading\n"), dragSeen);
assert("drag does not also click-add", dragSeen.split("## Heading").length === 2, dragSeen);

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

// --- P4 editor polish ---
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

const p4Host = document.getElementById("host");
p4Host.innerHTML = "";
const statuses = [];
const envStore = new Map();
const namespaces = new Map();
const p4Mount = mountDocumentEditor(p4Host, read("p4-demo.md"), {
  envStore,
  namespaces,
  onStatus(msg) {
    statuses.push(msg);
  },
});
assert("doc editor mounts", !!p4Host.querySelector(".im-doc"));

function findGraphBlock() {
  return [...p4Host.querySelectorAll(".im-doc-block")].find((el) =>
    el.querySelector(".im-doc-kind")?.textContent?.toLowerCase().includes("graph")
  );
}

const graphSection = findGraphBlock();
assert("graph block present", !!graphSection);
assert("copy fence button", !!graphSection.querySelector('[data-action="copy-fence"]'));
assert("reset env button", !!graphSection.querySelector('[data-action="reset-env"]'));

// select graph to open inspector (paint rebuilds DOM — re-query afterward)
graphSection.querySelector('[data-action="select"]')?.click();
const graphSelected = findGraphBlock();
assert("graph selected", !!graphSelected && graphSelected.classList.contains("is-selected"));
const nsLabel = [...p4Host.querySelectorAll(".im-doc-field span")].find((s) =>
  /Namespace \(@ns\)/.test(s.textContent || "")
);
assert("namespace label", !!nsLabel);
assert("namespace help", !!p4Host.querySelector(".im-doc-ns .im-doc-help"));

// seed env then reset — remount restores fence defaults into the store
envStore.set("ivm:0", { scale: 1.8 });
envStore.set("ivm:1", { dots: 5, pace: 4 });
namespaces.set("demo", { scale: 1.8, dots: 5, pace: 4 });
graphSelected.querySelector('[data-action="reset-env"]')?.click();
assert("reset status", statuses.some((s) => /Env reset/.test(s)), statuses.join(" | "));
const nsAfter = namespaces.get("demo") || {};
assert(
  "reset restores ns defaults",
  Number(nsAfter.dots) === 2 && Number(nsAfter.pace) === 2.4,
  JSON.stringify(nsAfter)
);
const graphEnv = envStore.get("ivm:1") || {};
assert(
  "reset restores graph env defaults",
  Number(graphEnv.dots) === 2 && Number(graphEnv.pace) === 2.4,
  JSON.stringify(graphEnv)
);

findGraphBlock()?.querySelector('[data-action="copy-fence"]')?.click();
assert("copy status", statuses.some((s) => /Copied IVM fence/.test(s)), statuses.join(" | "));

p4Mount.destroy();


console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
