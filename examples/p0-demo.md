# IVM P0 demo

Plot + SVG overlay, log axes, legends, parametric / polar series, and soft errors — all in the Interactive Markdown dialect.

## Overlay + legend + soft error

Cartesian series with a legend, annotation chrome via `@svg` in the same fence, and one broken series that reports a soft error instead of blanking the figure.

```ivm
@plot 520x340
@axis x: -3.5..3.5 step=1 "x"
@axis y: -1.2..1.2 step=0.4 "y"
@slider amp: 0.4..1.2 = 1 step=0.05 "Amplitude"
@series sine stroke=#6d28d9 width=2.5 "sin"
  y = amp * sin(x)
@series cosine stroke=#0891b2 width=2.5 "cos"
  y = amp * cos(x)
@series broken stroke=#dc2626 width=2 "broken"
  y = amp * nope(x)
@svg
  <text x="90" y="42" font-size="13" font-family="system-ui,sans-serif" fill="#374151">peak ≈ {{round(amp, 2)}}</text>
  <circle cx="{{260 + 0}}" cy="{{170 - amp * 80}}" r="5" fill="#6d28d9"/>
```

## Log axis

```ivm
@plot 480x300
@axis x: 0.1..1000 scale=log "x (log)"
@axis y: 0.01..100 scale=log "y (log)"
@series power stroke=#7c3aed width=2.5 "y = x^1.5"
  y = x ^ 1.5
```

## Parametric + polar

```ivm
@plot 480x360 lockAspect
@axis x: -2.2..2.2 step=1 "x"
@axis y: -2.2..2.2 step=1 "y"
@slider k: 0.4..1.6 = 1 step=0.05 "Scale"
@series circle stroke=#2563eb width=2.25 "circle"
  x = k * cos(t)
  y = k * sin(t)
  t = 0..6.2832
@series rose stroke=#db2777 width=2 "rose"
  r = k * cos(3 * theta)
  theta = 0..6.2832
```
