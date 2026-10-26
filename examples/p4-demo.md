# IVM P4 demo

Editor polish: example picker stays on the loaded file, clearer **Namespace (@ns)** inspector fields, and **Copy fence** / **Reset env** on Graph editor blocks.

## Shared namespace + graph

Two fences share `@ns demo`. Move **Scale** in either place — the other follows. In the **Graph editor** tab, select the Graph block to see **Namespace (@ns)** help, then use **Copy fence** or **Reset env**.

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

Open **Examples → p4-demo.md** — the picker should stay on `p4-demo.md`. Switch to **Graph editor**, select the Graph block, try **Copy fence** and **Reset env** after moving the sliders.
