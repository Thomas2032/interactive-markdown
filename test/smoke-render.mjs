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
assert("svg present", !!host.querySelector("svg circle"));

const state0 = mount.getState();
assert("default amp", state0.amp === 30);
assert("default t", state0.t === 0);
assert("let y at t0", Math.abs(state0.y - 40) < 1e-9, String(state0.y));

const circle = host.querySelector("svg circle");
assert("r bound", circle.getAttribute("r") === "30");
assert("cy bound", circle.getAttribute("cy") === "40");

// change slider
const ampInput = host.querySelector('input[data-var="amp"]');
ampInput.value = "50";
ampInput.dispatchEvent(new window.Event("input", { bubbles: true }));
const state1 = mount.getState();
assert("amp updated", state1.amp === 50);
assert("svg r updated", host.querySelector("svg circle").getAttribute("r") === "50");

// timer play advances t and rebinds
const btn = host.querySelector("button.im-timer-btn");
btn.dispatchEvent(new window.Event("click", { bubbles: true }));
assert("playing label", btn.textContent === "Pause");
drainRaf(3, 100);
const state2 = mount.getState();
assert("timer advanced", state2.t > 0, String(state2.t));
assert("y changed", state2.y !== 40, String(state2.y));
const cy = host.querySelector("svg circle").getAttribute("cy");
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
assert("sanitized script", !/script/i.test(unsafeHost.innerHTML));
assert("kept circle", /circle/i.test(unsafeHost.innerHTML));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
