# Golden IVM snippets (0.7.0)

Short **natural-language ask → working fence** pairs for humans and LLMs. Long keywords only. Every fence uses dialect available in **interactive-markdown 0.7.0**.

Mixing reminder: `@plot` may end with trailing `@svg`; `@graph` stays alone (share state across fences with `@ns`). Prefer `@angle deg` or `sind`/`cosd` when thinking in degrees.

---

## 1. Normal density plot

**Ask:** Plot a Gaussian PDF with sliders for mean and std dev.

```ivm
@plot
@axis x: -10..10 step=2 "x"
@axis y: 0..0.8 step=0.2 "density"
@slider mu: -5..5 = 0 step=0.1 "μ (mean)"
@slider sigma: 0.5..4 = 1.5 step=0.1 "σ (std dev)"
@series density stroke=#6d28d9 fill=#7c3aed fillOpacity=0.25
  y = (1/(sigma*sqrt(2*pi))) * exp(-0.5*((x-mu)/sigma)^2)
```

**Why `@plot`:** Live y=f(x) curves belong on axes the dialect builds for you.

---

## 2. Log–log axes

**Ask:** Show y = x^1.5 on log axes.

```ivm
@plot 480x300
@axis x: 0.1..1000 scale=log "x (log)"
@axis y: 0.01..100 scale=log "y (log)"
@series power stroke=#7c3aed width=2.5 "y = x^1.5"
  y = x ^ 1.5
```

**Why `@plot`:** Axis `scale=log` is a plot feature — do not fake log ticks in SVG.

---

## 3. Symlog axis

**Ask:** Plot a curve that crosses zero with a symmetric log y-axis.

```ivm
@plot 480x300
@axis x: -4..4 step=1 "x"
@axis y: -100..100 scale=symlog linthresh=1 "y (symlog)"
@series cubic stroke=#2563eb width=2.5 "x^3"
  y = x ^ 3
```

**Why `@plot`:** `scale=symlog` (with `linthresh`) handles signed magnitudes that plain log cannot.

---

## 4. Parametric circle

**Ask:** Draw a circle with a scale slider using parametric equations.

```ivm
@plot 480x360 lockAspect
@axis x: -2.2..2.2 step=1 "x"
@axis y: -2.2..2.2 step=1 "y"
@slider k: 0.4..1.6 = 1 step=0.05 "Scale"
@series circle stroke=#2563eb width=2.25 "circle"
  x = k * cos(t)
  y = k * sin(t)
  t = 0..6.2832
```

**Why `@plot`:** Parametric series (`x=` / `y=` / `t=`) are first-class plot kinds.

---

## 5. Polar rose

**Ask:** Plot a three-petal rose curve in polar form.

```ivm
@plot 480x360 lockAspect
@axis x: -2.2..2.2 step=1 "x"
@axis y: -2.2..2.2 step=1 "y"
@slider k: 0.4..1.6 = 1 step=0.05 "Scale"
@series rose stroke=#db2777 width=2 "rose"
  r = k * cos(3 * theta)
  theta = 0..6.2832
```

**Why `@plot`:** Polar series (`r=` / `theta=`) map to Cartesian axes without hand SVG.

---

## 6. Plot + SVG overlay

**Ask:** Plot sine and cosine with a live peak label and marker on the chart.

```ivm
@plot 520x340
@axis x: -3.5..3.5 step=1 "x"
@axis y: -1.2..1.2 step=0.4 "y"
@slider amp: 0.4..1.2 = 1 step=0.05 "Amplitude"
@series sine stroke=#6d28d9 width=2.5 "sin"
  y = amp * sin(x)
@series cosine stroke=#0891b2 width=2.5 "cos"
  y = amp * cos(x)
@svg
  <text x="90" y="42" font-size="13" font-family="system-ui,sans-serif" fill="#374151">peak ≈ {{round(amp, 2)}}</text>
  <circle cx="260" cy="{{170 - amp * 80}}" r="5" fill="#6d28d9"/>
```

**Why `@plot` + trailing `@svg`:** Curves stay as series; chrome and callouts ride the plot viewBox.

---

## 7. Unit circle with `@angle deg` + `@fn`

**Ask:** Unit circle where `sin`/`cos` take degrees and a helper returns the tip point.

