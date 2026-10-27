# Interactive Markdown (IVM)

**Interactive Markdown** is a small browser **editor + renderer** for plain `.md` files that include live **vector graphics** driven by sliders, timers, and a safe expression language, plus **Cartesian XY plots** and a **graph editor** stored in the same fence.

Write Markdown as usual. Add an `ivm` fenced block when you want interactive SVG or a directed graph you can edit in the preview. The format stays AI-friendly: readable text an agent can generate like normal Markdown.

License: **MIT** (see [LICENSE](LICENSE)).

## Features

- Split **editor** and **live preview**
- **Graph editor** tab beside the source: prose renders as formatted text, and sliders, figures, and graphs stay editable blocks
- Open / save `.md`, with a **localStorage** draft
- IVM widgets: `@slider`, `@timer` (Play/Pause), `@input`, `@toggle`
- Derived values with `@let` (agents should emit `@let`, not `@calc`)
- Pure `@fn` macros, arrays (`range` / `map` / `reduce`), and fence `@angle deg|rad` trig mode
- Named `@phase` spans + timer helpers (`inPhase` / `phaseT` / `phaseAt`)
- First-class **`@scrub`** — bind a timer/slider to CSS animation scrubbing on `.im-scrub` (no DIY `animation-delay`)
- SVG templates with `{{expr}}` bindings
- Slim `@svg WxH` wrapper for compact markup
- **XY plots**: `@plot`, `@axis`, and `@series` with live slider-driven curves, **bar / scatter / categorical**, **dual y2 axes**, **zoom/pan**, **log/symlog**, **legends** (position), **`@annotate`**, **parametric/polar**, optional **SVG overlay**, and **hover tooltips**
- Visual **graph editor**: `@graph` (**`layout=dagre`** auto-layout), `@node`, and `@edge` (drag, connect, rename, **self-edges**, **corner ports**, **`@lane` / `@group`**; edits write back into the fence)
- **`@data` tables** → plot series (`from=table` qualifies column ids); **`remap` / `px` / `py`** + **`@anchor`** for safer SVG coordinates
- **Controls inside `@graph` fences** (`@slider` / `@timer` / `@let`) with `@animate quantity=` / `speed=` bound to env names
- **Shared control env** between Preview and Graph editor (same fence keeps slider/timer values)
- **Editor polish**: Examples picker stays on the loaded file; Graph editor blocks offer **Copy fence** / **Reset env**; inspector labels **Namespace (@ns)** with short help
- Animated SVG: CSS `@keyframes`, SMIL, glow filters, and internal `<use>`
- Whitelist expression evaluator (no `eval`)
- **Diagnostics** with line numbers and hints (unknown directives/functions, degree footguns, **`@ns` typo / case warnings** across fences)
- **`ivm check` CLI** (`npm run check -- file.md` or `--json`) for agents to validate-and-rewrite
- **Source autocomplete** for `@` directives, whitelist functions, ports, and series kinds
- SVG sanitizer (strips scripts, event handlers, remote hrefs; allows same-origin / relative paths and `data:` images/fonts)

## Quick start

Requires Node.js 18+.

```bash
git clone https://github.com/Thomas2032/interactive-markdown.git
cd interactive-markdown
npm install
npm start
```

Then open the URL printed by the static server (typically `http://localhost:3000`).

Equivalent without the npm script:

```bash
npx serve .
```

> ES modules need HTTP — opening `index.html` as a `file://` URL will not work.

## Graph editor tab

The left pane has two tabs. **Source** is the markdown. **Graph editor** shows the same document with prose rendered as formatted text. Sliders, timers, text fields, toggles, formulas, shapes, XY plots, and graphs stay as blocks. Select a block to edit its label, range, expression, or shape attributes — including **Namespace (@ns)** (fences with the same name share control values). A shape attribute can be a number or `{{name}}`. Figure / plot / graph blocks also expose **Copy fence** (clipboard) and **Reset env** (snap controls back to fence defaults, including shared `@ns` state). The graph block is the canvas: drag, connect, and rename there. An animated graph marches dashes along each edge and sends a dot along the same path; when quantity/speed are bound to slider names, the motion toolbar shows those names. Each change rewrites the source. The right pane is the rendered preview.

