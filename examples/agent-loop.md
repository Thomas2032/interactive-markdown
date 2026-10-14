# Agent loop

This figure is a self-contained animated SVG. CSS `@keyframes` crossfade the phase title and march the dashed wires. A glow filter and SMIL `<animateMotion>` move the dot along the return path. Icons are `<symbol>` elements reused with `<use href="#…">`.

```ivm
@svg
<svg viewBox="0 0 1000 720" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif">
  <title>Agent loop</title>
  <desc>Trigger, think, act, observe, and a done check, with the phase title animated across two iterations.</desc>
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="#18224a"/>
      <stop offset="1" stop-color="#0c122c"/>
    </radialGradient>
    <linearGradient id="loopStroke" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5a6db8"/>
      <stop offset="1" stop-color="#2c3c74"/>
    </linearGradient>
    <filter id="orb" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
      <path d="M1.2 1.4 L8.4 5 L1.2 8.6" fill="none" stroke="#b7c6f0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
    <symbol id="i-bolt" viewBox="0 0 24 24">
      <path d="M13 2 L4 14 H11 L9.5 22 L20 10 H13 Z"/>
    </symbol>
    <symbol id="i-plane" viewBox="0 0 24 24">
      <path d="M3 11.2 L21 3.5 L13.2 21 L11 13.2 Z"/>
    </symbol>
    <symbol id="i-bulb" viewBox="0 0 24 24">
      <circle cx="12" cy="9" r="4.2" fill="none" stroke-width="1.6"/>
      <path d="M9.2 14.4 H14.8 M10 17 H14 M10.7 19.2 H13.3" fill="none" stroke-width="1.6" stroke-linecap="round"/>
    </symbol>
    <symbol id="i-play" viewBox="0 0 24 24">
      <path d="M8.2 5.2 L18.6 12 L8.2 18.8 Z"/>
    </symbol>
    <symbol id="i-eye" viewBox="0 0 24 24">
      <ellipse cx="12" cy="12" rx="8" ry="4.6" fill="none" stroke-width="1.6"/>
      <circle cx="12" cy="12" r="2.15" stroke="none"/>
    </symbol>
    <symbol id="i-db" viewBox="0 0 24 24">
      <ellipse cx="12" cy="6.5" rx="6.5" ry="2.6" fill="none" stroke-width="1.6"/>
      <path d="M5.5 6.5 V16.2 C5.5 17.8 8.4 19.2 12 19.2 C15.6 19.2 18.5 17.8 18.5 16.2 V6.5" fill="none" stroke-width="1.6"/>
      <path d="M5.5 11.2 C5.5 12.8 8.4 14.2 12 14.2 C15.6 14.2 18.5 12.8 18.5 11.2" fill="none" stroke-width="1.6"/>
    </symbol>
    <symbol id="i-spark" viewBox="0 0 24 24">
      <path d="M12 2.2 L13.8 10.2 L21.8 12 L13.8 13.8 L12 21.8 L10.2 13.8 L2.2 12 L10.2 10.2 Z"/>
    </symbol>
  </defs>
  <style>
    .dashed { animation: march 1s linear infinite; }
    @keyframes march { to { stroke-dashoffset: -24; } }
    .title { font-size: 22px; font-weight: 600; fill: #f4f7ff; }
    .iter { font-size: 14px; fill: #93a0c4; }
    .halo { fill: none; stroke-width: 2; opacity: 0; }
    .halo-act { stroke: #9ec5ff; animation: phase-act 8s linear infinite; }
    .halo-observe { stroke: #c4cbff; animation: phase-observe 8s linear infinite; }
    .halo-done { stroke: #4ade80; animation: phase-done 8s linear infinite; }
    .halo-think { stroke: #d6c9ff; animation: phase-think 8s linear infinite; }
    .title-act { animation: phase-act 8s linear infinite; }
    .title-observe { animation: phase-observe 8s linear infinite; }
    .title-done { animation: phase-done 8s linear infinite; }
    .title-think { animation: phase-think 8s linear infinite; }
    .iter-1 { animation: iter-a 8s linear infinite; }
    .iter-2 { animation: iter-b 8s linear infinite; }
    @keyframes phase-act {
      0%, 24.9% { opacity: 1; }
      25%, 100% { opacity: 0; }
    }
    @keyframes phase-observe {
      0%, 24.9% { opacity: 0; }
      25%, 49.9% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }
    @keyframes phase-done {
      0%, 49.9% { opacity: 0; }
      50%, 74.9% { opacity: 1; }
      75%, 100% { opacity: 0; }
    }
    @keyframes phase-think {
      0%, 74.9% { opacity: 0; }
      75%, 99.9% { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes iter-a {
      0%, 49.9% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }
    @keyframes iter-b {
      0%, 49.9% { opacity: 0; }
      50%, 100% { opacity: 1; }
    }
  </style>
  <rect width="1000" height="720" fill="url(#bg)"/>

  <text class="title title-act" x="470" y="50" text-anchor="middle" opacity="1">Act · choose a tool, form the call</text>
  <text class="title title-observe" x="470" y="50" text-anchor="middle" opacity="0">Observe · parse results</text>
  <text class="title title-done" x="470" y="50" text-anchor="middle" opacity="0">Done · return the result</text>
  <text class="title title-think" x="470" y="50" text-anchor="middle" opacity="0">Think · plan · reason</text>
  <text class="iter iter-1" x="960" y="46" text-anchor="end" opacity="1">iteration 1 / 2</text>
  <text class="iter iter-2" x="960" y="46" text-anchor="end" opacity="0">iteration 2 / 2</text>

  <g fill="none" stroke="#8ea2d8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M172 156 V182" marker-end="url(#ah)"/>
  </g>

  <rect x="40" y="184" width="920" height="256" rx="30" fill="#12183a" stroke="url(#loopStroke)" stroke-width="1.6"/>
  <text x="64" y="212" fill="#8b97c4" font-size="12" letter-spacing="3.5">AGENT LOOP</text>

  <rect x="68" y="232" width="236" height="156" rx="18" fill="#171e42" stroke="#6d62b8" stroke-width="1.5"/>
  <rect class="halo halo-think" x="68" y="232" width="236" height="156" rx="18" fill="none"/>
  <rect x="86" y="286" width="46" height="46" rx="12" fill="#20284f" stroke="#a78bfa" stroke-opacity="0.85"/>
  <use href="#i-bulb" x="97" y="297" width="24" height="24" fill="none" stroke="#c4b5fd"/>
  <text x="148" y="306" fill="#f3f6ff" font-size="20" font-weight="600">Think</text>
  <text x="148" y="330" fill="#9aa8c9" font-size="13">plan · reason</text>

  <rect x="382" y="232" width="236" height="156" rx="18" fill="#171e42" stroke="#5d78b8" stroke-width="1.5"/>
  <rect class="halo halo-act" x="382" y="232" width="236" height="156" rx="18" fill="none"/>
  <rect x="400" y="286" width="46" height="46" rx="12" fill="#20284f" stroke="#7aa2e6" stroke-opacity="0.9"/>
  <use href="#i-play" x="411" y="297" width="24" height="24" fill="#93c5fd"/>
  <text x="462" y="306" fill="#f3f6ff" font-size="20" font-weight="600">Act</text>
  <text x="462" y="330" fill="#9aa8c9" font-size="13">call a tool</text>

  <rect x="696" y="232" width="236" height="156" rx="18" fill="#171e42" stroke="#5d6cb0" stroke-width="1.5"/>
  <rect class="halo halo-observe" x="696" y="232" width="236" height="156" rx="18" fill="none"/>
  <rect x="714" y="286" width="46" height="46" rx="12" fill="#20284f" stroke="#8b93e8" stroke-opacity="0.9"/>
  <use href="#i-eye" x="725" y="297" width="24" height="24" fill="#a5b4fc" stroke="#a5b4fc"/>
  <text x="776" y="306" fill="#f3f6ff" font-size="20" font-weight="600">Observe</text>
  <text x="776" y="330" fill="#9aa8c9" font-size="13">parse results</text>

  <g fill="none" stroke="#8ea2d8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M304 310 H376" marker-end="url(#ah)"/>
    <path d="M618 310 H690" marker-end="url(#ah)"/>
    <path d="M814 388 V468" marker-end="url(#ah)"/>
    <path d="M864 508 H972 V121 H934" marker-end="url(#ah)"/>
  </g>

  <rect x="72" y="86" width="200" height="70" rx="16" fill="#142033" stroke="#3dcea6" stroke-width="1.6"/>
  <rect x="88" y="101" width="40" height="40" rx="11" fill="#15283a" stroke="#3dcea6" stroke-opacity="0.8"/>
  <use href="#i-bolt" x="96" y="109" width="24" height="24" fill="#5ee0b5"/>
  <text x="142" y="128" fill="#f3f6ff" font-size="18" font-weight="600">Trigger</text>

  <rect x="728" y="86" width="200" height="70" rx="16" fill="#141c36" stroke="#7ea2e8" stroke-width="1.6"/>
  <rect x="744" y="101" width="40" height="40" rx="11" fill="#18243f" stroke="#7ea2e8" stroke-opacity="0.85"/>
  <use href="#i-plane" x="752" y="109" width="24" height="24" fill="#c5d6ff"/>
  <text x="798" y="128" fill="#f3f6ff" font-size="18" font-weight="600">Output</text>

  <polygon points="814,468 864,508 814,548 764,508" fill="#12382f" stroke="#34d399" stroke-width="1.7" stroke-linejoin="round"/>
  <polygon class="halo halo-done" points="814,468 864,508 814,548 764,508" fill="none"/>
  <text x="814" y="513" text-anchor="middle" fill="#d1fae5" font-size="16" font-weight="600">Done?</text>

  <rect x="68" y="568" width="236" height="118" rx="18" fill="#171e42" stroke="#8d78e6" stroke-width="1.5"/>
  <rect x="86" y="604" width="46" height="46" rx="12" fill="#221c40" stroke="#8d78e6" stroke-opacity="0.85"/>
  <use href="#i-db" x="97" y="615" width="24" height="24" fill="none" stroke="#c4b5fd"/>
  <text x="148" y="624" fill="#f3f6ff" font-size="20" font-weight="600">Memory</text>
  <text x="148" y="648" fill="#9aa8c9" font-size="13">context · store</text>

  <rect x="382" y="568" width="236" height="118" rx="18" fill="#13262e" stroke="#3cb8c8" stroke-width="1.5"/>
  <rect x="400" y="604" width="46" height="46" rx="12" fill="#163038" stroke="#3cb8c8" stroke-opacity="0.9"/>
  <use href="#i-spark" x="411" y="615" width="24" height="24" fill="#5eead4"/>
  <text x="462" y="624" fill="#f3f6ff" font-size="20" font-weight="600">Tools</text>
  <text x="462" y="648" fill="#9aa8c9" font-size="13">search · code</text>

  <g fill="none" stroke="#7d8cc4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 7">
    <path class="dashed" d="M186 566 V392" marker-end="url(#ah)"/>
    <path class="dashed" d="M186 508 H760"/>
    <path class="dashed" d="M500 390 V566"/>
  </g>

  <g filter="url(#orb)">
    <circle r="11" fill="#7c6ae8" opacity="0.6">
      <animate attributeName="r" values="8;13;8" dur="2.4s" repeatCount="indefinite"/>
    </circle>
    <circle r="4.2" fill="#ffffff"/>
    <animateMotion dur="6.5s" repeatCount="indefinite" path="M530,508 H742 H214 H530"/>
  </g>
</svg>
```

The title opens on **Act · choose a tool, form the call**, iteration 1 of 2, then walks Observe, Done, and Think before the next pass.