```ivm
@angle deg
@slider theta: 0..360 = 45 step=1 deg "θ (°)"
@fn tip(a) = [100 + 70 * cos(a), 100 - 70 * sin(a)]
@let p = tip(theta)
@svg 200x200
  <rect width="200" height="200" fill="#0f172a"/>
  <circle cx="100" cy="100" r="70" fill="none" stroke="#334155" stroke-width="2"/>
  <line x1="100" y1="100" x2="{{nth(p,0)}}" y2="{{nth(p,1)}}" stroke="#38bdf8" stroke-width="3"/>
  <circle cx="{{nth(p,0)}}" cy="{{nth(p,1)}}" r="6" fill="#f472b6"/>
  <text x="12" y="24" fill="#e2e8f0" font-size="13" font-family="system-ui,sans-serif">sin(θ)={{round(sin(theta),3)}}</text>
```

**Why `@svg`:** Custom geometry + degree-mode trig; `@fn` keeps the tip math reusable.

---

## 8. `@phase` + timer scrub

**Ask:** Scrub a CSS animation through named rise / hold / fall phases.

```ivm
@timer t: 0..4 = 0 speed=0.5 step=0.02 "Scrub (s)"
@phase rise: 0..1.2
@phase hold: 1.2..2.8
@phase fall: 2.8..4
@let label = phaseAt(t)
@let glow = inPhase(t, "hold") ? 1 : 0.35
@svg 420x140
  <style>
    .ball {
      animation: slide 4s linear both;
      animation-play-state: paused;
      animation-delay: -{{t}}s;
    }
    @keyframes slide {
      from { transform: translate(0px, 0px); }
      to { transform: translate(320px, 0px); }
    }
  </style>
  <rect width="420" height="140" rx="12" fill="#0f172a"/>
  <text x="16" y="28" fill="#94a3b8" font-size="12" font-family="system-ui,sans-serif">phase={{label}} · riseT={{round(phaseT(t,"rise"),2)}}</text>
  <g class="ball" transform="translate(40 80)">
    <circle r="18" fill="#38bdf8" opacity="{{glow}}"/>
    <circle r="18" fill="none" stroke="#f472b6" stroke-width="3" opacity="{{inPhase(t,"hold") ? 1 : 0}}"/>
  </g>
  <line x1="40" y1="110" x2="360" y2="110" stroke="#334155" stroke-width="2"/>
```

**Why `@svg`:** Phase helpers + paused CSS `animation-delay` scrub are SVG-depth features.

---

## 9. Agent loop graph with controls + `@animate`

**Ask:** Animated agent Think → Act → Observe loop with sliders for dots and pace.

```ivm
@slider dots: 1..8 = 3 step=1 "Dots"
@slider pace: 0.6..6 = 2.4 step=0.2 "Seconds / lap"
@graph
@animate path=curve quantity=dots speed=pace direction=forward
@node start: "Start" x=32 y=120 kind=input
@node agent: "Agent" x=240 y=120
@node check: "Done?" x=460 y=48 kind=decision
@node out: "Output" x=460 y=208 kind=output
@edge start -> agent
@edge agent -> check from=top-right to=left
@edge check -> out from=bottom to=top
@edge agent -> agent from=bottom-left to=top-left
```

**Why `@graph`:** Boxes, edges, and env-bound traveling dots are the graph mode.

---

## 10. Self-edge and corner ports

**Ask:** Retry loop on one node using a self-edge and corner ports.

```ivm
@graph
@animate path=curve quantity=2 speed=2.4
@node start: "Start" x=40 y=100 kind=input
@node work: "Work" x=260 y=100
@node out: "Done" x=480 y=100 kind=output
@edge start -> work
@edge work -> out
@edge work -> work from=bottom-left to=top-left
```

**Why `@graph`:** Self-edges and `tl`/`tr`/`bl`/`br` (or long) ports are graph-only.

---

## 11–12. Two fences sharing `@ns`

**Ask:** One slider moves a marker in an SVG and also drives a graph in another fence.

```ivm
@ns demo
@slider scale: 0.5..2 = 1 step=0.05 "Scale"
@let tip = 40 + 50 * scale
@svg 220x90
  <rect width="220" height="90" rx="10" fill="#0f172a"/>
  <circle cx="{{tip}}" cy="45" r="14" fill="#38bdf8"/>
  <text x="12" y="22" fill="#94a3b8" font-size="12" font-family="system-ui,sans-serif">scale={{round(scale,2)}}</text>
```

```ivm
@ns demo
@slider dots: 1..6 = 2 step=1 "Dots"
@slider pace: 0.8..5 = 2.4 step=0.2 "Seconds / lap"
@graph
@animate path=curve quantity=dots speed=pace direction=forward
@node start: "Start" x=40 y=100 kind=input
@node work: "Work" x=260 y=100
@node out: "Done" x=480 y=100 kind=output
@edge start -> work
@edge work -> out
@edge work -> work from=bottom-left to=top-left
```

