/**
 * Cartesian XY plot renderer for Interactive Markdown.
 * Builds an SVG matching a clean academic density-curve look:
 * white background, light gray grid, axes with ticks + labels,
 * optional stroke path and soft fill under the curve.
 */

import { evaluate } from "./expr.js";

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 320;
const MARGIN = { top: 24, right: 28, bottom: 48, left: 64 };
const DEFAULT_SAMPLES = 240;
const DEFAULT_STROKE = "#6d28d9";
const DEFAULT_FILL = "#7c3aed";
const DEFAULT_FILL_OPACITY = 0.25;
const DEFAULT_STROKE_WIDTH = 2.25;
const AXIS_COLOR = "#4b5563";
const GRID_COLOR = "#e5e7eb";
const TICK_COLOR = "#6b7280";
const LABEL_COLOR = "#374151";

/**
 * @typedef {{ min: number, max: number, step?: number, label?: string }} PlotAxis
 * @typedef {{
 *   id?: string,
 *   expression: string,
 *   stroke?: string,
 *   fill?: string,
 *   fillOpacity?: number,
 *   width?: number,
 * }} PlotSeries
 * @typedef {{
 *   width?: number,
 *   height?: number,
 *   grid?: boolean,
 *   samples?: number,
 *   x: PlotAxis,
 *   y: PlotAxis,
 *   series: PlotSeries[],
 * }} PlotModel
 */

/**
 * @param {Partial<PlotModel> | null | undefined} plot
 * @returns {PlotModel}
 */
export function normalizePlot(plot) {
  const x = plot?.x || { min: -10, max: 10, step: 2, label: "x" };
  const y = plot?.y || { min: 0, max: 1, step: 0.2, label: "y" };
  return {
    width: positiveOr(plot?.width, DEFAULT_WIDTH),
    height: positiveOr(plot?.height, DEFAULT_HEIGHT),
    grid: plot?.grid !== false,
    samples: Math.max(32, Math.min(2000, Math.round(finiteOr(plot?.samples, DEFAULT_SAMPLES)))),
    x: normalizeAxis(x, "x"),
    y: normalizeAxis(y, "y"),
    series: (plot?.series || []).map(normalizeSeries).filter((s) => s.expression),
  };
}

/**
 * @param {Partial<PlotAxis>} axis
 * @param {string} fallbackLabel
 * @returns {PlotAxis}
 */
function normalizeAxis(axis, fallbackLabel) {
  let min = Number(axis?.min);
  let max = Number(axis?.max);
  if (!Number.isFinite(min)) min = fallbackLabel === "y" ? 0 : -10;
  if (!Number.isFinite(max)) max = fallbackLabel === "y" ? 1 : 10;
  if (min === max) max = min + 1;
  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }
  let step = axis?.step !== undefined ? Number(axis.step) : autoStep(min, max);
  if (!Number.isFinite(step) || step <= 0) step = autoStep(min, max);
  return {
    min,
    max,
    step,
    label: axis?.label != null && String(axis.label).length ? String(axis.label) : fallbackLabel,
  };
}

/**
 * @param {Partial<PlotSeries>} series
 * @returns {PlotSeries}
 */
function normalizeSeries(series) {
  const fillOpacity = Number(series?.fillOpacity);
  const width = Number(series?.width);
  return {
    id: series?.id,
    expression: String(series?.expression || "").trim(),
    stroke: series?.stroke || DEFAULT_STROKE,
    fill: series?.fill || DEFAULT_FILL,
    fillOpacity: Number.isFinite(fillOpacity) ? clamp(fillOpacity, 0, 1) : DEFAULT_FILL_OPACITY,
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_STROKE_WIDTH,
  };
}

/**
 * Build SVG markup for a plot against the current variable environment.
 * Free variable `x` is sampled across the X axis; other names come from env.
 * @param {Partial<PlotModel>} plot
 * @param {Record<string, unknown>} env
 * @returns {string}
 */
