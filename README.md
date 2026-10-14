# Interactive Markdown (IVM)

**Interactive Markdown** is a small browser **editor + renderer** for plain `.md` files that include live **vector graphics** driven by sliders, timers, and a safe expression language.

Write Markdown as usual. Add an `ivm` fenced block when you want interactive SVG. The format stays AI-friendly: readable text an agent can generate like normal Markdown.

License: **MIT** (see [LICENSE](LICENSE)).

## Features

- Split **editor** and **live preview**
- Open / save `.md`, with a **localStorage** draft
- IVM widgets: `@slider`, `@timer` (Play/Pause), `@input`, `@toggle`
- Derived values with `@let` / `@calc`
- SVG templates with `{{expr}}` bindings
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

### Expressions (`{{…}}`)

Placeholders use **double braces**: `{{expr}}`.

Allowed operators include `+ - * / % ^ **`, comparisons, `&& || !`, and ternary `? :`.

Functions include: `abs`, `sqrt`, `pow`, `exp`, `ln`, `log`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `round`, `floor`, `ceil`, `trunc`, `sign`, `min`, `max`, `clamp`, `mod`, `lerp`, `deg`, `rad`.

Constants: `pi`, `e`, `tau`.

Angles for trig functions are in **radians** (use `deg` / `rad` helpers as needed).

### Animated SVG

Everything after `@svg` can be a self-contained animated figure:

- `<style>` with `@keyframes` (crossfades, pulses, marching dashes)
- SMIL (`<animate>`, `<animateTransform>`, `<animateMotion>`)
- Filters (`feGaussianBlur`, …) and paint servers such as `url(#id)`
- `<use href="#symbol-id">` for icons defined in the same SVG

Scripts, event handlers, and remote URLs are still removed. The figure is mounted in a shadow root so its CSS cannot restyle the editor. The SVG is rewritten only when the substituted markup changes, so those animations keep playing while sliders sit still.

A block with only `@svg` (no controls) renders as a full-width figure. See [`examples/agent-loop.md`](examples/agent-loop.md).

### Fallback

In a normal Markdown viewer, an `ivm` fence shows up as a plain code block — still readable, just not interactive.

## Examples

Load from the toolbar **Examples…** menu, or open the files directly:

- [`examples/amplitude.md`](examples/amplitude.md) — wave amplitude + phase timer
- [`examples/circular-motion.md`](examples/circular-motion.md) — point on a circle with spin animation
- [`examples/agent-loop.md`](examples/agent-loop.md) — animated architecture figure (CSS + SMIL)

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
styles/app.css
examples/
test/               Node smoke tests
```

## Tests

```bash
npm test
```

Smoke tests cover the expression engine, IVM parser, SVG sanitizer, renderer, and Markdown pipeline (`linkedom` is used where a DOM is required).

## License

[MIT](LICENSE) © 2026 Thomas / Thomas2032
