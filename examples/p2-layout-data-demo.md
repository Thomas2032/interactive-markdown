# IVM P2 demo — layout, `@data`, coordinate helpers

Auto-layout for graphs, CSV tables into series, and safer SVG pixel math (`remap` / `px` / `py` / `@anchor`).

## `@graph layout=dagre`

Omit `x=` / `y=` and let IVM place nodes. Explicit coordinates (either `x=` or `y=`) stay put.

```ivm
@graph layout=dagre
@node start: "Start" kind=input
@node plan: "Plan"
@node act: "Act"
@node done: "Done" kind=output
@edge start -> plan
@edge plan -> act
@edge act -> done
@edge act -> plan from=bottom to=bottom
```

Pin one node, auto-place the rest (`layout=flow` is an alias of `dagre`):

```ivm
@graph layout=flow
@lane work: "Work" y=8 height=140 fill=#eff6ff
@node hub: "Hub" x=40 y=48 kind=input lane=work
@node a: "A" lane=work
@node b: "B" lane=work
@edge hub -> a
@edge hub -> b
```

## `@data` → series

Declare a skimmable table once; `@series from=name` turns bare column ids into `name_col` arrays.

```ivm
@data sales
month, value
Jan, 40
Feb, 55
Mar, 48
@plot 480x260 legend
@axis x: cats=Jan,Feb,Mar "Month"
@axis y: 0..80 step=20 "Sales"
@series kind=bar from=sales fill=#7c3aed "Sales"
  cats = month
  y = value
@annotate x=1 y=55 "peak" dy=-12
```

Scatter from the same table style:

```ivm
@data pts
x, y
1, 2
2, 5
3, 3
4, 7
@plot 420x240
@axis x: 0..5 step=1
@axis y: 0..10 step=2
@series kind=scatter from=pts marker=circle stroke=#db2777
  x = x
  y = y
```

## `remap` / `px` / `py` + `@anchor`

Prefer helpers over hand-rolled `170 - amp * 80` math. `@anchor tip x=… y=…` injects `tip_x` / `tip_y`.

```ivm
@slider amp: 0..1 = 0.65 step=0.05 "Amplitude"
@anchor mid x=100 y=40
@let ballY = remap(amp, 0, 1, 70, 12)
@let ballX = px(amp, 0, 1, 180)
@svg 200x80
  <rect width="200" height="80" rx="10" fill="#0f172a"/>
  <line x1="20" y1="{{mid_y}}" x2="180" y2="{{mid_y}}" stroke="#334155" stroke-width="2"/>
  <circle cx="{{20 + ballX}}" cy="{{ballY}}" r="10" fill="#38bdf8"/>
  <text x="12" y="18" fill="#94a3b8" font-size="11" font-family="system-ui,sans-serif">amp={{amp}} · remap/px</text>
```

`py(v, lo, hi, h)` flips for SVG y-down (high data value → small pixel y).
