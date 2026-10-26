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
- SVG templates with `{{expr}}` bindings
- Slim `@svg WxH` wrapper for compact markup
- **XY plots**: `@plot`, `@axis`, and `@series` with live slider-driven curves, **log/symlog** axes, **legends**, **parametric/polar** series, and optional **SVG overlay**
- Visual **graph editor**: `@graph`, `@node`, and `@edge` (drag, connect, rename; edits write back into the fence)
- Animated SVG: CSS `@keyframes`, SMIL, glow filters, and internal `<use>`
- Whitelist expression evaluator (no `eval`)
- SVG sanitizer (strips scripts, event handlers, external hrefs)

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

The left pane has two tabs. **Source** is the markdown. **Graph editor** shows the same document with prose rendered as formatted text. Sliders, timers, text fields, toggles, formulas, shapes, XY plots, and graphs stay as blocks. Select a block to edit its label, range, expression, or shape attributes. A shape attribute can be a number or `{{name}}`. The graph block is the canvas: drag, connect, and rename there. An animated graph marches dashes along each edge and sends a dot along the same path. Each change rewrites the source. The right pane is the rendered preview.

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
| `@ns name` | Share variable state across IVM blocks with the same name |
| `@svg` | Everything after this line is full SVG markup |
| `@svg WxH` | Same, but wrap non-root markup in `<svg viewBox="0 0 W H" xmlns=…>` |
| `@plot [WxH] [grid\|nogrid] [legend\|nolegend] [lockAspect]` | XY plot (optional trailing `@svg` overlay; exclusive of `@graph`) |
| `@axis x\|y: min..max [step=S] [scale=linear\|log\|symlog] [linthresh=N] ["Label"]` | Plot axis range, scale, and label |
| `@series [id] …` / `y=` / `x=`+`y=` / `r=` | Plot series (Cartesian, parametric, or polar) |
| `@grid on\|off` | Plot grid toggle |
| `@graph` | Start an editable directed graph. This is the first directive in that fence |
| `@node id: "Label" x=N y=N kind=K` | Node. `kind` is `action` (default), `input`, `output`, or `decision` |
| `@edge from -> to` | Directed edge. Add `from=top\|right\|bottom\|left` and `to=top\|right\|bottom\|left` to choose the sides. Defaults are `from=right` and `to=left` |
| `@animate` | Play marching dashes and traveling dots on the graph canvas. Options: `path=ortho\|straight\|curve`, `quantity=N` (1–12), `direction=forward\|reverse`, `speed=seconds` |

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

Humans and docs should use the long forms. Generators may emit short aliases; both parse.

### Graph

A fence that starts with `@graph` is a node-and-edge diagram. The preview is the editor: drag a node, drag a port on any side onto another node, double-click a label to rename, and press Delete to remove the selection. `@animate` runs the motion on that same canvas. Path, quantity, direction, and speed are edited there and written back onto the `@animate` line. Each committed edit replaces that fence in the source. Do not mix `@svg` or controls into the same fence.

````markdown
```ivm
@graph
@node start: "Start" x=40 y=48 kind=input
@node step: "Step" x=280 y=48
@edge start -> step
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
| `@plot [WxH] [grid\|nogrid] [legend\|nolegend] [lockAspect]` | Start an XY plot (default size 480×320, grid on, legend on when labels exist) |
| `@axis x\|y: min..max [step=S] [scale=linear\|log\|symlog] [linthresh=N] ["Label"]` | Axis range, scale, tick step, and title |
| `@series [id] [stroke=#…] [fill=#…] [fillOpacity=N] [width=N] ["Label"]` | Curve style; body is `y =`, or `x=`+`y=`+`t=`, or `r=`+`theta=` |
| `@grid on\|off` | Toggle the background grid |
| `@svg` (after `@plot`) | Overlay markup in the plot viewBox (`0 0 W H`) with `{{expr}}` |

Defaults: grid **on**, legend **on**, fill opacity **0.25**, stroke `#6d28d9`, fill `#7c3aed`, axis scale **linear**, symlog `linthresh` **1**.

### Expressions (`{{…}}`)

Placeholders use **double braces** only: `{{expr}}`.

Allowed operators include `+ - * / % ^ **`, comparisons, `&& || !`, and ternary `? :`.

Functions include: `abs`, `sqrt`, `pow`, `exp`, `ln`, `log`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sind`, `cosd`, `tand`, `asind`, `acosd`, `atand`, `round`, `floor`, `ceil`, `trunc`, `sign`, `min`, `max`, `clamp`, `mod`, `lerp`, `deg`, `rad`.

Constants: `pi`, `e`, `tau`.

- `sin` / `cos` / `tan` take **radians**
- `sind` / `cosd` / `tand` take **degrees** (prefer these when a control range is in degrees)
- Optional `deg` / `rad` flag on a range line is stored as metadata (`units`) for authors/tools; trig still uses the helpers above

### Animated SVG

Everything after `@svg` can be a self-contained animated figure:

- `<style>` with `@keyframes` (crossfades, pulses, marching dashes)
- SMIL (`<animate>`, `<animateTransform>`, `<animateMotion>`)
- Filters (`feGaussianBlur`, …) and paint servers such as `url(#id)`
- `<use href="#symbol-id">` for icons defined in the same SVG

Scripts, event handlers, and remote URLs are still removed. The figure is mounted in a shadow root so its CSS cannot restyle the editor. The SVG is rewritten only when the substituted markup changes, so those animations keep playing while sliders sit still.

A block with only `@svg` (no controls) renders as a full-width figure.

### Fallback

In a normal Markdown viewer, an `ivm` fence shows up as a plain code block — still readable, just not interactive.

## Examples

Load from the toolbar **Examples…** menu, or open the files directly:

- [`examples/amplitude.md`](examples/amplitude.md) — wave amplitude + phase timer
- [`examples/circular-motion.md`](examples/circular-motion.md) — point on a circle with spin animation
- [`examples/agent-loop.md`](examples/agent-loop.md) — agent loop drawn as an animated graph
- [`examples/graph.md`](examples/graph.md) — directed graph you can edit in the preview
- [`examples/normal-density.md`](examples/normal-density.md) — Gaussian density XY plot with μ/σ sliders
- [`examples/p0-demo.md`](examples/p0-demo.md) — overlay, log axes, legend, parametric/polar, soft errors

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
styles/app.css
examples/
test/               Node smoke tests
```

## Tests

```bash
npm test
```

Smoke tests cover the expression engine, IVM parser, SVG sanitizer, renderer, Markdown pipeline, graph editor, XY plots, and preview document builder (`linkedom` is used where a DOM is required).

## License

[MIT](LICENSE) © 2026 Thomas / Thomas2032
