# Circular motion

Adjust **radius** and **angle**, or animate with the timer. The moving point sits on the circle at angle `a`.

```ivm
@slider radius: 10..80 = 50 step=1 "Radius"
@slider angle: 0..360 = 45 step=1 "Angle (°)"
@timer spin: 0..360 = 0 speed=40 loop "Spin"
@calc a = angle + spin
@let x = round(100 + radius * cos(a * pi / 180), 2)
@let y = round(100 + radius * sin(a * pi / 180), 2)
@svg
<svg viewBox="0 0 200 200" width="100%" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="200" height="200" rx="6" fill="#0f172a"/>
  <circle cx="100" cy="100" r="{{radius}}" fill="none" stroke="#475569" stroke-width="2"/>
  <line x1="100" y1="100" x2="{{x}}" y2="{{y}}" stroke="#38bdf8" stroke-width="2"/>
  <circle cx="100" cy="100" r="3" fill="#94a3b8"/>
  <circle cx="{{x}}" cy="{{y}}" r="7" fill="#f472b6"/>
  <text x="8" y="18" fill="#94a3b8" font-size="10" font-family="ui-monospace, monospace">
    a={{round(a,1)}}°
  </text>
</svg>
```

Press **Play** on **Spin** to sweep the point around the circle while keeping your base angle offset.
