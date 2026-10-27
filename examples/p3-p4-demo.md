# IVM P3 + P4 demo

Plot expressiveness (bar / scatter / categorical, legend + annotate, zoom/pan, dual axes), graph lanes/groups, first-class `@scrub`, and `@ns` typo warnings.

## Bar + scatter + categorical + dual axis

Scroll to zoom, drag to pan, double-click to reset (`@plot zoom`). Legend sits top-left; callout marks the peak bar.

```ivm
@plot 520x300 zoom legend=top-left
@axis x: cats=Jan,Feb,Mar "Month"
@axis y: 0..80 step=20 "Sales"
@axis y2: 0..10 step=2 "NPS"
@series sales kind=bar fill=#7c3aed "Sales"
  cats = Jan, Feb, Mar
  y = [40, 55, 48]
@series nps kind=scatter axis=y2 marker=diamond size=6 stroke=#db2777 fill=#fce7f3 "NPS"
  x = [0, 1, 2]
  y = [3, 8, 5]
@annotate x=1 y=55 "best month" dy=-14
```

## Graph lanes + groups

Swimlanes (`@lane`) and a bounding `@group` around related nodes.

```ivm
@graph
@lane frontend: "Frontend" y=8 height=120 fill=#eff6ff
@lane backend: "Backend" y=152 height=130 fill=#f0fdf4
@group api: "API surface"
@node ui: "UI" x=48 y=40 kind=input lane=frontend group=api
@node gateway: "Gateway" x=280 y=40 lane=frontend group=api
@node worker: "Worker" x=48 y=188 kind=action lane=backend
@node db: "DB" x=280 y=188 kind=output lane=backend
@edge ui -> gateway
@edge gateway -> worker
@edge worker -> db
```

## First-class `@scrub`

Bind a timer to CSS animations on `.im-scrub` (no DIY `animation-delay` math).

```ivm
@timer t: 0..4 = 0 speed=0.5 step=0.02 "Scrub (s)"
@scrub t duration=4
@svg 420x120
  <style>
    .im-scrub {
      animation: slide 4s linear both;
    }
    @keyframes slide {
      from { transform: translate(0px, 0px); }
      to { transform: translate(300px, 0px); }
    }
  </style>
  <rect width="420" height="120" rx="12" fill="#0f172a"/>
  <text x="16" y="28" fill="#94a3b8" font-size="12" font-family="system-ui,sans-serif">t={{round(t,2)}} · @scrub pauses + sets delay</text>
  <g class="im-scrub" transform="translate(40 70)">
    <circle r="16" fill="#38bdf8"/>
  </g>
  <line x1="40" y1="96" x2="360" y2="96" stroke="#334155" stroke-width="2"/>
```

## `@ns` typo warning

`ivm check` warns when namespaces look like typos (`demo` vs `demmo`) or differ only by case. Fix to share controls.

```ivm
@ns demo
@slider amp: 0.5..1.5 = 1 step=0.05 "Amp"
@svg 160x60
  <rect width="160" height="60" rx="8" fill="#0f172a"/>
  <circle cx="{{40 + amp * 40}}" cy="30" r="12" fill="#38bdf8"/>
```

```ivm
@ns demmo
@slider amp: 0.5..1.5 = 1 step=0.05 "Amp (orphan ns)"
@svg 160x60
  <rect width="160" height="60" rx="8" fill="#1e293b"/>
  <text x="12" y="34" fill="#f87171" font-size="12" font-family="system-ui,sans-serif">wrong @ns</text>
```

Run `npm run check -- examples/p3-p4-demo.md` to see the `@ns` warning.
