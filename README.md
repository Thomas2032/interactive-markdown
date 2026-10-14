# Interactive Markdown (IVM)

**Interactive Markdown** is a small browser **editor + renderer** for plain `.md` files that include live **vector graphics** driven by sliders, timers, and a safe expression language, plus a **graph editor** stored in the same fence.

Write Markdown as usual. Add an `ivm` fenced block when you want interactive SVG or a directed graph you can edit in the preview. The format stays AI-friendly: readable text an agent can generate like normal Markdown.

License: **MIT** (see [LICENSE](LICENSE)).

## Features

- Split **editor** and **live preview**
- Open / save `.md`, with a **localStorage** draft
- IVM widgets: `@slider`, `@timer` (Play/Pause), `@input`, `@toggle`
- Derived values with `@let` / `@calc`
- SVG templates with `{{expr}}` bindings
- Visual **graph editor**: `@graph`, `@node`, and `@edge` (drag, connect, rename; edits write back into the fence)
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

## IVM dialect (quick reference)

Fence name: **`ivm`**.

````markdown
```ivm
@ns optionalSharedName
@slider amp: 5..60 = 30 step=1 "Amplitude"
@timer t: 0..100 = 0 speed=20 loop "Phase"
@input title: "Hello" "Title"
@toggle show: true "Show"
@let y = 40 - amp * sin(t * pi / 50)
@calc a = amp / 2
@svg
<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="{{round(y, 2)}}" r="{{amp}}" fill="#38bdf8"/>
</svg>
```
````

### Controls

| Line | Meaning |
|------|---------|
| `@slider name: min..max = default step=S "Label"` | Range input |
| `@timer name: min..max = default speed=N loop` | Animated value + Play/Pause (`noloop` to stop at end) |
| `@input name: "default" "Label"` | Text field |
| `@toggle name: true\|false "Label"` | Checkbox |
| `@let name = expression` | Computed value |
| `@calc name = expression` | Alias of `@let` |
| `@ns name` | Share variable state across IVM blocks with the same name |
| `@svg` | Everything after this line is SVG markup |
| `@graph` | Start an editable directed graph. This is the first directive in that fence |
| `@node id: "Label" x=N y=N kind=K` | Node. `kind` is `action` (default), `input`, `output`, or `decision` |
| `@edge from -> to` | Directed edge between two nodes |

### Graph

A fence that starts with `@graph` is a node-and-edge diagram. The preview is the editor: drag a node, drag its right port onto another node, double-click a label to rename, and press Delete to remove the selection. Each committed edit replaces that fence in the source. Do not mix `@svg` or controls into the same fence.

````markdown
```ivm
@graph
@node start: "Start" x=40 y=48 kind=input
@node step: "Step" x=280 y=48
@edge start -> step
```
````

### Expressions (`{{…}}`)

Placeholders use **double braces**: `{{expr}}`.

Allowed operators include `+ - * / % ^ **`, comparisons, `&& || !`, and ternary `? :`.

Functions include: `abs`, `sqrt`, `pow`, `exp`, `ln`, `log`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `round`, `floor`, `ceil`, `trunc`, `sign`, `min`, `max`, `clamp`, `mod`, `lerp`, `deg`, `rad`.

Constants: `pi`, `e`, `tau`.

Angles for trig functions are in **radians** (use `deg` / `rad` helpers as needed).

### Fallback

In a normal Markdown viewer, an `ivm` fence shows up as a plain code block — still readable, just not interactive.

## Examples

Load from the toolbar **Examples…** menu, or open the files directly:

- [`examples/amplitude.md`](examples/amplitude.md) — wave amplitude + phase timer
- [`examples/circular-motion.md`](examples/circular-motion.md) — point on a circle with spin animation
- [`examples/graph.md`](examples/graph.md) — directed graph you can edit in the preview

## Project layout

```
index.html          Editor shell
src/
  app.js            UI wiring
  markdown.js       MD + IVM pipeline
  parse-ivm.js      Fence / control parser
  expr.js           Safe expression evaluator
  sanitize-svg.js   SVG sanitizer
  render.js         Controls + SVG binding
  graph-editor.js   Graph model and canvas editor
styles/app.css
examples/
test/               Node smoke tests
```

## Tests

```bash
npm test
```

Smoke tests cover the expression engine, IVM parser, SVG sanitizer, renderer, Markdown pipeline, and graph editor (`linkedom` is used where a DOM is required).

## License

[MIT](LICENSE) © 2026 Thomas / Thomas2032
