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
 * @typedef {{ min: number, max: number, step?: number, label?: string, scale?: 'linear'|'log'|'symlog'|'categorical', linthresh?: number, cats?: string[] }} PlotAxis
 * @typedef {{
 *   id?: string,
 *   label?: string,
 *   kind?: 'y'|'parametric'|'polar'|'bar'|'scatter',
 *   expression?: string,
 *   xExpression?: string,
 *   yExpression?: string,
 *   rExpression?: string,
 *   catsExpression?: string,
 *   tMin?: number,
 *   tMax?: number,
 *   stroke?: string,
 *   fill?: string,
 *   fillOpacity?: number,
 *   width?: number,
 *   marker?: 'circle'|'square'|'diamond',
 *   markerSize?: number,
 *   axis?: 'y'|'y2',
 * }} PlotSeries
 * @typedef {{ x?: number, y?: number, text: string, dx?: number, dy?: number, stroke?: string, axis?: 'y'|'y2' }} PlotAnnotation
 * @typedef {{
 *   width?: number,
 *   height?: number,
 *   grid?: boolean,
 *   legend?: boolean,
 *   legendPos?: 'top-right'|'top-left'|'bottom-right'|'bottom-left',
 *   lockAspect?: boolean,
 *   zoom?: boolean,
 *   samples?: number,
 *   x: PlotAxis,
 *   y: PlotAxis,
 *   y2?: PlotAxis|null,
 *   series: PlotSeries[],
 *   annotations?: PlotAnnotation[],
 *   view?: { xMin?: number, xMax?: number, yMin?: number, yMax?: number, y2Min?: number, y2Max?: number }|null,
 * }} PlotModel
 */

/**
 * @param {Partial<PlotModel> | null | undefined} plot
 * @returns {PlotModel}
 */