export function buildPlotSvg(plot, env = {}) {
  const model = normalizePlot(plot);
  const W = model.width;
  const H = model.height;
  const m = MARGIN;
  const plotW = Math.max(10, W - m.left - m.right);
  const plotH = Math.max(10, H - m.top - m.bottom);

  const xToPx = (x) => m.left + ((x - model.x.min) / (model.x.max - model.x.min)) * plotW;
  const yToPx = (y) => m.top + plotH - ((y - model.y.min) / (model.y.max - model.y.min)) * plotH;

  const parts = [];
  parts.push(
    `<svg viewBox="0 0 ${fmt(W)} ${fmt(H)}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="plot">`
  );
  parts.push(`  <rect width="${fmt(W)}" height="${fmt(H)}" fill="#ffffff"/>`);

  // Clip series to the plot frame
  parts.push(`  <defs>`);
  parts.push(
    `    <clipPath id="im-plot-clip"><rect x="${fmt(m.left)}" y="${fmt(m.top)}" width="${fmt(plotW)}" height="${fmt(plotH)}"/></clipPath>`
  );
  parts.push(`  </defs>`);

  if (model.grid) {
    parts.push(`  <g class="im-plot-grid" stroke="${GRID_COLOR}" stroke-width="1" shape-rendering="crispEdges">`);
    for (const tx of ticks(model.x.min, model.x.max, model.x.step)) {
      const px = xToPx(tx);
      parts.push(`    <line x1="${fmt(px)}" y1="${fmt(m.top)}" x2="${fmt(px)}" y2="${fmt(m.top + plotH)}"/>`);
    }
    for (const ty of ticks(model.y.min, model.y.max, model.y.step)) {
      const py = yToPx(ty);
      parts.push(`    <line x1="${fmt(m.left)}" y1="${fmt(py)}" x2="${fmt(m.left + plotW)}" y2="${fmt(py)}"/>`);
    }
    parts.push(`  </g>`);
  }

  // Series under axes so axes stay crisp on top
  parts.push(`  <g class="im-plot-series" clip-path="url(#im-plot-clip)">`);
  for (const series of model.series) {
    const points = sampleSeries(series.expression, model, env);
    if (points.length < 2) continue;
    const lineD = pathFromPoints(points, xToPx, yToPx);
    if (series.fill && series.fillOpacity > 0) {
      const baseY = clamp(model.y.min, model.y.min, model.y.max);
      const first = points[0];
      const last = points[points.length - 1];
      const areaD =
        lineD +
        ` L ${fmt(xToPx(last.x))} ${fmt(yToPx(baseY))}` +
        ` L ${fmt(xToPx(first.x))} ${fmt(yToPx(baseY))} Z`;
      parts.push(
        `    <path d="${areaD}" fill="${escapeAttr(series.fill)}" fill-opacity="${fmt(series.fillOpacity)}" stroke="none"/>`
      );
    }
    parts.push(
      `    <path d="${lineD}" fill="none" stroke="${escapeAttr(series.stroke)}" stroke-width="${fmt(series.width)}" stroke-linejoin="round" stroke-linecap="round"/>`
    );
  }
  parts.push(`  </g>`);

  // Axes sit on the bottom and left of the plot frame (matplotlib-style spines)
  const axisY = m.top + plotH;
  const axisX = m.left;

  parts.push(`  <g class="im-plot-axes" stroke="${AXIS_COLOR}" stroke-width="1.25" fill="none" shape-rendering="crispEdges">`);
  parts.push(`    <line x1="${fmt(m.left)}" y1="${fmt(axisY)}" x2="${fmt(m.left + plotW)}" y2="${fmt(axisY)}"/>`);
  parts.push(`    <line x1="${fmt(axisX)}" y1="${fmt(m.top)}" x2="${fmt(axisX)}" y2="${fmt(m.top + plotH)}"/>`);
  parts.push(`  </g>`);

  // Ticks + numeric labels
  parts.push(
    `  <g class="im-plot-ticks" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11" fill="${TICK_COLOR}">`
  );
  for (const tx of ticks(model.x.min, model.x.max, model.x.step)) {
    const px = xToPx(tx);
    parts.push(
      `    <line x1="${fmt(px)}" y1="${fmt(axisY)}" x2="${fmt(px)}" y2="${fmt(axisY + 5)}" stroke="${AXIS_COLOR}" stroke-width="1"/>`
    );
    parts.push(
      `    <text x="${fmt(px)}" y="${fmt(axisY + 18)}" text-anchor="middle">${escapeText(formatTick(tx))}</text>`
    );
  }
  for (const ty of ticks(model.y.min, model.y.max, model.y.step)) {
    const py = yToPx(ty);
    parts.push(
      `    <line x1="${fmt(axisX - 5)}" y1="${fmt(py)}" x2="${fmt(axisX)}" y2="${fmt(py)}" stroke="${AXIS_COLOR}" stroke-width="1"/>`
    );
    parts.push(
      `    <text x="${fmt(axisX - 8)}" y="${fmt(py + 3.5)}" text-anchor="end">${escapeText(formatTick(ty))}</text>`
    );
  }
  parts.push(`  </g>`);

  // Axis titles
  parts.push(
    `  <g class="im-plot-labels" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="13" font-weight="600" fill="${LABEL_COLOR}">`
  );
  parts.push(
    `    <text x="${fmt(m.left + plotW / 2)}" y="${fmt(H - 12)}" text-anchor="middle">${escapeText(model.x.label)}</text>`
  );
  const yLabelX = 16;
  const yLabelY = m.top + plotH / 2;
  parts.push(
    `    <text x="${fmt(yLabelX)}" y="${fmt(yLabelY)}" text-anchor="middle" transform="rotate(-90 ${fmt(yLabelX)} ${fmt(yLabelY)})">${escapeText(model.y.label)}</text>`
  );
  parts.push(`  </g>`);

  parts.push(`</svg>`);
  return parts.join("\n");
}

