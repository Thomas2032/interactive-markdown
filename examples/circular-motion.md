# Circular motion

Adjust **radius** and **angle**, or animate with the timer. The moving point sits on the circle at angle `a`.

```ivm
@slider radius: 10..80 = 50
@slider angle: 0..360 = 45 deg
@timer spin: 0..360 = 0 speed=40 deg
@let a = angle + spin
@let x = round(100 + radius * cosd(a), 2)
@let y = round(100 + radius * sind(a), 2)
@svg 200x200
  <rect width="200" height="200" rx="6" fill="#0f172a"/>
  <circle cx="100" cy="100" r="{{radius}}" fill="none" stroke="#475569" stroke-width="2"/>
  <line x1="100" y1="100" x2="{{x}}" y2="{{y}}" stroke="#38bdf8" stroke-width="2"/>
  <circle cx="100" cy="100" r="3" fill="#94a3b8"/>
  <circle cx="{{x}}" cy="{{y}}" r="7" fill="#f472b6"/>
  <text x="8" y="18" fill="#94a3b8" font-size="10" font-family="ui-monospace, monospace">a={{round(a,1)}}°</text>
```

Press **Play** on **spin** to sweep the point around the circle while keeping your base angle offset.
