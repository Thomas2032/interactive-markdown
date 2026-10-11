# Wave amplitude

Drag **Amplitude** or press **Play** on the phase timer. The path and marker update from `{{expr}}` bindings.

```ivm
@slider amp: 5..55 = 28 step=1 "Amplitude"
@timer t: 0..100 = 0 speed=25 loop "Phase"
@let y = 40 - amp * sin(t * pi / 50)
@let y2 = 40 - (amp * 0.55) * sin(t * pi / 50 + 1.2)
@svg
<svg viewBox="0 0 200 80" width="100%" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="200" height="80" rx="4" fill="#0f172a"/>
  <line x1="10" y1="40" x2="190" y2="40" stroke="#334155" stroke-width="1"/>
  <path d="M 10 40 Q 55 {{round(y,2)}} 100 40 T 190 40"
        fill="none" stroke="#38bdf8" stroke-width="3"/>
  <path d="M 10 40 Q 55 {{round(y2,2)}} 100 40 T 190 40"
        fill="none" stroke="#a78bfa" stroke-width="2" opacity="0.85"/>
  <circle cx="100" cy="{{round(y,2)}}" r="5" fill="#f472b6"/>
</svg>
```

## Tips

- `@timer` uses **Play / Pause** in the widget chrome.
- `@let` values are recomputed whenever a slider or timer changes.
