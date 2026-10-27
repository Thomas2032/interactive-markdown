# IVM P1 — diagnostics, `ivm check`, source autocomplete

This demo shows **soft errors**, **hints**, and how to validate fences from the CLI.

## Soft series error (figure still renders)

One bad series does not blank the plot — the good curve still draws, and a soft error lists the problem.

```ivm
@plot 480x260 legend
@axis x: -3.2..3.2 step=1 "x"
@axis y: -1.2..1.2 step=0.4 "y"
@slider amp: 0.4..1.2 = 1 step=0.05 "Amplitude"
@series sine stroke=#7c3aed width=2.5 "sin"
  y = amp * sin(x)
@series broken stroke=#ef4444 width=2 "bad"
  y = amp * nope(x)
```

## Degree footgun hint (warning, not a hard fail)

`sin(45)` looks like degrees, but the default mode is radians. Prefer `@angle deg` or `sind`.

```ivm
@slider t: 0..90 = 45 step=1 "Degrees?"
@let y = sin(45)
@svg 200x60
  <text x="12" y="36" fill="#e2e8f0" font-size="14">sin(45) ≈ {{round(y, 4)}} (radians!)</text>
```

Fixed with `@angle deg`:

```ivm
@angle deg
@slider t: 0..90 = 45 step=1 "Degrees"
@let y = sin(t)
@svg 200x60
  <text x="12" y="36" fill="#e2e8f0" font-size="14">sin({{t}})° ≈ {{round(y, 4)}}</text>
```

## Unrecognized directive hint

```ivm
@chart 100x100
@slider a: 0..1 = 0.5
```

## Validate with the CLI

From the repo root:

```bash
npm run check -- examples/p1-diagnostics-demo.md
npm run check -- --json examples/p1-diagnostics-demo.md
# or
npx ivm-check examples/p1-diagnostics-demo.md
```

Exit code is non-zero when any **error** is present (warnings alone still exit 0).

## Source autocomplete

In the editor **Source** tab, inside an `ivm` fence:

- Type `@` for directives (`@plot`, `@slider`, `@graph`, …)
- Type a function prefix (`si` → `sin`) in an expression
- After `from=` / `to=` on an `@edge`, pick a port (`top-left`, `br`, …)
- Under `@series`, accept `y =` / parametric / polar snippets
- **Ctrl+Space** (or **⌘+Space**) forces the popup
