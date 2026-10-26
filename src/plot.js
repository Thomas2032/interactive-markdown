/**
 * Cartesian / parametric / polar plot renderer for Interactive Markdown.
 * Builds an SVG matching a clean academic density-curve look:
 * white background, light gray grid, axes with ticks + labels,
 * optional stroke path and soft fill under the curve, legend, SVG overlay.
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
const LEGEND_BG = "rgba(255,255,255,0.92)";
const LEGEND_BORDER = "#d1d5db";

/**
 * @typedef {{ min: number, max: number, step?: number, label?: string, scale?: 'linear'|'log'|'symlog', linthresh?: number }} PlotAxis
 * @typedef {{
 *   id?: string,
 *   label?: string,
 *   kind?: 'y'|'parametric'|'polar',
 *   expression?: string,
 *   xExpression?: string,
 *   yExpression?: string,
 *   rExpression?: string,
 *   tMin?: number,
 *   tMax?: number,
 *   stroke?: string,
 *   fill?: string,
 *   fillOpacity?: number,
 *   width?: number,
 * }} PlotSeries
 * @typedef {{
 *   width?: number,
 *   height?: number,
 *   grid?: boolean,
 *   legend?: boolean,
 *   lockAspect?: boolean,
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
    legend: plot?.legend !== false,
    lockAspect: plot?.lockAspect === true,
    samples: Math.max(32, Math.min(2000, Math.round(finiteOr(plot?.samples, DEFAULT_SAMPLES)))),
    x: normalizeAxis(x, "x"),
    y: normalizeAxis(y, "y"),
    series: (plot?.series || []).map(normalizeSeries).filter(seriesIsDrawable),
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
  let scale = axis?.scale === "log" || axis?.scale === "symlog" ? axis.scale : "linear";
  if (scale === "log") {
    if (min <= 0) min = Math.min(max / 1000, 1e-6);
    if (max <= 0) max = 1;
    if (min > max) {
      const t = min;
      min = max;
      max = t;
    }
  }
  let step = axis?.step !== undefined ? Number(axis.step) : undefined;
  if (!Number.isFinite(step) || step <= 0) {
    step = scale === "linear" ? autoStep(min, max) : undefined;
  }
  let linthresh = axis?.linthresh !== undefined ? Number(axis.linthresh) : 1;
  if (!Number.isFinite(linthresh) || linthresh <= 0) linthresh = 1;
  /** @type {PlotAxis} */
  const out = {
    min,
    max,
    label: axis?.label != null && String(axis.label).length ? String(axis.label) : fallbackLabel,
    scale,
  };
  if (step !== undefined) out.step = step;
  if (scale === "symlog") out.linthresh = linthresh;
  return out;
}

/**
 * @param {Partial<PlotSeries>} series
 * @returns {PlotSeries}
 */
function normalizeSeries(series) {
  const fillOpacity = Number(series?.fillOpacity);
  const width = Number(series?.width);
  let kind = series?.kind;
  if (kind !== "y" && kind !== "parametric" && kind !== "polar") {
    if (series?.rExpression) kind = "polar";
    else if (series?.xExpression && (series?.yExpression || series?.expression)) kind = "parametric";
    else kind = "y";
  }
  let tMin = series?.tMin !== undefined ? Number(series.tMin) : 0;
  let tMax = series?.tMax !== undefined ? Number(series.tMax) : Math.PI * 2;
  if (!Number.isFinite(tMin)) tMin = 0;
  if (!Number.isFinite(tMax)) tMax = Math.PI * 2;
  if (tMin === tMax) tMax = tMin + 1;
  if (tMin > tMax) {
    const t = tMin;
    tMin = tMax;
    tMax = t;
  }
  /** @type {PlotSeries} */
  const out = {
    id: series?.id,
    label: series?.label || series?.id,
    kind,
    expression: String(series?.expression || "").trim(),
    xExpression: String(series?.xExpression || "").trim(),
    yExpression: String(series?.yExpression || series?.expression || "").trim(),
    rExpression: String(series?.rExpression || "").trim(),
    tMin,
    tMax,
    stroke: series?.stroke || DEFAULT_STROKE,
    fill: series?.fill || DEFAULT_FILL,
    fillOpacity: Number.isFinite(fillOpacity) ? clamp(fillOpacity, 0, 1) : DEFAULT_FILL_OPACITY,
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_STROKE_WIDTH,
  };
  if (kind === "parametric" && !out.yExpression && out.expression) {
    out.yExpression = out.expression;
  }
  return out;
}