**Why two fences + `@ns`:** Graph cannot share a fence with SVG; the same namespace name syncs `scale` (and other controls) across both.

---

## 13. Amplitude SVG wave

**Ask:** Dual-phase wave whose height follows an amplitude slider and timer.

```ivm
@slider amp: 5..55 = 28
@timer t: 0..100 = 0 speed=25
@let y = 40 - amp * sind(t * 3.6)
@let y2 = 40 - (amp * 0.55) * sind(t * 3.6 + 68.75)
@svg 200x80
  <rect width="200" height="80" rx="4" fill="#0f172a"/>
  <line x1="10" y1="40" x2="190" y2="40" stroke="#334155" stroke-width="1"/>
  <path d="M10 40 Q55 {{y}} 100 40 T190 40" fill="none" stroke="#38bdf8" stroke-width="3"/>
  <path d="M10 40 Q55 {{y2}} 100 40 T190 40" fill="none" stroke="#a78bfa" stroke-width="2" opacity="0.85"/>
  <circle cx="100" cy="{{y}}" r="5" fill="#f472b6"/>
```

**Why `@svg`:** Custom path chrome and markers; `sind` keeps degree-style phase math safe.

---

## 14. Circular motion (radius + spin)

**Ask:** Point on a circle with radius, base angle, and a spinning timer.

```ivm
@slider radius: 10..80 = 50
@slider angle: 0..360 = 45 deg
@timer spin: 0..360 = 0 speed=40 deg
@let a = angle + spin
@let x = round(100 + radius * cosd(a), 2)
@let y = round(100 + radius * sind(a), 2)
@svg 200x200
  <rect width="200" height="200" rx="6" fill="#0f172a"/>
  <circle cx="100" cy="100" r="{{radius}}" fill="none" stroke="#475569" stroke-width="2"/>
  <line x1="100" y1="100" x2="{{x}}" y2="{{y}}" stroke="#38bdf8" stroke-width="2"/>
  <circle cx="100" cy="100" r="3" fill="#94a3b8"/>
  <circle cx="{{x}}" cy="{{y}}" r="7" fill="#f472b6"/>
  <text x="8" y="18" fill="#94a3b8" font-size="10" font-family="ui-monospace, monospace">a={{round(a,1)}}°</text>
```

**Why `@svg`:** Pixel geometry and labels; `cosd`/`sind` match the degree sliders.

---

## 15. Directed graph (no animation)

**Ask:** Simple Think / Act / Done flowchart rendered from `@graph`.

```ivm
@graph
@node trigger: "Trigger" x=24 y=40 kind=input
@node think: "Think" x=220 y=40
@node act: "Act" x=220 y=188
@node done: "Done?" x=430 y=40 kind=decision
@node output: "Output" x=430 y=188 kind=output
@edge trigger -> think
@edge think -> done
@edge think -> act
@edge act -> output
```

**Why `@graph`:** Static node-and-edge structure without inventing SVG boxes.

---

## 16. `@fn` macros on a plot (+ overlay)

**Ask:** Reuse wave/bump macros as series, with a dashed marker polyline overlay.

```ivm
@slider amp: 0.4..1.4 = 1 step=0.05 "Amplitude"
@fn wave(x) = amp * sin(x)
@fn bump(x) = amp * cos(x)
@let xs = range(-3, 3, 1)
@let ys = map(xs, wave)
@let peak = reduce(ys, "acc > _ ? acc : _", -999)
@let markers = points(map(xs, "_ * 40 + 200"), map(ys, "170 - _ * 60"))
@plot 480x280 legend
@axis x: -3.2..3.2 step=1 "x"
@axis y: -1.5..1.5 step=0.5 "y"
@series sine stroke=#7c3aed width=2.5 "wave(x)"
  y = wave(x)
@series cosine stroke=#0891b2 width=2 "bump(x)"
  y = bump(x)
@svg
  <polyline points="{{markers}}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="72" y="36" font-size="12" font-family="system-ui,sans-serif" fill="#374151">peak ≈ {{round(peak, 3)}} · n={{len(xs)}}</text>
```

**Why `@plot` + `@svg`:** Series call `@fn`; arrays/`points` feed overlay chrome.

---

## Sources

Trimmed from repo examples: `normal-density`, `amplitude`, `circular-motion`, `graph`, `agent-loop` / `p1-demo`, `p0-demo`, `p2-p3-demo`, `p4-demo`. Symlog (#3) is dialect-only (no dedicated example file).