export function normalizePlot(plot) {
  const x = plot?.x || { min: -10, max: 10, step: 2, label: "x" };
  const y = plot?.y || { min: 0, max: 1, step: 0.2, label: "y" };
  const pos = String(plot?.legendPos || "top-right").toLowerCase();
  const legendPos =
    pos === "top-left" || pos === "bottom-right" || pos === "bottom-left" || pos === "top-right"
      ? pos
      : "top-right";
  /** @type {PlotModel} */
  const out = {
    width: positiveOr(plot?.width, DEFAULT_WIDTH),
    height: positiveOr(plot?.height, DEFAULT_HEIGHT),
    grid: plot?.grid !== false,
    legend: plot?.legend !== false,
    legendPos,
    lockAspect: plot?.lockAspect === true,
    zoom: plot?.zoom !== false,
    samples: Math.max(32, Math.min(2000, Math.round(finiteOr(plot?.samples, DEFAULT_SAMPLES)))),
    x: normalizeAxis(x, "x"),
    y: normalizeAxis(y, "y"),
    y2: plot?.y2 ? normalizeAxis(plot.y2, "y2") : null,
    series: (plot?.series || []).map(normalizeSeries).filter(seriesIsDrawable),
    annotations: Array.isArray(plot?.annotations)
      ? plot.annotations
          .map((a) => ({
            x: Number(a?.x),
            y: Number(a?.y),
            text: String(a?.text ?? ""),
            dx: a?.dx != null ? Number(a.dx) : 8,
            dy: a?.dy != null ? Number(a.dy) : -10,
            stroke: a?.stroke || LABEL_COLOR,
            axis: a?.axis === "y2" ? "y2" : "y",
          }))
          .filter((a) => a.text && Number.isFinite(a.x) && Number.isFinite(a.y))
      : [],
    view: plot?.view || null,
  };
  // Apply interactive view window overrides
  if (out.view) {
    if (Number.isFinite(out.view.xMin)) out.x.min = /** @type {number} */ (out.view.xMin);
    if (Number.isFinite(out.view.xMax)) out.x.max = /** @type {number} */ (out.view.xMax);
    if (Number.isFinite(out.view.yMin)) out.y.min = /** @type {number} */ (out.view.yMin);
    if (Number.isFinite(out.view.yMax)) out.y.max = /** @type {number} */ (out.view.yMax);
    if (out.y2) {
      if (Number.isFinite(out.view.y2Min)) out.y2.min = /** @type {number} */ (out.view.y2Min);
      if (Number.isFinite(out.view.y2Max)) out.y2.max = /** @type {number} */ (out.view.y2Max);
    }
  }
  return out;
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
  let scale =
    axis?.scale === "log" || axis?.scale === "symlog" || axis?.scale === "categorical"
      ? axis.scale
      : "linear";
  /** @type {string[]|undefined} */
  let cats = Array.isArray(axis?.cats) ? axis.cats.map((c) => String(c)) : undefined;
  if (scale === "categorical" && cats && cats.length) {
    min = -0.5;
    max = cats.length - 0.5;
  }
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
  if (scale === "categorical" && cats && cats.length) out.cats = cats;
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
  if (kind !== "y" && kind !== "parametric" && kind !== "polar" && kind !== "bar" && kind !== "scatter") {
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
  const markerSize = Number(series?.markerSize);
  const markerRaw = String(series?.marker || "").toLowerCase();
  /** @type {PlotSeries} */
  const out = {
    id: series?.id,
    label: series?.label || series?.id,
    kind,
    expression: String(series?.expression || "").trim(),
    xExpression: String(series?.xExpression || "").trim(),
    yExpression: String(series?.yExpression || series?.expression || "").trim(),
    rExpression: String(series?.rExpression || "").trim(),
    catsExpression: String(series?.catsExpression || "").trim(),
    tMin,
    tMax,
    stroke: series?.stroke || DEFAULT_STROKE,
    fill: series?.fill || DEFAULT_FILL,
    fillOpacity: Number.isFinite(fillOpacity) ? clamp(fillOpacity, 0, 1) : DEFAULT_FILL_OPACITY,
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_STROKE_WIDTH,
    axis: series?.axis === "y2" ? "y2" : "y",
    marker:
      markerRaw === "square" || markerRaw === "diamond" || markerRaw === "circle"
        ? markerRaw
        : kind === "scatter"
          ? "circle"
          : undefined,
    markerSize: Number.isFinite(markerSize) && markerSize > 0 ? markerSize : 5,
  };
  if ((kind === "parametric" || kind === "scatter" || kind === "bar") && !out.yExpression && out.expression) {
    out.yExpression = out.expression;
  }
  return out;
}

/** @param {PlotSeries} series */
function seriesIsDrawable(series) {
  if (series.kind === "polar") return Boolean(series.rExpression);
  if (series.kind === "parametric") return Boolean(series.xExpression && series.yExpression);
  if (series.kind === "bar") return Boolean(series.yExpression || series.expression);
  if (series.kind === "scatter") {
    return Boolean(series.expression || (series.xExpression && series.yExpression));
  }
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
  const exprOptions = options.exprOptions || {};
  const model = normalizePlot(plot);
  const W = model.width;
  const H = model.height;
  const m = { ...MARGIN };
  let plotW = Math.max(10, W - m.left - m.right);
  let plotH = Math.max(10, H - m.top - m.bottom);

  const xProj = makeProjector(model.x);
  const yProj = makeProjector(model.y);
  const y2Proj = model.y2 ? makeProjector(model.y2) : null;
  if (model.y2) {
    m.right = Math.max(m.right, 64);
    plotW = Math.max(10, W - m.left - m.right);
  }

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
  const y2ToPx = (y) => {
    if (!y2Proj || !model.y2) return yToPx(y);
    const u0 = y2Proj.forward(model.y2.min);
    const u1 = y2Proj.forward(model.y2.max);
    const u = y2Proj.forward(y);
    return m.top + plotH - ((u - u0) / (u1 - u0 || 1)) * plotH;
  };
  const axisYPx = (series, y) => (series.axis === "y2" ? y2ToPx(y) : yToPx(y));

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
  /** @type {{ label: string, stroke: string, kind?: string }[]} */
  const legendItems = [];
  for (const series of model.series) {
    const sampled = sampleSeries(series, model, env, errors, exprOptions);
    const points = sampled.points;
    const name = seriesLabel(series);
    if (name) {
      legendItems.push({
        label: name,
        stroke: series.stroke || DEFAULT_STROKE,
        kind: series.kind,
      });
    }
    const mapY = (y) => axisYPx(series, y);
    if (series.kind === "bar") {
      if (!points.length) {
        if (!sampled.hadError) errors.push(`@series ${name || "(unnamed)"}: no plottable bars`);
        continue;
      }
      const barW = Math.max(4, (plotW / Math.max(points.length, 1)) * 0.55);
      const base = series.axis === "y2" && model.y2 ? model.y2.min : model.y.min;
      const basePy = mapY(base);
      for (const p of points) {
        const cx = xToPx(p.x);
        const py = mapY(p.y);
        if (!Number.isFinite(cx) || !Number.isFinite(py)) continue;
        const top = Math.min(py, basePy);
        const h = Math.abs(py - basePy);
        parts.push(
          `    <rect x="${fmt(cx - barW / 2)}" y="${fmt(top)}" width="${fmt(barW)}" height="${fmt(Math.max(h, 0.5))}" fill="${escapeAttr(series.fill || series.stroke)}" fill-opacity="${fmt(series.fillOpacity > 0 ? series.fillOpacity : 0.85)}" stroke="${escapeAttr(series.stroke)}" stroke-width="1"/>`
        );
      }
      continue;
    }
    if (series.kind === "scatter") {
      if (!points.length) {
        if (!sampled.hadError) errors.push(`@series ${name || "(unnamed)"}: no plottable points`);
        continue;
      }
      for (const p of points) {
        const px = xToPx(p.x);
        const py = mapY(p.y);
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        parts.push(markerMarkup(series.marker || "circle", px, py, series.markerSize || 5, series.stroke, series.fill));
      }
      continue;
    }
    if (points.length < 2) {
      if (!sampled.hadError) {
        errors.push(`@series ${name || "(unnamed)"}: no plottable points`);
      }
      continue;
    }
    const lineD = pathFromPoints(points, xToPx, mapY);
    if (series.kind === "y" && series.fill && series.fillOpacity > 0) {
      const baseY = clamp(model.y.min, model.y.min, model.y.max);
      const first = points[0];
      const last = points[points.length - 1];
      const areaD =
        lineD +
        ` L ${fmt(xToPx(last.x))} ${fmt(mapY(baseY))}` +
        ` L ${fmt(xToPx(first.x))} ${fmt(mapY(baseY))} Z`;
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
    const tickLabel =
      model.x.scale === "categorical" && model.x.cats && Number.isInteger(tx) && model.x.cats[tx] != null
        ? model.x.cats[tx]
        : formatTick(tx, model.x);
    parts.push(
      `    <text x="${fmt(px)}" y="${fmt(axisY + 18)}" text-anchor="middle">${escapeText(tickLabel)}</text>`
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

  // Dual y2 axis
  if (model.y2 && y2Proj) {
    const xRight = m.left + plotW;
    parts.push(`  <g class="im-plot-axes-y2" stroke="${AXIS_COLOR}" stroke-width="1.25" fill="none" shape-rendering="crispEdges">`);
    parts.push(`    <line x1="${fmt(xRight)}" y1="${fmt(m.top)}" x2="${fmt(xRight)}" y2="${fmt(m.top + plotH)}"/>`);
    parts.push(`  </g>`);
    const y2Ticks = axisTicks(model.y2);
    parts.push(
      `  <g class="im-plot-ticks-y2" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11" fill="${TICK_COLOR}">`
    );
    for (const ty of y2Ticks) {
      const py = y2ToPx(ty);
      if (!Number.isFinite(py)) continue;
      parts.push(
        `    <line x1="${fmt(xRight)}" y1="${fmt(py)}" x2="${fmt(xRight + 5)}" y2="${fmt(py)}" stroke="${AXIS_COLOR}" stroke-width="1"/>`
      );
      parts.push(
        `    <text x="${fmt(xRight + 8)}" y="${fmt(py + 3.5)}" text-anchor="start">${escapeText(formatTick(ty, model.y2))}</text>`
      );
    }
    parts.push(`  </g>`);
  }

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
  if (model.y2) {
    const y2LabelX = W - 16;
    parts.push(
      `    <text x="${fmt(y2LabelX)}" y="${fmt(yLabelY)}" text-anchor="middle" transform="rotate(90 ${fmt(y2LabelX)} ${fmt(yLabelY)})">${escapeText(model.y2.label)}</text>`
    );
  }
  parts.push(`  </g>`);

  if (model.legend && legendItems.length) {
    parts.push(buildLegend(legendItems, m.left, m.top, plotW, plotH, model.legendPos || "top-right"));
  }

  if (model.annotations && model.annotations.length) {
    parts.push(
      `  <g class="im-plot-annotate" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="12" fill="${LABEL_COLOR}">`
    );
    for (const ann of model.annotations) {
      const py = ann.axis === "y2" ? y2ToPx(ann.y) : yToPx(ann.y);
      const px = xToPx(ann.x);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      const tx = px + (ann.dx ?? 8);
      const ty = py + (ann.dy ?? -10);
      parts.push(
        `    <line x1="${fmt(px)}" y1="${fmt(py)}" x2="${fmt(tx - 2)}" y2="${fmt(ty + 4)}" stroke="${escapeAttr(ann.stroke || AXIS_COLOR)}" stroke-width="1"/>`
      );
      parts.push(
        `    <circle cx="${fmt(px)}" cy="${fmt(py)}" r="3" fill="${escapeAttr(ann.stroke || DEFAULT_STROKE)}"/>`
      );
      parts.push(
        `    <text x="${fmt(tx)}" y="${fmt(ty)}" fill="${escapeAttr(ann.stroke || LABEL_COLOR)}">${escapeText(ann.text)}</text>`
      );
    }
    parts.push(`  </g>`);
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
 * @param {{ label: string, stroke: string, kind?: string }[]} items
 * @param {number} left
 * @param {number} top
 * @param {number} plotW
 * @param {number} plotH
 * @param {string} pos
 */
function buildLegend(items, left, top, plotW, plotH, pos = "top-right") {
  const pad = 8;
  const rowH = 16;
  const swatch = 14;
  const maxLabel = Math.max(...items.map((it) => it.label.length), 4);
  const boxW = Math.min(180, 28 + swatch + maxLabel * 7);
  const boxH = pad * 2 + items.length * rowH;
  let x = left + plotW - boxW - 8;
  let y = top + 8;
  if (pos === "top-left") {
    x = left + 8;
    y = top + 8;
  } else if (pos === "bottom-right") {
    x = left + plotW - boxW - 8;
    y = top + plotH - boxH - 8;
  } else if (pos === "bottom-left") {
    x = left + 8;
    y = top + plotH - boxH - 8;
  }
  const parts = [];
  parts.push(`  <g class="im-plot-legend" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11">`);
  parts.push(
    `    <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(boxW)}" height="${fmt(boxH)}" rx="4" fill="${LEGEND_BG}" stroke="${LEGEND_BORDER}" stroke-width="1"/>`
  );
  items.forEach((it, i) => {
    const cy = y + pad + i * rowH + rowH / 2;
    if (it.kind === "bar") {
      parts.push(
        `    <rect x="${fmt(x + pad)}" y="${fmt(cy - 5)}" width="${fmt(swatch)}" height="10" rx="2" fill="${escapeAttr(it.stroke)}" fill-opacity="0.85"/>`
      );
    } else if (it.kind === "scatter") {
      parts.push(
        `    <circle cx="${fmt(x + pad + swatch / 2)}" cy="${fmt(cy)}" r="3.5" fill="${escapeAttr(it.stroke)}"/>`
      );
    } else {
      parts.push(
        `    <line x1="${fmt(x + pad)}" y1="${fmt(cy)}" x2="${fmt(x + pad + swatch)}" y2="${fmt(cy)}" stroke="${escapeAttr(it.stroke)}" stroke-width="2.5" stroke-linecap="round"/>`
      );
    }
    parts.push(
      `    <text x="${fmt(x + pad + swatch + 6)}" y="${fmt(cy + 3.5)}" fill="${LABEL_COLOR}">${escapeText(it.label)}</text>`
    );
  });
  parts.push(`  </g>`);
  return parts.join("\n");
}

/**
 * @param {string} marker
 * @param {number} px
 * @param {number} py
 * @param {number} size
 * @param {string} stroke
 * @param {string} fill
 */
function markerMarkup(marker, px, py, size, stroke, fill) {
  const s = Math.max(2, size);
  const f = escapeAttr(fill || stroke);
  const st = escapeAttr(stroke);
  if (marker === "square") {
    return `    <rect x="${fmt(px - s)}" y="${fmt(py - s)}" width="${fmt(s * 2)}" height="${fmt(s * 2)}" fill="${f}" stroke="${st}" stroke-width="1"/>`;
  }
  if (marker === "diamond") {
    const d = `M ${fmt(px)} ${fmt(py - s)} L ${fmt(px + s)} ${fmt(py)} L ${fmt(px)} ${fmt(py + s)} L ${fmt(px - s)} ${fmt(py)} Z`;
    return `    <path d="${d}" fill="${f}" stroke="${st}" stroke-width="1"/>`;
  }
  return `    <circle cx="${fmt(px)}" cy="${fmt(py)}" r="${fmt(s)}" fill="${f}" stroke="${st}" stroke-width="1"/>`;
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
  if (scale === "categorical" && axis.cats && axis.cats.length) {
    return axis.cats.map((_, i) => i);
  }
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
function sampleSeries(series, model, env, errors, exprOptions = {}) {
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

  const evalAny = (expression, local) => {
    try {
      return evaluate(expression, local, exprOptions);
    } catch (err) {
      if (!firstError) firstError = /** @type {Error} */ (err).message || String(err);
      hadError = true;
      return null;
    }
  };

  const evalLocal = (expression, local) => {
    const v = evalAny(expression, local);
    return Number(v);
  };

  const evalArray = (expression, local) => {
    if (!expression) return null;
    // Bare identifier referring to an array in env
    const bare = expression.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
    if (bare && Array.isArray(local[bare[1]])) return local[bare[1]];
    const v = evalAny(expression, local);
    if (Array.isArray(v)) return v;
    return null;
  };

  const parseCatsList = (raw) => {
    const s = String(raw || "").trim();
    if (!s) return [];
    if (s.startsWith("[")) {
      const arr = evalArray(s, env);
      return Array.isArray(arr) ? arr.map((c) => String(c)) : [];
    }
    const bare = s.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
    if (bare && Array.isArray(env[bare[1]])) return env[bare[1]].map((c) => String(c));
    return s.split(/\s*,\s*/).map((c) => c.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
  };

  if (series.kind === "bar") {
    const cats = series.catsExpression
      ? parseCatsList(series.catsExpression)
      : model.x.cats
        ? [...model.x.cats]
        : [];
    const ys = evalArray(series.yExpression || series.expression || "", env);
    if (!Array.isArray(ys)) {
      if (!hadError) {
        firstError = "bar series y= must evaluate to an array";
        hadError = true;
      }
    } else {
      const nBars = Math.max(cats.length, ys.length);
      for (let i = 0; i < nBars; i++) {
        const y = Number(ys[i]);
        if (!Number.isFinite(y)) continue;
        pushPoint(i, y);
      }
      if (!cats.length && model.x.scale !== "categorical") {
        // still plot against indices
      }
    }
  } else if (series.kind === "scatter" && series.xExpression && (series.yExpression || series.expression)) {
    const xs = evalArray(series.xExpression, env);
    const ys = evalArray(series.yExpression || series.expression || "", env);
    if (Array.isArray(xs) && Array.isArray(ys)) {
      const nPts = Math.min(xs.length, ys.length);
      for (let i = 0; i < nPts; i++) pushPoint(Number(xs[i]), Number(ys[i]));
    } else {
      // parametric-style sample if not arrays
      const span = (series.tMax ?? Math.PI * 2) - (series.tMin ?? 0);
      const samples = Math.min(n, 64);
      for (let i = 0; i <= samples; i++) {
        const t = (series.tMin ?? 0) + (span * i) / samples;
        /** @type {Record<string, unknown>} */
        const local = Object.create(null);
        Object.assign(local, env);
        local.t = t;
        local.x = t;
        const x = evalLocal(series.xExpression || "t", local);
        const y = evalLocal(series.yExpression || series.expression || "", local);
        pushPoint(x, y);
      }
    }
  } else if (series.kind === "scatter") {
    // Sample y=f(x) as markers (fewer points)
    const span = model.x.max - model.x.min;
    const samples = Math.min(48, Math.max(8, Math.round(n / 8)));
    for (let i = 0; i <= samples; i++) {
      const x = model.x.min + (span * i) / samples;
      /** @type {Record<string, unknown>} */
      const local = Object.create(null);
      Object.assign(local, env);
      local.x = x;
      const y = evalLocal(series.expression || "", local);
      pushPoint(x, y);
    }
  } else if (series.kind === "polar") {
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

/**
 * Layout metrics used by the renderer for hover hit-testing.
 * @param {Partial<PlotModel>} plot
 * @returns {{ model: PlotModel, margin: { top: number, right: number, bottom: number, left: number }, plotW: number, plotH: number, xToPx: (x: number) => number, yToPx: (y: number) => number, pxToX: (px: number) => number, pxToY: (py: number) => number }}
 */
export function plotLayout(plot) {
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
  const pxToX = (px) => {
    const u0 = xProj.forward(model.x.min);
    const u1 = xProj.forward(model.x.max);
    const t = (px - m.left) / (plotW || 1);
    return inverseProject(model.x, u0 + t * (u1 - u0));
  };
  const pxToY = (py) => {
    const u0 = yProj.forward(model.y.min);
    const u1 = yProj.forward(model.y.max);
    const t = (m.top + plotH - py) / (plotH || 1);
    return inverseProject(model.y, u0 + t * (u1 - u0));
  };
  return { model, margin: m, plotW, plotH, xToPx, yToPx, pxToX, pxToY };
}

/**
 * Nearest sampled point under a pointer in SVG viewBox coordinates.
 * @param {Partial<PlotModel>} plot
 * @param {Record<string, unknown>} env
 * @param {number} svgX
 * @param {number} svgY
 * @param {{ maxDist?: number }} [options]
 * @returns {{ series: string, x: number, y: number, px: number, py: number, stroke: string } | null}
 */
export function hitTestPlot(plot, env, svgX, svgY, options = {}) {
  const layout = plotLayout(plot);
  const { model, margin: m, plotW, plotH, xToPx, yToPx } = layout;
  if (
    svgX < m.left - 4 ||
    svgX > m.left + plotW + 4 ||
    svgY < m.top - 4 ||
    svgY > m.top + plotH + 4
  ) {
    return null;
  }
  const maxDist = options.maxDist ?? 14;
  const exprOptions = options.exprOptions || {};
  /** @type {{ series: string, x: number, y: number, px: number, py: number, stroke: string, dist: number } | null} */
  let best = null;
  const errors = [];
  for (const series of model.series) {
    const sampled = sampleSeries(series, model, env, errors, exprOptions);
    const label = seriesLabel(series) || series.id || "series";
    for (const p of sampled.points) {
      const px = xToPx(p.x);
      const py = yToPx(p.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      const dist = Math.hypot(px - svgX, py - svgY);
      if (dist > maxDist) continue;
      if (!best || dist < best.dist) {
        best = {
          series: label,
          x: p.x,
          y: p.y,
          px,
          py,
          stroke: series.stroke || DEFAULT_STROKE,
          dist,
        };
      }
    }
  }
  if (!best) return null;
  return {
    series: best.series,
    x: best.x,
    y: best.y,
    px: best.px,
    py: best.py,
    stroke: best.stroke,
  };
}

export function serializePlotLines(plot) {

  const model = normalizePlot(plot);
  /** @type {string[]} */
  const lines = [];
  const size = plotSizeSuffix(model.width, model.height);
  const gridFlag = model.grid === false ? " nogrid" : "";
  let legendFlag = "";
  if (model.legend === false) legendFlag = " nolegend";
  else if (model.legendPos && model.legendPos !== "top-right") legendFlag = ` legend=${model.legendPos}`;
  const aspectFlag = model.lockAspect ? " lockAspect" : "";
  const zoomFlag = model.zoom === false ? " nozoom" : "";
  lines.push(`@plot${size}${gridFlag}${legendFlag}${aspectFlag}${zoomFlag}`);
  lines.push(serializeAxis("x", model.x));
  lines.push(serializeAxis("y", model.y));
  if (model.y2) lines.push(serializeAxis("y2", model.y2));
  for (const series of model.series) {
    let head = "@series";
    if (series.id) head += ` ${series.id}`;
    if (series.kind === "bar" || series.kind === "scatter") head += ` kind=${series.kind}`;
    if (series.axis === "y2") head += " axis=y2";
    if (series.kind === "scatter" && series.marker) head += ` marker=${series.marker}`;
    if (series.kind === "scatter" && series.markerSize && series.markerSize !== 5) {
      head += ` size=${fmt(series.markerSize)}`;
    }
    head += ` stroke=${series.stroke}`;
    if (series.fillOpacity > 0 && (series.kind === "y" || series.kind === "bar" || series.kind === "scatter")) {
      head += ` fill=${series.fill}`;
      head += ` fillOpacity=${fmt(series.fillOpacity)}`;
    }
    if (series.width !== DEFAULT_STROKE_WIDTH && series.kind !== "bar" && series.kind !== "scatter") {
      head += ` width=${fmt(series.width)}`;
    }
    if (series.label && series.label !== series.id) head += ` ${quoteLabel(series.label)}`;
    lines.push(head);
    if (series.kind === "polar") {
      lines.push(`  r = ${series.rExpression}`);
      lines.push(`  theta = ${fmt(series.tMin ?? 0)}..${fmt(series.tMax ?? Math.PI * 2)}`);
    } else if (series.kind === "parametric") {
      lines.push(`  x = ${series.xExpression}`);
      lines.push(`  y = ${series.yExpression}`);
      lines.push(`  t = ${fmt(series.tMin ?? 0)}..${fmt(series.tMax ?? Math.PI * 2)}`);
    } else if (series.kind === "bar") {
      if (series.catsExpression) lines.push(`  cats = ${series.catsExpression}`);
      lines.push(`  y = ${series.yExpression || series.expression}`);
    } else if (series.kind === "scatter") {
      if (series.xExpression) {
        lines.push(`  x = ${series.xExpression}`);
        lines.push(`  y = ${series.yExpression || series.expression}`);
      } else {
        lines.push(`  y = ${series.expression}`);
      }
    } else {
      lines.push(`  y = ${series.expression}`);
    }
  }
  for (const ann of model.annotations || []) {
    let line = `@annotate x=${fmt(ann.x)} y=${fmt(ann.y)} ${quoteLabel(ann.text)}`;
    if (ann.dx != null && ann.dx !== 8) line += ` dx=${fmt(ann.dx)}`;
    if (ann.dy != null && ann.dy !== -10) line += ` dy=${fmt(ann.dy)}`;
    if (ann.axis === "y2") line += " axis=y2";
    if (ann.stroke && ann.stroke !== LABEL_COLOR) line += ` stroke=${ann.stroke}`;
    lines.push(line);
  }
  return lines;
}

/**
 * @param {"x"|"y"} which
 * @param {PlotAxis} axis
 */
function serializeAxis(which, axis) {
  let line;
  if (axis.scale === "categorical" && axis.cats && axis.cats.length) {
    line = `@axis ${which}: cats=${axis.cats.join(",")}`;
  } else {
    line = `@axis ${which}: ${fmt(axis.min)}..${fmt(axis.max)}`;
    if (axis.step != null) line += ` step=${fmt(axis.step)}`;
  }
  if (axis.scale && axis.scale !== "linear" && axis.scale !== "categorical") line += ` scale=${axis.scale}`;
  if (axis.scale === "categorical") line += " scale=categorical";
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
