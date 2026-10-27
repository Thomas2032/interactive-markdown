# AI generation kit (Interactive Markdown)

**Aim:** keep Interactive Markdown (IVM) flexible, easy for humans to read and write, and accurate + efficient for LLMs to generate.

IVM is one fence language (` ```ivm `) with three modes — **plot**, **svg**, and **graph** — plus ordinary Markdown prose. Interactivity is declarative (sliders, timers, `@let`, `@data`, …), not invented JavaScript.

## Three ways to generate

| Mode | When | Flow |
|------|------|------|
| **A — Direct prompt** | One-shot answers, small lessons | Paste [`system-prompt.txt`](system-prompt.txt) + [`llm-protocol.md`](llm-protocol.md) (or the protocol alone). User asks in natural language (or use [`universal-template.md`](universal-template.md)). Model emits Markdown with `ivm` fences. |
| **B — Schema + convert** | Structured pipelines, tools, batch | Model fills [`schema.json`](schema.json). Run [`schema-to-ivm.mjs`](schema-to-ivm.mjs) → Markdown. Then validate. |
| **C — Few-shot + validate** | Higher accuracy / repair loops | Seed with [golden snippets](../golden-snippets.md) + protocol. After each draft, run `ivm check` and rewrite **only** broken fences. |

Prefer **small fences** composed with Markdown and `@ns` for shared controls — not one mega-fence.

## Files in this folder

| File | Role |
|------|------|
| [`llm-protocol.md`](llm-protocol.md) | Compact cheat sheet to embed in prompts (~one screen) |
| [`system-prompt.txt`](system-prompt.txt) | Copy-paste system prompt (self-contained) |
| [`universal-template.md`](universal-template.md) | User-prompt template (`{{topic}}`, `{{requirements}}`) |
| [`schema.json`](schema.json) | JSON Schema for structured intermediate documents |
| [`schema-to-ivm.mjs`](schema-to-ivm.mjs) | Mode B converter: JSON → Markdown + `ivm` fences |
| [`fixtures/`](fixtures/) | Tiny JSON samples for the converter |

Human dialect reference: [README](../../README.md). Copy-paste recipes: [golden-snippets.md](../golden-snippets.md).

## Validate → repair loop

After generation (any mode):

```bash
# human-readable
npm run check -- path/to/doc.md

# machine-readable (agents)
npm run check -- --json path/to/doc.md
# or: npx ivm-check --json path/to/doc.md
```

Exit **1** only when error-severity diagnostics exist (warnings alone → 0). JSON fields include `fence`, `line`, `severity`, `code`, `message`, `hint`.

**Discipline:** keep valid fences; rewrite only fences that failed. Prefer high-level `@plot` / `@data` / `layout=dagre` over hand-rolled SVG or handmade node coordinates when the ask allows it.

## Design principles (short)

1. **One fence language, three modes** — choose plot / svg / graph from the ask; do not invent tags.
2. **Declarations humans can skim** — no JS, no frameworks.
3. **Tables → `@data` + `@plot`** when the ask is tabular.
4. **`layout=dagre`** over handmade `x=` / `y=` for graphs.
5. **Long directive names** in human docs; short aliases (`@s`, `@t`, …) allowed for token-efficient generation.
6. **Always `ivm check`**, then repair only broken fences.
7. **Flexibility = compose** Markdown + several small fences + `@ns`, not one giant fence.
