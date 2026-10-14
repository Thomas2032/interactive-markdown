# A small graph

This fence is a directed graph. Drag a node to move it, and drag a dot on its top, right, bottom, or left onto another node to connect them. The source on the left updates when you let go.

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

Double-click a label to rename it. Choose a kind, then add a node, or change the kind of the node you have selected. Delete removes the selected node or edge.
