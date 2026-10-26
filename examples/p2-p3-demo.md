# IVM P2 + P3 demo

Expression power (arrays, `@fn`, angle mode) and SVG depth (named phases + timer scrub, local assets).

## Arrays + `@fn` macros

`range` / `map` / `reduce` stay sandboxed. `@fn` macros are pure formulas reusable in the fence.

```ivm
@slider amp: 0.4..1.4 = 1 step=0.05 "Amplitude"
@fn wave(x) = amp * sin(x)
@fn bump(x) = amp * cos(x)
@let xs = range(-3, 3, 1)
@let ys = map(xs, wave)
@let peak = reduce(ys, "acc > _ ? acc : _", -999)
@let markers = points(map(xs, "_ * 40 + 200"), map(ys, "170 - _ * 60"))
@plot 480x280 legend
@axis x: -3.2..3.2 step=1 "x"
@axis y: -1.5..1.5 step=0.5 "y"
@series sine stroke=#7c3aed width=2.5 "wave(x)"
  y = wave(x)
@series cosine stroke=#0891b2 width=2 "bump(x)"
  y = bump(x)
@svg
  <polyline points="{{markers}}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="72" y="36" font-size="12" font-family="system-ui,sans-serif" fill="#374151">peak ≈ {{round(peak, 3)}} · n={{len(xs)}}</text>
```

## Angle mode (`@angle deg`)

With `@angle deg`, **`sin` / `cos` / `tan` take degrees** (same as `sind`). Inverse trig returns degrees. Default remains radians when `@angle` is omitted.

```ivm
@angle deg
@slider theta: 0..360 = 45 step=1 deg "θ (°)"
@fn tip(a) = [100 + 70 * cos(a), 100 - 70 * sin(a)]
@let p = tip(theta)
@svg 200x200
  <rect width="200" height="200" fill="#0f172a"/>
  <circle cx="100" cy="100" r="70" fill="none" stroke="#334155" stroke-width="2"/>
  <line x1="100" y1="100" x2="{{nth(p,0)}}" y2="{{nth(p,1)}}" stroke="#38bdf8" stroke-width="3"/>
  <circle cx="{{nth(p,0)}}" cy="{{nth(p,1)}}" r="6" fill="#f472b6"/>
  <text x="12" y="24" fill="#e2e8f0" font-size="13" font-family="system-ui,sans-serif">sin(θ)={{round(sin(theta),3)}}</text>
```

## Timeline phases + timer scrub

Named `@phase` spans drive `inPhase` / `phaseT` / `phaseAt`. Scrub the CSS timeline by pausing the animation and setting `animation-delay: -{{t}}s`.

```ivm
@timer t: 0..4 = 0 speed=0.5 step=0.02 "Scrub (s)"
@phase rise: 0..1.2
@phase hold: 1.2..2.8
@phase fall: 2.8..4
@let label = phaseAt(t)
@let glow = inPhase(t, "hold") ? 1 : 0.35
@svg 420x140
  <style>
    .ball {
      animation: slide 4s linear both;
      animation-play-state: paused;
      animation-delay: -{{t}}s;
    }
    @keyframes slide {
      from { transform: translate(0px, 0px); }
      to { transform: translate(320px, 0px); }
    }
  </style>
  <rect width="420" height="140" rx="12" fill="#0f172a"/>
  <text x="16" y="28" fill="#94a3b8" font-size="12" font-family="system-ui,sans-serif">phase={{label}} · riseT={{round(phaseT(t,"rise"),2)}}</text>
  <g class="ball" transform="translate(40 80)">
    <circle r="18" fill="#38bdf8" opacity="{{glow}}"/>
    <circle r="18" fill="none" stroke="#f472b6" stroke-width="3" opacity="{{inPhase(t,"hold") ? 1 : 0}}"/>
  </g>
  <line x1="40" y1="110" x2="360" y2="110" stroke="#334155" stroke-width="2"/>
```

Drag **Scrub** (or hit Play) — the ball eases along the track and the hold ring lights only in the `hold` phase.

## Local asset allowlist

Same-origin / relative paths and `data:` fonts/images stay after sanitize. Remote `https://…` hrefs are still stripped. This figure uses an inline PNG data URL (1×1 teal pixel) as an icon.

```ivm
@svg 240x96
  <rect width="240" height="96" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
  <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" x="20" y="28" width="40" height="40"/>
  <text x="72" y="54" font-size="14" font-family="system-ui,sans-serif" fill="#334155">local / data:image OK</text>
```
