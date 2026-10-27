# IVM LLM protocol (compact)

Embed this block in prompts. Dialect: Interactive Markdown **0.11.0**. Fence info string: **`ivm`**.

## Intent → mode

| Ask | Mode | First lines |
|-----|------|-------------|
| Curve / density / bar / scatter / log axes / parametric / polar | **plot** | `@plot` … `@axis` … `@series` |
| Custom drawing, glyphs, chrome, CSS/SMIL animation | **svg** | controls… then `@svg WxH` + markup |
| Flowchart / boxes & arrows / swimlanes | **graph** | `@graph layout=dagre` … `@node` … `@edge` |
| Shared sliders across figures | any | same `@ns name` on each fence |
| No live controls needed | — | **plain Markdown only** (skip IVM) |

## Mixing rules

- One **mode** per fence. Controls (`@slider` `@timer` `@input` `@toggle` `@let` `@fn` `@angle` `@phase` `@ns` `@scrub` `@data` `@anchor`) allowed in every mode.
- `@plot` may end with a trailing `@svg` overlay (plot viewBox `0 0 W H`).
- `@graph` is exclusive of `@plot` and `@svg`. Put a chart beside a flowchart in **two fences**; share state with `@ns`.
- Graph preview is **read-only** — edit nodes/edges in source text only.

## Canonical control lines (prefer long names)

```
@ns shared
@slider name: min..max = def [step=S] [deg|rad] ["Label"]
@timer name: min..max = def [speed=N] [step=S] [loop|noloop] [deg|rad] ["Label"]
@input name: "default" ["Label"]
@toggle name: true|false ["Label"]
@let name = expr
@fn name(a,b) = expr
@angle deg|rad
@phase name: min..max
@scrub name duration=N [selector=.im-scrub]
@data name
header1, header2
v11, v12
@anchor name x=N y=N
```

Defaults: `step=1`, timer `loop` true, `speed=30`. Omit `"Label"` → UI shows the variable name.

**Short aliases (token savings OK when generating):** `@s`←`@slider` `@t`←`@timer` `@i`←`@input` `@b`←`@toggle` `@l`←`@let` `@f`←`@fn` · `@calc`≡`@let` (prefer `@let`) · `@mode`≡`@angle`.

## Plot / SVG / graph kernels

```
@plot [WxH] [grid|nogrid] [legend|nolegend|legend=pos] [lockAspect] [zoom]
@axis x|y|y2: min..max [step=S] [scale=linear|log|symlog|categorical] [cats=A,B] [linthresh=N] ["Label"]
@series [id] [kind=y|bar|scatter|parametric|polar] [from=dataName] [axis=y|y2] [marker=circle|square|diamond] [size=N] [stroke=#hex] [fill=#hex] [fillOpacity=N] [width=N] [label="Name"]
  y = expr                    # Cartesian free var x
  # or parametric: x=… / y=… / t=min..max
  # or polar: r=… / theta=min..max
  # or bar: kind=bar + cats=… + y=…
  # or scatter: kind=scatter + x=… + y=…
@legend pos=top-right|top-left|bottom-right|bottom-left
@annotate x=N y=N "text" [dx=] [dy=] [axis=y|y2]
@grid on|off

@svg [WxH]
  <!-- markup; bind with {{expr}} only -->

@graph [layout=dagre|flow|layered]
@lane id: "Label" y=N [height=H] [fill=#hex]
@group id: "Label"
@node id: "Label" [x=N] [y=N] kind=action|input|output|decision [lane=id] [group=id]
@edge a -> b [from=side] [to=side]   # sides: left|right|top|bottom|top-left|… (tl|tr|bl|br)
@animate [path=ortho|straight|curve] [quantity=N|name] [direction=forward|reverse] [speed=seconds|name]
```

Prefer `@data` + `@series … from=table` for tabular asks. Prefer `layout=dagre` and omit both `x=`/`y=` on nodes.

## Expressions

`{{expr}}` in SVG only. Ops: `+ - * / % ^ **` compare `&& || !` ternary `?:`. Arrays: `[…]` `range` `map` `reduce` `points`.

**Fns:** `abs sqrt pow exp ln log sin cos tan asin acos atan atan2 sind cosd tand asind acosd atand round floor ceil trunc sign min max clamp mod lerp remap px py deg rad len nth first last sum mean join range map reduce points inPhase phaseT phaseAt`

**Consts:** `pi` `e` `tau`

**Angle footgun:** default `sin`/`cos`/`tan` = **radians**. Use `@angle deg` or always-safe `sind`/`cosd`/`tand`. Do not assume `sin(45)` is degrees.

## Generation discipline

1. Declare controls / `@data` / `@fn` **before** use; one mode per fence.
2. Prefer `@plot` + `@data` over raw SVG axes; prefer `layout=dagre` over handmade coords.
3. Prefer long directive names for humans; short aliases OK for compactness.
4. Do **not** invent directives, JS, Mustache beyond `{{…}}`, or unknown tags (`@chart`, etc.).
5. Interactivity only where it helps; otherwise plain Markdown.
6. Compose: several small fences + `@ns` > one mega-fence.
7. After emit: `ivm check --json`; rewrite **only** fences with errors using `line` + `hint`.
8. Skip IVM entirely when the answer needs no live controls, plots, SVG, or graphs.

## Tiny exemplars

````
```ivm
@slider amp: 5..55 = 28
@timer t: 0..100 = 0 speed=25
@let y = 40 - amp * sind(t * 3.6)
@svg 200x80
  <rect width="200" height="80" fill="#0f172a"/>
  <path d="M10 40 Q55 {{y}} 100 40 T190 40" fill="none" stroke="#38bdf8" stroke-width="3"/>
```
````

````
```ivm
@plot
@axis x: -10..10 step=2 "x"
@axis y: 0..0.8 step=0.2 "density"
@slider mu: -5..5 = 0 step=0.1 "μ"
@slider sigma: 0.5..4 = 1.5 step=0.1 "σ"
@series density stroke=#6d28d9 fill=#7c3aed fillOpacity=0.25
  y = (1/(sigma*sqrt(2*pi))) * exp(-0.5*((x-mu)/sigma)^2)
```
````

````
```ivm
@graph layout=dagre
@node start: "Start" kind=input
@node step: "Step"
@node done: "Done" kind=output
@edge start -> step
@edge step -> done
```
````
