# Wave amplitude

Drag **amp** or press **Play** on the phase timer. The path and marker update from `{{expr}}` bindings.

```ivm
@slider amp: 5..55 = 28
@timer t: 0..100 = 0 speed=25
@let y = 40 - amp * sind(t * 3.6)
@let y2 = 40 - (amp * 0.55) * sind(t * 3.6 + 68.75)
@svg 200x80
  <rect width="200" height="80" rx="4" fill="#0f172a"/>
  <line x1="10" y1="40" x2="190" y2="40" stroke="#334155" stroke-width="1"/>
  <path d="M10 40 Q55 {{y}} 100 40 T190 40" fill="none" stroke="#38bdf8" stroke-width="3"/>
  <path d="M10 40 Q55 {{y2}} 100 40 T190 40" fill="none" stroke="#a78bfa" stroke-width="2" opacity="0.85"/>
  <circle cx="100" cy="{{y}}" r="5" fill="#f472b6"/>
```

## Tips

- `@timer` uses **Play / Pause** in the widget chrome.
- `@let` values are recomputed whenever a slider or timer changes.
- Prefer `sind` / `cosd` when angles are in degrees.
