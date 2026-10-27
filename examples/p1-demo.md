# IVM P1 demo

Graph controls (with env-bound animation), self-edges, corner ports, shared `@ns` env, and plot hover tooltips.

## Graph + controls + self-edge + corner ports

Sliders drive `@animate` **quantity** and **speed**. The agent node has a self-edge (retry loop) using corner ports.

```ivm
@slider dots: 1..8 = 3 step=1 "Dots"
@slider pace: 0.6..6 = 2.4 step=0.2 "Seconds / lap"
@let hops = dots
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

Drag the **Dots** or **Seconds / lap** sliders — traveling dots update live in the read-only graph preview.

## Plot hover tooltip

Move the pointer near a curve to read **series**, **x**, and **y**.

```ivm
@plot 520x300 legend
@axis x: -3.2..3.2 step=1 "x"
@axis y: -1.2..1.2 step=0.4 "y"
@slider amp: 0.4..1.2 = 1 step=0.05 "Amplitude"
@series sine stroke=#7c3aed width=2.5 "sin"
  y = amp * sin(x)
@series cosine stroke=#0891b2 width=2.5 "cos"
  y = amp * cos(x)
```