The toolbar **Examples…** menu keeps the selected file name after load (it no longer snaps back to the placeholder).

## Choosing plot vs SVG vs graph

Pick the fence mode from the ask, then stay inside its mixing rules.

| User ask | Use | Avoid |
|----------|-----|--------|
| Curve / density / log axes / parametric or polar | `@plot` (optional trailing `@svg` overlay) | Hand-drawing axes in raw SVG |
| Custom drawing, glyphs, or chrome on a chart | `@svg`, or `@plot` then `@svg` | Invented tags (`@chart`, Mustache, raw JS) |
| Flow, agent loop, boxes and arrows | `@graph` as the first directive | Mixing `@plot` / `@svg` into that fence |
| Shared sliders across two figures | Same `@ns name` on both fences | Mismatched namespace spellings |
| Degrees in `sin` / `cos` | `@angle deg`, or always-safe `sind` / `cosd` | Assuming `sin(45)` is degrees without `@angle deg` |

**Mixing rules:** `@plot` may end with a trailing `@svg` overlay (plot viewBox `0 0 W H`). `@graph` is exclusive of `@plot` and `@svg` — put a flowchart beside a plot in two fences and share state with `@ns`. Controls (`@slider`, `@timer`, `@let`, …) work in every mode.

For copy-paste recipes, see [docs/golden-snippets.md](docs/golden-snippets.md).

## IVM dialect (quick reference)

Fence name: **`ivm`**. Long control names are canonical; short aliases are accepted for compact AI generation.

### Canonical exemplar

````markdown
```ivm
@slider amp: 5..55 = 28
@timer t: 0..100 = 0 speed=25
@let y = 40 - amp * sind(t * 3.6)
@svg 200x80
  <rect width="200" height="80" fill="#0f172a"/>
  <path d="M10 40 Q55 {{y}} 100 40 T190 40" fill="none" stroke="#38bdf8" stroke-width="3"/>
```
````

### Controls

