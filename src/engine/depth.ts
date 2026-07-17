/**
 * Depth model (spec): agents and occluders sort by foot/base Y.
 * An agent whose foot Y is less than an occluder's depthY renders BEHIND it.
 * Implemented as zIndex = footY on a sortableChildren container; these pure
 * helpers exist so the ordering rule is unit-tested.
 */

export interface DepthItem {
  id: string;
  /** foot contact Y for agents, base Y (depthY) for occluders */
  footY: number;
}

/** Stable ascending sort — lower footY paints first (further back). */
export function sortByDepth<T extends DepthItem>(items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.footY - b.item.footY || a.i - b.i)
    .map(({ item }) => item);
}

/** true when the agent must render behind the occluder */
export function rendersBehind(agentFootY: number, occluderDepthY: number): boolean {
  return agentFootY < occluderDepthY;
}
