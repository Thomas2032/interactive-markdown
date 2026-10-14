# Agent loop

One pass through an agent: a trigger starts the loop, then think, act, and observe. Done either returns the output or sends the run back to think. Memory feeds think, and act can call tools. The dots travel those edges.

```ivm
@graph
@animate path=ortho quantity=3 direction=forward speed=2.2
@node trigger: "Trigger" x=16 y=16 kind=input
@node output: "Output" x=688 y=16 kind=output
@node think: "Think" x=16 y=148
@node act: "Act" x=248 y=148
@node observe: "Observe" x=480 y=148
@node done: "Done?" x=480 y=292 kind=decision
@node memory: "Memory" x=16 y=436
@node tools: "Tools" x=248 y=436
@edge trigger -> think from=bottom to=top
@edge think -> act
@edge act -> observe
@edge observe -> done from=bottom to=top
@edge done -> output from=right to=bottom
@edge done -> think from=bottom to=left
@edge memory -> think from=top to=bottom
@edge act -> tools from=bottom to=top
```

Drag any side dot to reconnect a node. On the canvas, change the path, quantity, direction, or seconds and the source updates.