| Line | Meaning |
|------|---------|
| `@slider name: min..max = default [step=S] [deg\|rad] ["Label"]` | Range input (`@s` alias) |
| `@timer name: min..max = default [speed=N] [step=S] [loop\|noloop] [deg\|rad] ["Label"]` | Animated value + Play/Pause (`@t` alias) |
| `@input name: "default" ["Label"]` | Text field (`@i` alias) |
| `@toggle name: true\|false ["Label"]` | Checkbox (`@b` alias) |
| `@let name = expression` | Computed value (`@l` alias) |
| `@calc name = expression` | Alias of `@let` (compat only; prefer `@let`) |
| `@fn name(params) = expression` | Pure macro (`@f` alias); call as `name(...)` in exprs |
| `@angle deg\|rad` | Fence-wide trig mode (`@mode` alias). When `deg`, `sin`/`cos`/`tan`/`asin`/`acos`/`atan`/`atan2` use **degrees** |
| `@phase name: min..max` | Named timeline span for `inPhase` / `phaseT` / `phaseAt` |
| `@ns name` | Share variable state across IVM blocks with the same name |
| `@svg` | Everything after this line is full SVG markup |
| `@svg WxH` | Same, but wrap non-root markup in `<svg viewBox="0 0 W H" xmlns=…>` |
| `@plot [WxH] [grid\|nogrid] [legend\|nolegend\|legend=pos] [lockAspect] [zoom]` | XY plot (optional trailing `@svg` overlay; exclusive of `@graph`) |
| `@axis x\|y\|y2: min..max [step=S] [scale=linear\|log\|symlog\|categorical] [cats=A,B] ["Label"]` | Plot axis (use `y2` for dual axis; `cats=` for categorical) |
| `@series [id] [kind=y\|bar\|scatter\|…] [axis=y\|y2] [marker=…] …` | Plot series (Cartesian, bar, scatter, parametric, or polar) |
| `@legend pos=top-right\|top-left\|bottom-right\|bottom-left` | Legend placement |
| `@annotate x=N y=N "text" [dx=] [dy=] [axis=y\|y2]` | Callout without hand-written SVG |
| `@scrub name duration=N [selector=.im-scrub]` | Pause CSS animations and bind `animation-delay` to a control |
| `@data name` + CSV rows | Table → env `name_col` arrays for series / expressions |
| `@anchor name x=N y=N` | Named point → `name_x` / `name_y` in expressions |
| `@grid on\|off` | Plot grid toggle |
| `@graph [layout=dagre\|flow\|layered]` | Start an editable directed graph; `layout=` auto-places nodes missing both `x=` and `y=` |
| `@lane id: "Label" y=N [height=H] [fill=#hex]` | Horizontal swimlane behind nodes |
| `@group id: "Label"` | Named group; nodes with `group=id` get a bounding box |
| `@node id: "Label" [x=N] [y=N] kind=K [lane=id] [group=id]` | Node. Omit both `x=`/`y=` when `layout=` is set. `kind` is `action` (default), `input`, `output`, or `decision` |
| `@edge from -> to` | Directed edge (self-edges allowed). Sides: `top\|right\|bottom\|left\|top-left\|top-right\|bottom-left\|bottom-right` (aliases `tl\|tr\|bl\|br`). Defaults `from=right`, `to=left` |
| `@animate` | Marching dashes / traveling dots. Options: `path=ortho\|straight\|curve`, `quantity=N\|name`, `direction=forward\|reverse`, `speed=seconds\|name` |

### Defaults (omit when unchanged)

- `step` defaults to **1**
- timer `loop` defaults to **true** (write `noloop` only when needed)
- timer `speed` defaults to **30**
- if `"Label"` is omitted, the UI shows the variable **name**

### Short aliases (AI-compact)

| Short | Long |
|-------|------|
| `@s` | `@slider` |
| `@t` | `@timer` |
| `@i` | `@input` |
| `@b` | `@toggle` |
| `@l` | `@let` |
| `@f` | `@fn` |

Humans and docs should use the long forms. Generators may emit short aliases; both parse.

### Graph

A `@graph` fence is a node-and-edge diagram. Drag a node, drag a port (cardinal or corner) onto another node — including the same node for a self-edge — double-click a label to rename, and press Delete to remove the selection. `@slider` / `@timer` / `@let` may share the fence; bind `@animate quantity=name` and `speed=name` to those controls. Path, direction, and literal quantity/speed still edit on the canvas. Do not mix `@svg` or `@plot` into a graph fence.

**Auto-layout:** `@graph layout=dagre` (aliases `flow`, `layered`) places nodes that omit **both** `x=` and `y=`. Nodes with either coordinate stay where you put them. Dragging a node in the editor clears `autoPos` so the position becomes explicit.

````markdown
```ivm
@graph layout=dagre
@node start: "Start" kind=input
@node step: "Step"
@node done: "Done" kind=output
@edge start -> step
@edge step -> done
```
````

````markdown
```ivm
@slider dots: 1..6 = 2 "Dots"
@graph
@animate path=curve quantity=dots speed=2.4
@node start: "Start" x=40 y=48 kind=input
@node step: "Step" x=280 y=48
@edge start -> step
@edge step -> step from=bottom-left to=top-left
```
````


### XY plot

A fence that starts with `@plot` draws a chart. Axes, grid, series, and an optional trailing `@svg` overlay are declared in the dialect; the renderer builds the SVG. Sliders and `@let` work the same as in figure blocks. Do not mix `@graph` into the same fence.

**Series kinds**

