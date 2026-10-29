# A small graph

This fence is a directed graph. Edit `@node` / `@edge` in the source — the preview on the right shows the diagram.

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

Node `kind` can be `input`, `action` (default), `output`, or `decision`. Use `@graph layout=dagre` to auto-place nodes that omit both `x=` and `y=`. Preview zoom/pan is on by default: scroll to zoom, drag empty canvas to pan, double-click empty area to reset (`nozoom` to disable).
