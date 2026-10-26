import { parseHTML, DOMParser } from "linkedom";
import { mountIvm, resetNamespaces } from "../src/render.js";

const { window, document } = parseHTML(
  "<!doctype html><html><body><div id='host'></div></body></html>"
);
globalThis.document = document;
globalThis.DOMParser = DOMParser;
globalThis.performance = { now: () => Date.now() };

// Deterministic rAF: queue on demand via drain()
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => {
  const id = rafQueue.length + 1;
  rafQueue.push({ id, cb });
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  const i = rafQueue.findIndex((x) => x.id === id);
  if (i >= 0) rafQueue.splice(i, 1);
};
function drainRaf(n = 5, dtMs = 50) {
  let t0 = 1000;
  for (let i = 0; i < n; i++) {
    const jobs = rafQueue.splice(0, rafQueue.length);
    t0 += dtMs;
    for (const job of jobs) job.cb(t0);
  }
}

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

console.log("=== render smoke ===");
resetNamespaces();

const host = document.getElementById("host");
const body = `
@slider amp: 5..60 = 30 step=1 "Amplitude"
@timer t: 0..100 = 0 speed=20 loop "Phase"
@let y = 40 - amp * sin(t * pi / 50)
@svg
<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="{{round(y,2)}}" r="{{amp}}" fill="#f472b6"/>
</svg>
`;

const mount = mountIvm(host, body);
assert("mounts controls", host.querySelectorAll("input[type=range]").length === 2);
assert("play button", !!host.querySelector("button.im-timer-btn"));
assert("svg present", !!svgScope(host).querySelector("svg circle"));
assert("controlled widget", host.classList.contains("im-ivm") && !host.classList.contains("im-ivm-static"));

const state0 = mount.getState();
assert("default amp", state0.amp === 30);
assert("default t", state0.t === 0);
assert("let y at t0", Math.abs(state0.y - 40) < 1e-9, String(state0.y));

const circle = svgScope(host).querySelector("svg circle");
assert("r bound", circle.getAttribute("r") === "30");
assert("cy bound", circle.getAttribute("cy") === "40");

// change slider
const ampInput = host.querySelector('input[data-var="amp"]');
ampInput.value = "50";
ampInput.dispatchEvent(new window.Event("input", { bubbles: true }));
const state1 = mount.getState();
assert("amp updated", state1.amp === 50);
assert("svg r updated", svgScope(host).querySelector("svg circle").getAttribute("r") === "50");

// timer play advances t and rebinds
const btn = host.querySelector("button.im-timer-btn");
btn.dispatchEvent(new window.Event("click", { bubbles: true }));
assert("playing label", btn.textContent === "Pause");
drainRaf(3, 100);
const state2 = mount.getState();
assert("timer advanced", state2.t > 0, String(state2.t));
assert("y changed", state2.y !== 40, String(state2.y));
const cy = svgScope(host).querySelector("svg circle").getAttribute("cy");
assert("cy rebound", cy !== "40", cy);

// destroy
mount.destroy();
assert("destroyed", host.innerHTML === "");

// namespace sharing
resetNamespaces();
const a = document.createElement("div");
const b = document.createElement("div");
document.body.appendChild(a);
document.body.appendChild(b);
mountIvm(
  a,
  `@ns share
@slider x: 0..10 = 3
@svg
<svg xmlns="http://www.w3.org/2000/svg"><text>{{x}}</text></svg>`
);
const m2 = mountIvm(
  b,
  `@ns share
@slider x: 0..10 = 0
@svg
<svg xmlns="http://www.w3.org/2000/svg"><text>{{x}}</text></svg>`
);
assert("ns seeds from first", m2.getState().x === 3, String(m2.getState().x));

// strips script via sanitize path
resetNamespaces();
const unsafeHost = document.createElement("div");
document.body.appendChild(unsafeHost);
mountIvm(
  unsafeHost,
  `@svg
<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="1"/></svg>`
);
const unsafeMarkup = svgScope(unsafeHost).innerHTML;
assert("sanitized script", !/<script\b/i.test(unsafeMarkup), unsafeMarkup);
assert("kept circle", /<circle\b/i.test(unsafeMarkup), unsafeMarkup);

resetNamespaces();
const animHost = document.createElement("div");
document.body.appendChild(animHost);
mountIvm(
  animHost,
  `@svg
<svg xmlns="http://www.w3.org/2000/svg">
  <style>
    @keyframes pulse { from { opacity: 0.2 } to { opacity: 1 } }
    .dot { animation: pulse 1.2s ease-in-out infinite; filter: url(#glow); }
  </style>
  <defs><filter id="glow"><feGaussianBlur stdDeviation="2"/></filter></defs>
  <circle class="dot" r="4" fill="#fff" filter="url(#glow)"/>
</svg>`
);
const animScope = svgScope(animHost);
assert("static figure", animHost.classList.contains("im-ivm-static"));
assert("no control row", !animHost.querySelector(".im-controls"));
assert("keyframes scoped", /@keyframes\s+pulse/.test(animScope.innerHTML), animScope.innerHTML.slice(0, 240));
assert("keyframes not in light dom", !/@keyframes/.test(animHost.innerHTML));
assert("animated circle", animScope.querySelector("circle")?.getAttribute("class") === "dot");

// slim @svg WxH wraps non-root markup; label falls back to name
resetNamespaces();
const slimHost = document.createElement("div");
document.body.appendChild(slimHost);
const slim = mountIvm(
  slimHost,
  `@slider amp: 5..55 = 28
@let y = 40 - amp * sind(0)
@svg 200x80
  <circle cx="100" cy="{{y}}" r="{{amp}}" fill="#f472b6"/>`
);
const slimScope = svgScope(slimHost);
assert("slim wraps svg", !!slimScope.querySelector("svg"));
assert("slim viewBox", slimScope.querySelector("svg").getAttribute("viewBox") === "0 0 200 80");
assert("slim r bound", slimScope.querySelector("circle").getAttribute("r") === "28");
assert("label fallback", slimHost.querySelector(".im-label-text").textContent === "amp");
slim.destroy();

// full root <svg> with WxH left alone (no double wrap)
resetNamespaces();
const fullHost = document.createElement("div");
document.body.appendChild(fullHost);
mountIvm(
  fullHost,
  `@svg 100x50
<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`
);
const fullScope = svgScope(fullHost);
assert("no double svg", fullScope.querySelectorAll("svg").length === 1);
assert("kept author viewBox", fullScope.querySelector("svg").getAttribute("viewBox") === "0 0 100 50");


{
  const body = `
@angle deg
@fn wave(x) = sin(x)
@phase hold: 1..3
@timer t: 0..4 = 1.5 speed=1
@let y = wave(90)
@let on = inPhase(t, "hold")
@svg 100x40
  <text>{{round(y,2)}} {{on}}</text>
`;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const m = mountIvm(host, body);
  const st = m.getState();
  assert("p2 angle deg", Math.abs(Number(st.y) - 1) < 1e-9, String(st.y));
  assert("p3 inPhase", st.on === true, String(st.on));
  m.destroy();
  host.remove();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