- Cartesian: `y = expr` (free var `x`)
- Parametric: `x = …` / `y = …` / `t = min..max` (free var `t`)
- Polar: `r = …` / `theta = min..max` (free var `theta`)

Series `id` or `label="…"` feeds the legend (default on; `nolegend` to hide). A failed series or `{{expr}}` shows a soft error and leaves the rest of the figure intact.

````markdown
```ivm
@plot
@axis x: -10..10 step=2 "x"
@axis y: 0..0.8 step=0.2 "density"
@slider mu: -5..5 = 0 step=0.1 "μ (mean)"
@slider sigma: 0.5..4 = 1.5 step=0.1 "σ (std dev)"
@series density stroke=#6d28d9 fill=#7c3aed fillOpacity=0.25
  y = (1/(sigma*sqrt(2*pi))) * exp(-0.5*((x-mu)/sigma)^2)
@svg
  <text x="72" y="36" font-size="12" fill="#374151">μ = {{mu}}</text>
```
````

| Line | Meaning |
|------|---------|
| `@plot [WxH] [grid\|nogrid] [legend\|nolegend\|legend=pos] [lockAspect] [zoom]` | Start an XY plot (default 480×320; `zoom` enables wheel zoom / drag pan) |
| `@axis x\|y: min..max [step=S] [scale=linear\|log\|symlog] [linthresh=N] ["Label"]` | Axis range, scale, tick step, and title |
| `@series [id] [kind=…] [from=dataName] [axis=y\|y2] [marker=…] …` | Series style; `from=` qualifies bare `cats=`/`x=`/`y=` column ids as `dataName_col` |
| `@data name` + header/rows | CSV/table available as `name_col` arrays (and via `from=`) |
| `@grid on\|off` | Toggle the background grid |
| `@svg` (after `@plot`) | Overlay markup in the plot viewBox (`0 0 W H`) with `{{expr}}` |

Defaults: grid **on**, legend **on**, fill opacity **0.25**, stroke `#6d28d9`, fill `#7c3aed`, axis scale **linear**, symlog `linthresh` **1**.

### Expressions (`{{…}}`)

Placeholders use **double braces** only: `{{expr}}`.

Allowed operators include `+ - * / % ^ **`, comparisons, `&& || !`, and ternary `? :`.

