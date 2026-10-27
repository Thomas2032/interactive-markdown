#!/usr/bin/env node
/**
 * Mode B converter: schema-shaped JSON → Markdown with ```ivm fences.
 *
 * Usage:
 *   node docs/ai/schema-to-ivm.mjs docs/ai/fixtures/normal-density.json
 *   cat docs/ai/fixtures/normal-density.json | node docs/ai/schema-to-ivm.mjs
 *
 * Reads a document matching docs/ai/schema.json (title?, markdown_prose?, fences[]).
 * Emits long directive names. Does not invent unsupported directives.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * @param {unknown} v
 * @returns {string}
 */
function quoteLabel(v) {
  if (v == null || v === "") return "";
  return ` ${JSON.stringify(String(v))}`;
}

/**
 * @param {Record<string, unknown>} c
 * @returns {string[]}
 */
function emitControl(c) {
  const kind = c.kind;
  if (kind === "slider" || kind === "timer") {
    const name = c.name;
    let line = `@${kind} ${name}: ${c.min}..${c.max} = ${c.default}`;
    if (c.step != null) line += ` step=${c.step}`;
    if (kind === "timer") {
      if (c.speed != null) line += ` speed=${c.speed}`;
      if (c.loop === false) line += " noloop";
    }
    if (c.units === "deg" || c.units === "rad") line += ` ${c.units}`;
    line += quoteLabel(c.label);
    return [line];
  }
  if (kind === "input") {
    const def = c.default != null ? String(c.default) : "";
    return [`@input ${c.name}: ${JSON.stringify(def)}${quoteLabel(c.label)}`];
  }
  if (kind === "toggle") {
    const def = c.default === false ? "false" : "true";
    return [`@toggle ${c.name}: ${def}${quoteLabel(c.label)}`];
  }
  if (kind === "let") {
    return [`@let ${c.name} = ${c.expr}`];
  }
  if (kind === "fn") {
    const params = Array.isArray(c.params) ? c.params.join(",") : "";
    return [`@fn ${c.name}(${params}) = ${c.expr}`];
  }
  throw new Error(`unsupported control kind: ${kind}`);
}

/**
 * @param {Record<string, unknown>} fence
 * @returns {string[]}
 */
