import { describe, expect, it } from 'vitest';
import { WaypointGraph } from './waypoints';
import { ManifestSchema, type WaypointGraph as WaypointGraphData } from '../manifest/schema';
import { DEPARTMENTS } from '../data/roster';
import manifestJson from '../../assets/manifest.json';

const synthetic: WaypointGraphData = {
  nodes: [
    { id: 'a', x: 0, y: 0, kind: 'room', department: 'engineering' },
    { id: 'b', x: 10, y: 0, kind: 'hall' },
    { id: 'c', x: 20, y: 0, kind: 'hall' },
    { id: 'd', x: 30, y: 0, kind: 'room', department: 'c-suite' },
    { id: 'e', x: 10, y: 10, kind: 'break' },
  ],
  edges: [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
    ['b', 'e'],
  ],
};

describe('WaypointGraph', () => {
  const g = new WaypointGraph(synthetic);

  it('indexes nodes, adjacency and department hubs', () => {
    expect(g.size).toBe(5);
    expect([...g.neighbors('b')].sort()).toEqual(['a', 'c', 'e']);
    expect(g.hubFor('engineering')).toBe('a');
    expect(g.hubFor('c-suite')).toBe('d');
    expect(g.hubFor('marketing-design')).toBeUndefined();
  });

  it('finds the shortest node path (Dijkstra by Euclidean weight)', () => {
    expect(g.shortestPath('a', 'd')).toEqual(['a', 'b', 'c', 'd']);
    expect(g.shortestPath('a', 'e')).toEqual(['a', 'b', 'e']);
    expect(g.shortestPath('a', 'a')).toEqual(['a']);
  });

  it('returns null for unknown or unreachable nodes', () => {
    const broken = new WaypointGraph({
      nodes: [
        { id: 'x', x: 0, y: 0, kind: 'hall' },
        { id: 'y', x: 5, y: 0, kind: 'hall' },
      ],
      edges: [],
    });
    expect(broken.shortestPath('x', 'y')).toBeNull();
    expect(g.shortestPath('a', 'zzz')).toBeNull();
  });

  it('picks the nearest node to a free point', () => {
    expect(g.nearestNode({ x: 9, y: 1 })).toBe('b');
    expect(g.nearestNode({ x: 31, y: 0 })).toBe('d');
  });

  it('plans a route as collapsed world points desk → graph → target', () => {
    const route = g.planRoute({ x: -2, y: 0 }, 'a', 'd', { x: 33, y: 0 });
    // start, a, b, c, d, target
    expect(route[0]).toEqual({ x: -2, y: 0 });
    expect(route[route.length - 1]).toEqual({ x: 33, y: 0 });
    expect(route.length).toBe(6);
  });

  it('reports connectivity problems (dangling edges + islands)', () => {
    expect(g.connectivity(synthetic.edges)).toEqual([]);
    const island = new WaypointGraph({
      nodes: [
        { id: 'a', x: 0, y: 0, kind: 'hall' },
        { id: 'b', x: 1, y: 0, kind: 'hall' },
        { id: 'c', x: 9, y: 9, kind: 'hall' },
      ],
      edges: [['a', 'b']],
    });
    const problems = island.connectivity([
      ['a', 'b'],
      ['a', 'ghost'],
    ]);
    expect(problems.some((p) => p.includes('ghost'))).toBe(true);
    expect(problems.some((p) => p.includes('not fully connected'))).toBe(true);
  });
});

describe('manifest waypoint graph (the real one)', () => {
  const manifest = ManifestSchema.parse(manifestJson);
  const graph = new WaypointGraph(manifest.waypoints);

  it('is present and non-trivial', () => {
    expect(graph.size).toBeGreaterThanOrEqual(10);
  });

  it('is a single fully-connected component with no dangling edges', () => {
    expect(graph.connectivity(manifest.waypoints.edges)).toEqual([]);
  });

  it('gives every department a room hub', () => {
    for (const dept of DEPARTMENTS) {
      expect(graph.hubFor(dept), `hub for ${dept}`).toBeDefined();
    }
  });

  it('provides the break rooms the behavior policy expects', () => {
    const breakIds = graph.nodesOfKind('break').map((n) => n.id);
    for (const area of ['kitchen', 'lounge', 'restroom']) {
      expect(breakIds).toContain(area);
    }
  });

  it('can route between any two department hubs', () => {
    const hubs = DEPARTMENTS.map((d) => graph.hubFor(d)).filter((x): x is string => Boolean(x));
    for (const from of hubs) {
      for (const to of hubs) {
        expect(graph.shortestPath(from, to), `${from}→${to}`).not.toBeNull();
      }
    }
  });
});