/** @param {PlotSeries} series */
function seriesIsDrawable(series) {
  if (series.kind === "polar") return Boolean(series.rExpression);
  if (series.kind === "parametric") return Boolean(series.xExpression && series.yExpression);
  return Boolean(series.expression);
}

/**
 * Build SVG markup for a plot against the current variable environment.
 * @param {Partial<PlotModel>} plot
 * @param {Record<string, unknown>} env
 * @param {{ errors?: string[], overlayMarkup?: string|null }} [options]
 * @returns {string}
 */
export function buildPlotSvg(plot, env = {}, options = {}) {
  const errors = options.errors || [];
  const model = normalizePlot(plot);
  const W = model.width;
  const H = model.height;
  const m = { ...MARGIN };
  let plotW = Math.max(10, W - m.left - m.right);
  let plotH = Math.max(10, H - m.top - m.bottom);

  const xProj = makeProjector(model.x);
  const yProj = makeProjector(model.y);

  if (
    model.lockAspect &&
    model.x.scale === "linear" &&
    model.y.scale === "linear"
  ) {
    const xSpan = Math.abs(xProj.forward(model.x.max) - xProj.forward(model.x.min)) || 1;
    const ySpan = Math.abs(yProj.forward(model.y.max) - yProj.forward(model.y.min)) || 1;
    const unit = Math.min(plotW / xSpan, plotH / ySpan);
    const usedW = unit * xSpan;
    const usedH = unit * ySpan;
    m.left += (plotW - usedW) / 2;
    m.right += (plotW - usedW) / 2;
    m.top += (plotH - usedH) / 2;
    m.bottom += (plotH - usedH) / 2;
    plotW = usedW;
    plotH = usedH;
  }

  const xToPx = (x) => {
    const u0 = xProj.forward(model.x.min);
    const u1 = xProj.forward(model.x.max);
    const u = xProj.forward(x);
    return m.left + ((u - u0) / (u1 - u0 || 1)) * plotW;
  };
  const yToPx = (y) => {
    const u0 = yProj.forward(model.y.min);
    const u1 = yProj.forward(model.y.max);
    const u = yProj.forward(y);
    return m.top + plotH - ((u - u0) / (u1 - u0 || 1)) * plotH;
  };

  const parts = [];
  parts.push(
    `<svg viewBox="0 0 ${fmt(W)} ${fmt(H)}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="plot">`
  );
  parts.push(`  <rect width="${fmt(W)}" height="${fmt(H)}" fill="#ffffff"/>`);

  parts.push(`  <defs>`);
  parts.push(
    `    <clipPath id="im-plot-clip"><rect x="${fmt(m.left)}" y="${fmt(m.top)}" width="${fmt(plotW)}" height="${fmt(plotH)}"/></clipPath>`
  );
  parts.push(`  </defs>`);

  const xTicks = axisTicks(model.x);
  const yTicks = axisTicks(model.y);

  if (model.grid) {
    parts.push(`  <g class="im-plot-grid" stroke="${GRID_COLOR}" stroke-width="1" shape-rendering="crispEdges">`);
    for (const tx of xTicks) {
      const px = xToPx(tx);
      if (!Number.isFinite(px)) continue;
      parts.push(`    <line x1="${fmt(px)}" y1="${fmt(m.top)}" x2="${fmt(px)}" y2="${fmt(m.top + plotH)}"/>`);
    }
    for (const ty of yTicks) {
      const py = yToPx(ty);
      if (!Number.isFinite(py)) continue;
      parts.push(`    <line x1="${fmt(m.left)}" y1="${fmt(py)}" x2="${fmt(m.left + plotW)}" y2="${fmt(py)}"/>`);
    }
    parts.push(`  </g>`);
  }

  parts.push(`  <g class="im-plot-series" clip-path="url(#im-plot-clip)">`);
  /** @type {{ label: string, stroke: string }[]} */
  const legendItems = [];
  for (const series of model.series) {
    const sampled = sampleSeries(series, model, env, errors);
    const points = sampled.points;
    const name = seriesLabel(series);
    if (name) legendItems.push({ label: name, stroke: series.stroke || DEFAULT_STROKE });
    if (points.length < 2) {
      if (!sampled.hadError) {
        errors.push(`@series ${name || "(unnamed)"}: no plottable points`);
      }
      continue;
    }
    const lineD = pathFromPoints(points, xToPx, yToPx);
    if (series.kind === "y" && series.fill && series.fillOpacity > 0) {
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

  const axisY = m.top + plotH;
  const axisX = m.left;

  parts.push(`  <g class="im-plot-axes" stroke="${AXIS_COLOR}" stroke-width="1.25" fill="none" shape-rendering="crispEdges">`);
  parts.push(`    <line x1="${fmt(m.left)}" y1="${fmt(axisY)}" x2="${fmt(m.left + plotW)}" y2="${fmt(axisY)}"/>`);
  parts.push(`    <line x1="${fmt(axisX)}" y1="${fmt(m.top)}" x2="${fmt(axisX)}" y2="${fmt(m.top + plotH)}"/>`);
  parts.push(`  </g>`);

  parts.push(
    `  <g class="im-plot-ticks" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11" fill="${TICK_COLOR}">`
  );
  for (const tx of xTicks) {
    const px = xToPx(tx);
    if (!Number.isFinite(px)) continue;
    parts.push(
      `    <line x1="${fmt(px)}" y1="${fmt(axisY)}" x2="${fmt(px)}" y2="${fmt(axisY + 5)}" stroke="${AXIS_COLOR}" stroke-width="1"/>`
    );
    parts.push(
      `    <text x="${fmt(px)}" y="${fmt(axisY + 18)}" text-anchor="middle">${escapeText(formatTick(tx, model.x))}</text>`
    );
  }
  for (const ty of yTicks) {
    const py = yToPx(ty);
    if (!Number.isFinite(py)) continue;
    parts.push(
      `    <line x1="${fmt(axisX - 5)}" y1="${fmt(py)}" x2="${fmt(axisX)}" y2="${fmt(py)}" stroke="${AXIS_COLOR}" stroke-width="1"/>`
    );
    parts.push(
      `    <text x="${fmt(axisX - 8)}" y="${fmt(py + 3.5)}" text-anchor="end">${escapeText(formatTick(ty, model.y))}</text>`
    );
  }
  parts.push(`  </g>`);

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

  if (model.legend && legendItems.length) {
    parts.push(buildLegend(legendItems, m.left + plotW, m.top));
  }

  const overlay = options.overlayMarkup != null ? String(options.overlayMarkup).trim() : "";
  if (overlay) {
    parts.push(`  <g class="im-plot-overlay">`);
    parts.push(extractSvgInner(overlay));
    parts.push(`  </g>`);
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

/**
 * @param {{ label: string, stroke: string }[]} items
 * @param {number} right
 * @param {number} top
 */
function buildLegend(items, right, top) {
  const pad = 8;
  const rowH = 16;
  const swatch = 14;
  const maxLabel = Math.max(...items.map((it) => it.label.length), 4);
  const boxW = Math.min(180, 28 + swatch + maxLabel * 7);
  const boxH = pad * 2 + items.length * rowH;
  const x = right - boxW - 8;
  const y = top + 8;
  const parts = [];
  parts.push(`  <g class="im-plot-legend" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11">`);
  parts.push(
    `    <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(boxW)}" height="${fmt(boxH)}" rx="4" fill="${LEGEND_BG}" stroke="${LEGEND_BORDER}" stroke-width="1"/>`
  );
  items.forEach((it, i) => {
    const cy = y + pad + i * rowH + rowH / 2;
    parts.push(
      `    <line x1="${fmt(x + pad)}" y1="${fmt(cy)}" x2="${fmt(x + pad + swatch)}" y2="${fmt(cy)}" stroke="${escapeAttr(it.stroke)}" stroke-width="2.5" stroke-linecap="round"/>`
    );
    parts.push(
      `    <text x="${fmt(x + pad + swatch + 6)}" y="${fmt(cy + 3.5)}" fill="${LABEL_COLOR}">${escapeText(it.label)}</text>`
    );
  });
  parts.push(`  </g>`);
  return parts.join("\n");
}

/** @param {string} markup */
function extractSvgInner(markup) {
  const src = String(markup).trim();
  const m = src.match(/^<svg\b[^>]*>([\s\S]*)<\/svg\s*>$/i);
  if (m) return m[1].trim();
  return src;
}

/**
 * @param {PlotAxis} axis
 */
function makeProjector(axis) {
  const scale = axis.scale || "linear";
  const linthresh = axis.linthresh || 1;
  if (scale === "log") {
    return {
      forward(v) {
        const n = Number(v);
        if (!(n > 0) || !Number.isFinite(n)) return NaN;
        return Math.log10(n);
      },
    };
  }
  if (scale === "symlog") {
    return {
      forward(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return NaN;
        // matplotlib-style: sign(v) * log10(1 + |v|/linthresh)
        return Math.sign(n) * Math.log10(1 + Math.abs(n) / linthresh);
      },
    };
  }
  return {
    forward(v) {
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    },
  };
}

/**
 * @param {PlotAxis} axis
 * @returns {number[]}
 */
function axisTicks(axis) {
  const scale = axis.scale || "linear";
  if (scale === "log") return logTicks(axis.min, axis.max);
  if (scale === "symlog") return symlogTicks(axis.min, axis.max, axis.linthresh || 1);
  return ticks(axis.min, axis.max, axis.step || autoStep(axis.min, axis.max));
}

function logTicks(min, max) {
  const out = [];
  if (!(min > 0) || !(max > 0)) return out;
  const startExp = Math.floor(Math.log10(min));
  const endExp = Math.ceil(Math.log10(max));
  for (let e = startExp; e <= endExp; e++) {
    const v = Math.pow(10, e);
    if (v >= min * (1 - 1e-12) && v <= max * (1 + 1e-12)) out.push(v);
    if (out.length > 40) break;
  }
  if (!out.length) {
    out.push(min);
    if (max !== min) out.push(max);
  }
  return out;
}

function symlogTicks(min, max, linthresh) {
  const out = [];
  const candidates = new Set();
  candidates.add(0);
  candidates.add(min);
  candidates.add(max);
  for (const sign of [-1, 1]) {
    for (let e = -2; e <= 6; e++) {
      candidates.add(sign * linthresh * Math.pow(10, e));
      candidates.add(sign * Math.pow(10, e));
    }
  }
  for (const v of [...candidates].sort((a, b) => a - b)) {
    if (v >= min - 1e-12 && v <= max + 1e-12) out.push(v);
    if (out.length > 40) break;
  }
  return out.length ? out : [min, max];
}

/**
 * @param {PlotSeries} series
 * @param {PlotModel} model
 * @param {Record<string, unknown>} env
 * @param {string[]} errors
 * @returns {{ points: { x: number, y: number }[], hadError: boolean }}
 */
function sampleSeries(series, model, env, errors) {
  const n = model.samples;
  /** @type {{ x: number, y: number }[]} */
  const points = [];
  let hadError = false;
  let firstError = "";
  const name = seriesLabel(series) || "(unnamed)";

  const pushPoint = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    points.push({ x, y });
  };

  const evalLocal = (expression, local) => {
    try {
      return Number(evaluate(expression, local));
    } catch (err) {
      if (!firstError) firstError = /** @type {Error} */ (err).message || String(err);
      hadError = true;
      return NaN;
    }
  };

  if (series.kind === "polar") {
    const span = (series.tMax ?? Math.PI * 2) - (series.tMin ?? 0);
    for (let i = 0; i <= n; i++) {
      const theta = (series.tMin ?? 0) + (span * i) / n;
      /** @type {Record<string, unknown>} */
      const local = Object.create(null);
      Object.assign(local, env);
      local.theta = theta;
      local.t = theta;
      const r = evalLocal(series.rExpression || "", local);
      if (!Number.isFinite(r)) continue;
      pushPoint(r * Math.cos(theta), r * Math.sin(theta));
    }
  } else if (series.kind === "parametric") {
    const span = (series.tMax ?? Math.PI * 2) - (series.tMin ?? 0);
    for (let i = 0; i <= n; i++) {
      const t = (series.tMin ?? 0) + (span * i) / n;
      /** @type {Record<string, unknown>} */
      const local = Object.create(null);
      Object.assign(local, env);
      local.t = t;
      const x = evalLocal(series.xExpression || "", local);
      const y = evalLocal(series.yExpression || "", local);
      pushPoint(x, y);
    }
  } else {
    const span = model.x.max - model.x.min;
    // Sample in projected space for log/symlog so curves look even
    const proj = makeProjector(model.x);
    const u0 = proj.forward(model.x.min);
    const u1 = proj.forward(model.x.max);
    const useProj = Number.isFinite(u0) && Number.isFinite(u1) && model.x.scale !== "linear";
    for (let i = 0; i <= n; i++) {
      let x;
      if (useProj) {
        const u = u0 + ((u1 - u0) * i) / n;
        x = inverseProject(model.x, u);
      } else {
        x = model.x.min + (span * i) / n;
      }
      if (!Number.isFinite(x)) continue;
      /** @type {Record<string, unknown>} */
      const local = Object.create(null);
      Object.assign(local, env);
      local.x = x;
      const y = evalLocal(series.expression || "", local);
      pushPoint(x, y);
    }
  }

  if (hadError && firstError) {
    errors.push(`@series ${name}: ${firstError}`);
  }
  return { points, hadError };
}

/**
 * Inverse of makeProjector.forward for sampling.
 * @param {PlotAxis} axis
 * @param {number} u
 */
function inverseProject(axis, u) {
  const scale = axis.scale || "linear";
  const linthresh = axis.linthresh || 1;
  if (scale === "log") return Math.pow(10, u);
  if (scale === "symlog") {
    // u = sign * log10(1 + |v|/linthresh)  =>  |v| = linthresh * (10^|u| - 1)
    const s = Math.sign(u) || 1;
    return s * linthresh * (Math.pow(10, Math.abs(u)) - 1);
  }
  return u;
}

/** @param {PlotSeries} series */
function seriesLabel(series) {
  if (series.label) return String(series.label);
  if (series.id) return String(series.id);
  return "";
}

/**
 * @param {{ x: number, y: number }[]} points
 * @param {(x: number) => number} xToPx
 * @param {(y: number) => number} yToPx
 */
function pathFromPoints(points, xToPx, yToPx) {
  let d = "";
  let started = false;
  for (let i = 0; i < points.length; i++) {
    const px = xToPx(points[i].x);
    const py = yToPx(points[i].y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      started = false;
      continue;
    }
    const cmd = started ? "L" : "M";
    d += `${cmd}${fmt(px)} ${fmt(py)}`;
    if (i < points.length - 1) d += " ";
    started = true;
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

/**
 * @param {number} n
 * @param {PlotAxis} [axis]
 */
function formatTick(n, axis) {
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) < 1e-12) return "0";
  if (axis?.scale === "log" || axis?.scale === "symlog") {
    const abs = Math.abs(n);
    if (abs >= 1000 || (abs > 0 && abs < 0.01)) {
      const exp = Math.round(Math.log10(abs));
      if (Math.abs(abs / Math.pow(10, exp) - 1) < 1e-6) {
        return (n < 0 ? "-" : "") + "10^" + exp;
      }
    }
  }
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
  const size = plotSizeSuffix(model.width, model.height);
  const gridFlag = model.grid === false ? " nogrid" : "";
  const legendFlag = model.legend === false ? " nolegend" : "";
  const aspectFlag = model.lockAspect ? " lockAspect" : "";
  lines.push(`@plot${size}${gridFlag}${legendFlag}${aspectFlag}`);
  lines.push(serializeAxis("x", model.x));
  lines.push(serializeAxis("y", model.y));
  for (const series of model.series) {
    let head = "@series";
    if (series.id) head += ` ${series.id}`;
    head += ` stroke=${series.stroke}`;
    if (series.fillOpacity > 0 && series.kind === "y") {
      head += ` fill=${series.fill}`;
      head += ` fillOpacity=${fmt(series.fillOpacity)}`;
    }
    if (series.width !== DEFAULT_STROKE_WIDTH) head += ` width=${fmt(series.width)}`;
    if (series.label && series.label !== series.id) head += ` ${quoteLabel(series.label)}`;
    lines.push(head);
    if (series.kind === "polar") {
      lines.push(`  r = ${series.rExpression}`);
      lines.push(`  theta = ${fmt(series.tMin ?? 0)}..${fmt(series.tMax ?? Math.PI * 2)}`);
    } else if (series.kind === "parametric") {
      lines.push(`  x = ${series.xExpression}`);
      lines.push(`  y = ${series.yExpression}`);
      lines.push(`  t = ${fmt(series.tMin ?? 0)}..${fmt(series.tMax ?? Math.PI * 2)}`);
    } else {
      lines.push(`  y = ${series.expression}`);
    }
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
  if (axis.scale && axis.scale !== "linear") line += ` scale=${axis.scale}`;
  if (axis.scale === "symlog" && axis.linthresh != null && axis.linthresh !== 1) {
    line += ` linthresh=${fmt(axis.linthresh)}`;
  }
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
  MARGIN,
};