/**
 * @param {string} expression
 * @param {PlotModel} model
 * @param {Record<string, unknown>} env
 * @returns {{ x: number, y: number }[]}
 */
function sampleSeries(expression, model, env) {
  const n = model.samples;
  const span = model.x.max - model.x.min;
  /** @type {{ x: number, y: number }[]} */
  const points = [];
  for (let i = 0; i <= n; i++) {
    const x = model.x.min + (span * i) / n;
    /** @type {Record<string, unknown>} */
    const local = Object.create(null);
    Object.assign(local, env);
    local.x = x;
    try {
      const y = Number(evaluate(expression, local));
      if (!Number.isFinite(y)) continue;
      points.push({ x, y });
    } catch (_) {
      // skip bad samples; keep the rest of the curve
    }
  }
  return points;
}

/**
 * @param {{ x: number, y: number }[]} points
 * @param {(x: number) => number} xToPx
 * @param {(y: number) => number} yToPx
 */
function pathFromPoints(points, xToPx, yToPx) {
  let d = "";
  for (let i = 0; i < points.length; i++) {
    const cmd = i === 0 ? "M" : "L";
    d += `${cmd}${fmt(xToPx(points[i].x))} ${fmt(yToPx(points[i].y))}`;
    if (i < points.length - 1) d += " ";
  }
  return d;
}

/**
 * @param {number} min
 * @param {number} max
 * @param {number} step
 * @returns {number[]}
 */
export function ticks(min, max, step) {
  const out = [];
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0) return out;
  const start = Math.ceil((min - 1e-12) / step) * step;
  for (let v = start; v <= max + 1e-9; v += step) {
    const rounded = Math.round(v / step) * step;
    const clamped = Math.abs(rounded) < step * 1e-9 ? 0 : rounded;
    if (clamped < min - 1e-9 || clamped > max + 1e-9) continue;
    out.push(clamped);
    if (out.length > 200) break;
  }
  if (!out.length || out[0] > min + 1e-9) out.unshift(min);
  if (out[out.length - 1] < max - 1e-9) out.push(max);
  return out;
}

function autoStep(min, max) {
  const span = Math.abs(max - min) || 1;
  const rough = span / 8;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const err = rough / pow;
  let nice = 1;
  if (err >= 5) nice = 5;
  else if (err >= 2) nice = 2;
  return nice * pow;
}

function formatTick(n) {
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) < 1e-12) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000 || (abs > 0 && abs < 0.001)) return String(Number(n.toPrecision(4)));
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(rounded);
}

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Positive finite size, else fallback. Rejects null/undefined/0/NaN (Number(null)===0). */
function positiveOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * @param {number} width
 * @param {number} height
 */
function plotSizeSuffix(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "";
  if (width === DEFAULT_WIDTH && height === DEFAULT_HEIGHT) return "";
  return ` ${fmt(width)}x${fmt(height)}`;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function fmt(n) {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

/**
 * Serialize a plot model (+ optional controls already handled by caller) to fence lines.
 * @param {Partial<PlotModel>} plot
 * @returns {string[]}
 */
export function serializePlotLines(plot) {
  const model = normalizePlot(plot);
  /** @type {string[]} */
  const lines = [];
  // Only emit WxH when both are positive finite and differ from defaults.
  // Missing / 0 / NaN sizes normalize to defaults and stay as bare @plot (never 0x0).
  const size = plotSizeSuffix(model.width, model.height);
  const gridFlag = model.grid === false ? " nogrid" : "";
  lines.push(`@plot${size}${gridFlag}`);
  lines.push(serializeAxis("x", model.x));
  lines.push(serializeAxis("y", model.y));
  for (const series of model.series) {
    let head = "@series";
    if (series.id) head += ` ${series.id}`;
    head += ` stroke=${series.stroke}`;
    if (series.fillOpacity > 0) {
      head += ` fill=${series.fill}`;
      head += ` fillOpacity=${fmt(series.fillOpacity)}`;
    }
    if (series.width !== DEFAULT_STROKE_WIDTH) head += ` width=${fmt(series.width)}`;
    lines.push(head);
    lines.push(`  y = ${series.expression}`);
  }
  return lines;
}

/**
 * @param {"x"|"y"} which
 * @param {PlotAxis} axis
 */
function serializeAxis(which, axis) {
  let line = `@axis ${which}: ${fmt(axis.min)}..${fmt(axis.max)}`;
  if (axis.step != null) line += ` step=${fmt(axis.step)}`;
  if (axis.label) line += ` ${quoteLabel(axis.label)}`;
  return line;
}

function quoteLabel(label) {
  return `"${String(label).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_STROKE,
  DEFAULT_FILL,
  DEFAULT_FILL_OPACITY,
  DEFAULT_STROKE_WIDTH,
};
