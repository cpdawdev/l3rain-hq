import type { Department } from '../data/roster';
import type { WaypointGraph as WaypointGraphData, WaypointNode } from '../manifest/schema';

/**
 * Walkable waypoint graph over the painted backdrop (world pixel space).
 * Nodes are room hubs (one per department, where agents enter/leave), hallway
 * junctions along the painted corridors, and break rooms (kitchen / lounge /
 * restroom). Edges are undirected corridors. Ported from V1's rooms/doors/hall
 * lanes (app.js hallRoute/buildPath) but expressed as a plain graph so the
 * station-picker dev mode can place/edit nodes without touching code.
 */
export type { WaypointNode };

export interface Point {
  x: number;
  y: number;
}

/** Runtime graph with adjacency + fast node lookup, built from manifest data. */
export class WaypointGraph {
  readonly nodes: ReadonlyMap<string, WaypointNode>;
  private readonly adjacency: ReadonlyMap<string, string[]>;
  /** department → its room-hub node id */
  private readonly hubByDept: ReadonlyMap<Department, string>;

  constructor(data: WaypointGraphData) {
    const nodes = new Map<string, WaypointNode>();
    for (const n of data.nodes) nodes.set(n.id, n);
    this.nodes = nodes;

    const adjacency = new Map<string, string[]>();
    for (const n of data.nodes) adjacency.set(n.id, []);
    for (const [a, b] of data.edges) {
      // Skip dangling edges defensively; connectivity() reports them.
      if (!nodes.has(a) || !nodes.has(b)) continue;
      adjacency.get(a)?.push(b);
      adjacency.get(b)?.push(a);
    }
    this.adjacency = adjacency;

    const hubByDept = new Map<Department, string>();
    for (const n of data.nodes) {
      if (n.kind === 'room' && n.department && !hubByDept.has(n.department)) {
        hubByDept.set(n.department, n.id);
      }
    }
    this.hubByDept = hubByDept;
  }

  get size(): number {
    return this.nodes.size;
  }

  node(id: string): WaypointNode | undefined {
    return this.nodes.get(id);
  }

  neighbors(id: string): readonly string[] {
    return this.adjacency.get(id) ?? [];
  }

  hubFor(department: Department): string | undefined {
    return this.hubByDept.get(department);
  }

  nodesOfKind(kind: WaypointNode['kind']): WaypointNode[] {
    return [...this.nodes.values()].filter((n) => n.kind === kind);
  }

  /** Node id nearest (Euclidean) to a world point. */
  nearestNode(p: Point): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const n of this.nodes.values()) {
      const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    return best;
  }

  /**
   * Dijkstra shortest path between two node ids (edge weight = Euclidean
   * distance). Returns the node-id chain inclusive of both ends, or null if
   * unreachable. Same-node returns [id].
   */
  shortestPath(fromId: string, toId: string): string[] | null {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return null;
    if (fromId === toId) return [fromId];

    const dist = new Map<string, number>([[fromId, 0]]);
    const prev = new Map<string, string>();
    const visited = new Set<string>();
    // Small graph → a linear-scan frontier is plenty (no heap needed).
    const frontier = new Set<string>([fromId]);

    while (frontier.size > 0) {
      let current: string | null = null;
      let currentDist = Infinity;
      for (const id of frontier) {
        const d = dist.get(id) ?? Infinity;
        if (d < currentDist) {
          currentDist = d;
          current = id;
        }
      }
      if (current === null) break;
      frontier.delete(current);
      visited.add(current);
      if (current === toId) break;

      const cn = this.nodes.get(current);
      if (!cn) continue;
      for (const nb of this.neighbors(current)) {
        if (visited.has(nb)) continue;
        const nn = this.nodes.get(nb);
        if (!nn) continue;
        const w = Math.hypot(nn.x - cn.x, nn.y - cn.y);
        const nd = currentDist + w;
        if (nd < (dist.get(nb) ?? Infinity)) {
          dist.set(nb, nd);
          prev.set(nb, current);
          frontier.add(nb);
        }
      }
    }

    if (!prev.has(toId) && fromId !== toId) return null;
    const chain: string[] = [toId];
    let cur = toId;
    while (cur !== fromId) {
      const p = prev.get(cur);
      if (p === undefined) return null;
      chain.push(p);
      cur = p;
    }
    chain.reverse();
    return chain;
  }

  /**
   * Plan a walk as a list of world points: from a free-standing start point
   * (e.g. a desk) that is nearest to `fromNodeId`, through the graph to
   * `toNodeId`, ending at a free-standing `toPoint`. Consecutive duplicate
   * points are collapsed. Falls back to a straight line if unreachable.
   */
  planRoute(
    startPoint: Point,
    fromNodeId: string,
    toNodeId: string,
    toPoint: Point,
  ): Point[] {
    const chain = this.shortestPath(fromNodeId, toNodeId);
    const pts: Point[] = [startPoint];
    if (chain) {
      for (const id of chain) {
        const n = this.nodes.get(id);
        if (n) pts.push({ x: n.x, y: n.y });
      }
    }
    pts.push(toPoint);
    // collapse near-duplicates so movement doesn't stall on zero-length hops
    const out: Point[] = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.5) out.push(p);
    }
    return out;
  }

  /**
   * Graph health: every node reachable from an arbitrary root (single connected
   * component) + no dangling edge endpoints. Returns human-readable problems.
   */
  connectivity(edges: readonly (readonly [string, string])[]): string[] {
    const problems: string[] = [];
    for (const [a, b] of edges) {
      if (!this.nodes.has(a)) problems.push(`waypoint edge references missing node "${a}"`);
      if (!this.nodes.has(b)) problems.push(`waypoint edge references missing node "${b}"`);
    }
    if (this.nodes.size === 0) return problems;
    const root = this.nodes.keys().next().value as string;
    const seen = new Set<string>([root]);
    const stack = [root];
    while (stack.length) {
      const cur = stack.pop() as string;
      for (const nb of this.neighbors(cur)) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    if (seen.size !== this.nodes.size) {
      const unreached = [...this.nodes.keys()].filter((id) => !seen.has(id));
      problems.push(`waypoint graph is not fully connected: ${unreached.join(', ')} unreachable`);
    }
    return problems;
  }
}
