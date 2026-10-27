# Universal user prompt (IVM)

Copy this into a chat after the system prompt / LLM protocol. Replace the placeholders.

---

## Task

Topic: {{topic}}

Requirements:
{{requirements}}

## Output

Produce a single Markdown document that teaches or explains the topic.

1. Use ordinary Markdown for headings, prose, lists, and static tables.
2. Add ```ivm fences **only where interactivity helps** (live parameters, a chart the reader should explore, a flowchart of a process, or a small animated figure). If a static explanation is enough, skip IVM.
3. Prefer **several small fences** over one large fence. Share sliders across figures with the same `@ns name`.
4. Choose mode from the ask:
   - equations / curves / bars / scatter → `@plot` (use `@data` when values are tabular)
   - custom drawing / animation → `@svg`
   - process / architecture / agent loop → `@graph layout=dagre` (omit handmade x/y)
5. Prefer long directive names. Declare controls before use. Use `@angle deg` or `sind`/`cosd` when thinking in degrees.
6. Do not invent directives or JavaScript. Bind SVG with `{{expr}}` only.
7. End with a short “How to try it” note: open the file in an Interactive Markdown preview (or paste into the editor), then drag any sliders.

## Optional constraints (edit or delete)

- Audience: {{audience}}
- Length: {{length}}
- Must include: {{must_include}}
- Must avoid: {{must_avoid}}
- Namespace for shared controls (if any): {{ns}}

---

### Placeholder guide

| Placeholder | Example |
|-------------|---------|
| `{{topic}}` | Compound interest; Normal density; HTTP request lifecycle |
| `{{requirements}}` | Sliders for principal/rate/years; show balance curve; one flowchart of deposit → interest → balance |
| `{{audience}}` | High-school, no calculus |
| `{{length}}` | ~1 screen of prose + 1–2 fences |
| `{{must_include}}` | `@plot` of balance vs years; `@data` table of sample rates |
| `{{must_avoid}}` | Hand-drawn axes in raw SVG; degrees without `@angle deg` |
| `{{ns}}` | `lesson1` |
