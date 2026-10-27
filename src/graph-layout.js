/**
 * Lightweight layered (Sugiyama-style) graph layout for IVM `@graph layout=dagre`.
 * No external dependency — enough for flows / agent loops so authors and LLMs
 * need not invent fragile x=/y= coordinates.
 *
 * Rules:
 * - Nodes missing BOTH x= and y= are auto-positioned (autoPos=true).
 * - Nodes with either x= or y= keep their explicit coordinates.
 * - Self-edges are ignored for ranking; cycles get a best-effort rank of 0+.
 * - Nodes with lane= pack vertically inside that lane's y/height band.
 */

export const LAYOUT_NODE_W = 168;
export const LAYOUT_NODE_H = 56;

const LAYOUT_ALIASES = Object.freeze({
  dagre: "dagre",
  flow: "dagre",
  layered: "dagre",
});

/**
 * @param {string | null | undefined} raw
 * @returns {"dagre" | null}
 */
export function normalizeLayoutName(raw) {
  if (raw == null || raw === "") return null;
  const key = String(raw).toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(LAYOUT_ALIASES, key)
    ? /** @type {"dagre"} */ (LAYOUT_ALIASES[key])
    : null;
}

/**
 * Assign x/y for nodes marked autoPos. Mutates graph.nodes in place.
 * @param {{
 *   nodes: { id: string, x: number, y: number, autoPos?: boolean, lane?: string }[],
 *   edges?: { from: string, to: string }[],
 *   lanes?: { id: string, y: number, height: number }[],
 *   layout?: string | null,
 * }} graph
 * @param {{ gapX?: number, gapY?: number, marginX?: number, marginY?: number }} [options]
 * @returns {typeof graph}
 */
export function applyGraphLayout(graph, options = {}) {
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) return graph;
  const auto = graph.nodes.filter((n) => n.autoPos);
  if (!auto.length) return graph;

  const gapX = options.gapX ?? 112;
  const gapY = options.gapY ?? 48;
  const marginX = options.marginX ?? 40;
  const marginY = options.marginY ?? 40;
  const nodeW = LAYOUT_NODE_W;
  const nodeH = LAYOUT_NODE_H;

  /** @type {Map<string, string[]>} */
  const outs = new Map();
  /** @type {Map<string, number>} */
  const indeg = new Map();
  for (const n of graph.nodes) {
    outs.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of graph.edges || []) {
    if (e.from === e.to) continue;
    if (!outs.has(e.from) || !outs.has(e.to)) continue;
    outs.get(e.from).push(e.to);
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  }

  /** @type {Map<string, number>} */
  const rank = new Map();
  /** @type {string[]} */
  const queue = [];
  for (const n of graph.nodes) {
    if ((indeg.get(n.id) || 0) === 0) {
      queue.push(n.id);
      rank.set(n.id, 0);
    }
  }
  // Working indegree copy for Kahn
  /** @type {Map<string, number>} */
  const remaining = new Map(indeg);
  let qi = 0;
  while (qi < queue.length) {
    const u = queue[qi++];
    const ru = rank.get(u) || 0;
    for (const v of outs.get(u) || []) {
      rank.set(v, Math.max(rank.get(v) || 0, ru + 1));
      const next = (remaining.get(v) || 0) - 1;
      remaining.set(v, next);
      if (next === 0) queue.push(v);
    }
  }
  // Cycles / leftovers: place after max known rank of predecessors, else 0
  let guard = graph.nodes.length + 2;
  while (guard-- > 0) {
    let progressed = false;
    for (const n of graph.nodes) {
      if (rank.has(n.id)) continue;
      let maxPred = -1;
      let ready = true;
      for (const e of graph.edges || []) {
        if (e.to !== n.id || e.from === e.to) continue;
        if (!rank.has(e.from)) {
          ready = false;
          break;
        }
        maxPred = Math.max(maxPred, rank.get(e.from) || 0);
      }
      if (ready) {
        rank.set(n.id, maxPred + 1);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  for (const n of graph.nodes) {
    if (!rank.has(n.id)) rank.set(n.id, 0);
  }

  /** @type {Map<number, typeof auto>} */
  const byRank = new Map();
  for (const n of auto) {
    const r = rank.get(n.id) || 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(n);
  }

  const lanes = Array.isArray(graph.lanes) ? graph.lanes : [];

  for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
    const list = byRank.get(r) || [];
    list.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    /** @type {Map<string, typeof auto>} */
    const byLane = new Map();
    /** @type {typeof auto} */
    const unlaned = [];
    for (const n of list) {
      if (n.lane && lanes.some((l) => l.id === n.lane)) {
        if (!byLane.has(n.lane)) byLane.set(n.lane, []);
        byLane.get(n.lane).push(n);
      } else {
        unlaned.push(n);
      }
    }

    unlaned.forEach((n, i) => {
      n.x = marginX + r * (nodeW + gapX);
      n.y = marginY + i * (nodeH + gapY);
    });

    for (const [laneId, members] of byLane) {
      const lane = lanes.find((l) => l.id === laneId);
      if (!lane) continue;
      const innerGap = Math.min(gapY, 24);
      const top = lane.y + 20;
      members.forEach((n, i) => {
        n.x = marginX + r * (nodeW + gapX);
        const y = top + i * (nodeH + innerGap);
        const maxY = lane.y + lane.height - nodeH - 8;
        n.y = Math.min(y, Math.max(lane.y + 8, maxY));
      });
    }
  }

  return graph;
}