Functions include: `abs`, `sqrt`, `pow`, `exp`, `ln`, `log`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sind`, `cosd`, `tand`, `asind`, `acosd`, `atand`, `round`, `floor`, `ceil`, `trunc`, `sign`, `min`, `max`, `clamp`, `mod`, `lerp`, `remap`, `px`, `py`, `deg`, `rad`, plus array helpers `len`, `nth`, `first`, `last`, `sum`, `mean`, `join`, `range`, `map`, `reduce`, `points`, and phase helpers `inPhase`, `phaseT`, `phaseAt`.

Constants: `pi`, `e`, `tau`.

Arrays: `[1, 2, x]`, `range(a, b, step?)`, `map(arr, fnName|"expr with _")`, `reduce(arr, fnName|"acc/_ expr", init)`, `points(xs, ys)` for SVG polylines.

Coordinate helpers (prefer these over `170 - amp * 80`): `remap(v, in0, in1, out0, out1)`, `px(v, lo, hi, width)`, `py(v, lo, hi, height)` (SVG y-down). `@anchor name x=N y=N` injects `name_x` / `name_y`. (`map` remains the array mapper — use `remap` for ranges.)

- Default: `sin` / `cos` / `tan` take **radians**
- With `@angle deg` on the fence: `sin` / `cos` / `tan` / inverses use **degrees** (documented footgun fix)
- `sind` / `cosd` / `tand` always take **degrees**, regardless of `@angle`
- Optional `deg` / `rad` flag on a range line is still stored as metadata (`units`)
- `@phase name: min..max` + `inPhase(t,"name")` / `phaseT(t,"name")` / `phaseAt(t)` for timeline phases with `@timer`
- `@scrub t duration=4` + CSS class `im-scrub` for first-class animation scrubbing (replaces DIY `animation-delay: -{{t}}s`)

### Animated SVG

Everything after `@svg` can be a self-contained animated figure:

- `<style>` with `@keyframes` (crossfades, pulses, marching dashes)
- SMIL (`<animate>`, `<animateTransform>`, `<animateMotion>`)
- Filters (`feGaussianBlur`, …) and paint servers such as `url(#id)`
- `<use href="#symbol-id">` for icons defined in the same SVG

Scripts, event handlers, and **remote** URLs are still removed. **Same-origin / relative** paths and inline `data:image/…` / `data:font/…` assets are kept. Scrub a CSS `@keyframes` timeline by pairing `@timer t` with `animation-play-state: paused` and `animation-delay: -{{t}}s`. The figure is mounted in a shadow root so its CSS cannot restyle the editor. The SVG is rewritten only when the substituted markup changes, so those animations keep playing while sliders sit still.

A block with only `@svg` (no controls) renders as a full-width figure.

### Fallback

In a normal Markdown viewer, an `ivm` fence shows up as a plain code block — still readable, just not interactive.

## Examples

Load from the toolbar **Examples…** menu, or open the files directly. Short intent → fence recipes: [docs/golden-snippets.md](docs/golden-snippets.md).

- [`examples/amplitude.md`](examples/amplitude.md) — wave amplitude + phase timer
- [`examples/circular-motion.md`](examples/circular-motion.md) — point on a circle with spin animation
- [`examples/agent-loop.md`](examples/agent-loop.md) — agent loop drawn as an animated graph
- [`examples/graph.md`](examples/graph.md) — directed graph you can edit in the preview
- [`examples/normal-density.md`](examples/normal-density.md) — Gaussian density XY plot with μ/σ sliders
- [`examples/p0-demo.md`](examples/p0-demo.md) — overlay, log axes, legend, parametric/polar, soft errors
- [`examples/p1-demo.md`](examples/p1-demo.md) — graph controls, self-edges, corner ports, shared env, plot tooltips
- [`examples/p2-layout-data-demo.md`](examples/p2-layout-data-demo.md) — `layout=dagre`, `@data`, `remap`/`@anchor`
- [`examples/p1-diagnostics-demo.md`](examples/p1-diagnostics-demo.md) — soft errors, degree hints, `ivm check` CLI
- [`examples/p2-p3-demo.md`](examples/p2-p3-demo.md) — `@fn` / arrays / `@angle deg`, phases + timer scrub, local assets
- [`examples/p3-p4-demo.md`](examples/p3-p4-demo.md) — bar/scatter/categorical, legend/annotate, zoom+dual axis, graph lanes/groups, `@scrub`, `@ns` typo warning
- [`examples/p4-demo.md`](examples/p4-demo.md) — `@ns` sharing, picker sync, Copy fence / Reset env

## Project layout

```
index.html          Editor shell
src/
  index.js          Library entry
  app.js            UI wiring
  document.js       Block model (parse and serialize)
  document-editor.js  Preview block editor
  markdown.js       MD + IVM pipeline
  parse-ivm.js      Fence / control parser
  expr.js           Safe expression evaluator
  sanitize-svg.js   SVG sanitizer
  render.js         Controls + SVG binding
  graph-editor.js   Graph model and canvas editor
  plot.js           Cartesian XY plot SVG builder
  diagnostics.js    Structured fence diagnostics
  autocomplete.js   Source-tab completions
bin/
  ivm-check.mjs     CLI: validate ```ivm fences
styles/app.css
examples/
test/               Node smoke tests
```

## Tests

```bash
npm test
```

Smoke tests cover the expression engine, IVM parser, SVG sanitizer, renderer, Markdown pipeline, graph editor, XY plots, preview document builder, diagnostics/CLI, and autocomplete (`linkedom` is used where a DOM is required).

## License

[MIT](LICENSE) © 2026 Thomas / Thomas2032
