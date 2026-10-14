# Normal density

A Cartesian **XY plot** of the Gaussian PDF. Drag **μ (mean)** and **σ (std dev)** — the curve recomputes live.

```ivm
@plot
@axis x: -10..10 step=2 "x"
@axis y: 0..0.8 step=0.2 "density"
@slider mu: -5..5 = 0 step=0.1 "μ (mean)"
@slider sigma: 0.5..4 = 1.5 step=0.1 "σ (std dev)"
@series density stroke=#6d28d9 fill=#7c3aed fillOpacity=0.25
  y = (1/(sigma*sqrt(2*pi))) * exp(-0.5*((x-mu)/sigma)^2)
```

## Tips

- `@plot` builds axes, grid, and series — no hand-written SVG required.
- Series expressions use free variable `x` plus any `@slider` / `@let` names.
- Omit `nogrid` to keep the light gray grid (default on).