function emitPreamble(fence) {
  /** @type {string[]} */
  const lines = [];
  if (fence.ns) lines.push(`@ns ${fence.ns}`);
  if (fence.angle === "deg" || fence.angle === "rad") lines.push(`@angle ${fence.angle}`);
  if (Array.isArray(fence.phases)) {
    for (const p of fence.phases) {
      lines.push(`@phase ${p.name}: ${p.min}..${p.max}`);
    }
  }
  if (Array.isArray(fence.controls)) {
    for (const c of fence.controls) lines.push(...emitControl(c));
  }
  if (Array.isArray(fence.scrubs)) {
    for (const s of fence.scrubs) {
      let line = `@scrub ${s.name} duration=${s.duration}`;
      if (s.selector) line += ` selector=${s.selector}`;
      lines.push(line);
    }
  }
  if (Array.isArray(fence.data)) {
    for (const table of fence.data) {
      lines.push(`@data ${table.name}`);
      lines.push(table.headers.join(", "));
      for (const row of table.rows || []) {
        lines.push(
          row
            .map((cell) => {
              if (cell == null) return "";
              if (typeof cell === "string" && /[",\n]/.test(cell)) return JSON.stringify(cell);
              return String(cell);
            })
            .join(", ")
        );
      }
    }
  }
  if (Array.isArray(fence.anchors)) {
    for (const a of fence.anchors) {
      lines.push(`@anchor ${a.name} x=${a.x} y=${a.y}`);
    }
  }
  return lines;
}

/**
 * @param {Record<string, unknown>} axis
 * @returns {string}
 */
function emitAxis(axis) {
  let line = `@axis ${axis.which}: ${axis.min}..${axis.max}`;
  if (axis.step != null) line += ` step=${axis.step}`;
  if (axis.scale) line += ` scale=${axis.scale}`;
  if (Array.isArray(axis.cats) && axis.cats.length) line += ` cats=${axis.cats.join(",")}`;
  if (axis.linthresh != null) line += ` linthresh=${axis.linthresh}`;
  line += quoteLabel(axis.label);
  return line;
}

/**
 * @param {Record<string, unknown>} s
 * @returns {string[]}
 */
function emitSeries(s) {
  /** @type {string[]} */
  const head = ["@series"];
  if (s.id) head[0] += ` ${s.id}`;
  if (s.kind && s.kind !== "y") head[0] += ` kind=${s.kind}`;
  if (s.from) head[0] += ` from=${s.from}`;
  if (s.axis) head[0] += ` axis=${s.axis}`;
  if (s.marker) head[0] += ` marker=${s.marker}`;
  if (s.size != null) head[0] += ` size=${s.size}`;
  if (s.stroke) head[0] += ` stroke=${s.stroke}`;
  if (s.fill) head[0] += ` fill=${s.fill}`;
  if (s.fillOpacity != null) head[0] += ` fillOpacity=${s.fillOpacity}`;
  if (s.width != null) head[0] += ` width=${s.width}`;
  if (s.label) head[0] += quoteLabel(s.label);

  /** @type {string[]} */
  const body = [];
  if (s.cats != null) body.push(`  cats = ${s.cats}`);
  if (s.x != null) body.push(`  x = ${s.x}`);
  if (s.y != null) body.push(`  y = ${s.y}`);
  if (s.t != null) body.push(`  t = ${s.t}`);
  if (s.r != null) body.push(`  r = ${s.r}`);
  if (s.theta != null) body.push(`  theta = ${s.theta}`);
  return [...head, ...body];
}

/**
 * @param {Record<string, unknown>} fence
 * @returns {string}
 */
function emitFenceBody(fence) {
  /** @type {string[]} */
  const lines = [];
  const type = fence.type;

  if (type === "plot") {
    let plot = "@plot";
    if (fence.width && fence.height) plot += ` ${fence.width}x${fence.height}`;
    if (fence.grid === false) plot += " nogrid";
    else if (fence.grid === true) plot += " grid";
    if (fence.legend === false) plot += " nolegend";
    else if (fence.legend === true) plot += " legend";
    else if (typeof fence.legend === "string") plot += ` legend=${fence.legend}`;
    if (fence.lockAspect) plot += " lockAspect";
    if (fence.zoom) plot += " zoom";
    lines.push(plot);
    lines.push(...emitPreamble(fence));
    for (const axis of fence.axes || []) lines.push(emitAxis(axis));
    if (fence.legend_pos) lines.push(`@legend pos=${fence.legend_pos}`);
    for (const s of fence.series || []) lines.push(...emitSeries(s));
    for (const a of fence.annotations || []) {
      let line = `@annotate x=${a.x} y=${a.y} ${JSON.stringify(a.text)}`;
      if (a.dx != null) line += ` dx=${a.dx}`;
      if (a.dy != null) line += ` dy=${a.dy}`;
      if (a.axis) line += ` axis=${a.axis}`;
      if (a.stroke) line += ` stroke=${a.stroke}`;
      lines.push(line);
    }
    if (fence.svg_overlay) {
      lines.push("@svg");
      for (const row of String(fence.svg_overlay).replace(/\r\n/g, "\n").split("\n")) {
        lines.push(row === "" ? "" : row.startsWith("  ") ? row : `  ${row}`);
      }
    }
  } else if (type === "svg") {
    lines.push(...emitPreamble(fence));
    if (fence.width && fence.height) lines.push(`@svg ${fence.width}x${fence.height}`);
    else lines.push("@svg");
    for (const row of String(fence.markup || "").replace(/\r\n/g, "\n").split("\n")) {
      if (row === "") {
        lines.push("");
        continue;
      }
      lines.push(row.startsWith("  ") || row.startsWith("<") ? (row.startsWith("  ") ? row : `  ${row}`) : `  ${row}`);
    }
  } else if (type === "graph") {
    let g = "@graph";
    if (fence.layout) g += ` layout=${fence.layout}`;
    lines.push(g);
    lines.push(...emitPreamble(fence));
    for (const lane of fence.lanes || []) {
      let line = `@lane ${lane.id}: ${JSON.stringify(lane.label)} y=${lane.y}`;
      if (lane.height != null) line += ` height=${lane.height}`;
      if (lane.fill) line += ` fill=${lane.fill}`;
      lines.push(line);
    }
    for (const group of fence.groups || []) {
      lines.push(`@group ${group.id}: ${JSON.stringify(group.label)}`);
    }
    if (fence.animate) {
      const a = fence.animate;
      let line = "@animate";
      if (a.path) line += ` path=${a.path}`;
      if (a.quantity != null) line += ` quantity=${a.quantity}`;
      if (a.direction) line += ` direction=${a.direction}`;
      if (a.speed != null) line += ` speed=${a.speed}`;
      lines.push(line);
    }
    for (const n of fence.nodes || []) {
      let line = `@node ${n.id}: ${JSON.stringify(n.label)}`;
      if (n.x != null) line += ` x=${n.x}`;
      if (n.y != null) line += ` y=${n.y}`;
      if (n.kind) line += ` kind=${n.kind}`;
      if (n.lane) line += ` lane=${n.lane}`;
      if (n.group) line += ` group=${n.group}`;
      lines.push(line);
    }
    for (const e of fence.edges || []) {
      let line = `@edge ${e.from} -> ${e.to}`;
      if (e.from_port) line += ` from=${e.from_port}`;
      if (e.to_port) line += ` to=${e.to_port}`;
      lines.push(line);
    }
  } else {
    throw new Error(`unsupported fence type: ${type}`);
  }

  return lines.join("\n");
}

/**
 * @param {Record<string, unknown>} doc
 * @returns {string}
 */
export function documentToMarkdown(doc) {
  /** @type {string[]} */
  const parts = [];
  if (doc.title) parts.push(`# ${doc.title}`, "");
  if (doc.markdown_prose) {
    parts.push(String(doc.markdown_prose).replace(/\s+$/, ""), "");
  }
  const fences = Array.isArray(doc.fences) ? doc.fences : [];
  for (const fence of fences) {
    const body = emitFenceBody(fence);
    parts.push("```ivm", body, "```", "");
    if (fence.prose_after) {
      parts.push(String(fence.prose_after).replace(/\s+$/, ""), "");
    }
  }
  return parts.join("\n").replace(/\n+$/, "\n");
}

function readInput(argv) {
  if (argv[0] && argv[0] !== "-") {
    return readFileSync(resolve(argv[0]), "utf8");
  }
  return readFileSync(0, "utf8");
}

function main() {
  const raw = readInput(process.argv.slice(2));
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    console.error(`Invalid JSON: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.fences)) {
    console.error("Document must be an object with a fences array");
    process.exit(2);
  }
  process.stdout.write(documentToMarkdown(doc));
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);

if (isMain) main();
