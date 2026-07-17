import { Container, Graphics, Text, type Ticker } from 'pixi.js';
import type { AgentVisual } from '../engine/agents';
import type { DepartmentRegion } from '../manifest/schema';
import type { Department } from '../data/roster';
import { DEPARTMENT_COLORS, hexToNumber, ROSTER } from '../data/roster';
import type { DepartmentStatus } from '../data/provider';
import type { Point, WaypointGraph } from './waypoints';
import { nextBehavior, statusBubble } from './behavior';
import { facingFromVelocity, walkPhase, type Facing } from './facing';

export type SimState = 'work' | 'walk' | 'wait' | 'break' | 'chat' | 'paused';

/** Public per-agent pose the renderer (chibi / token) reads each frame. */
export interface AgentPose {
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  /** continuous walk-cycle phase in radians */
  phase: number;
  state: SimState;
}

interface AgentSim {
  id: string;
  department: Department;
  isOrchestrator: boolean;
  home: Point;
  homeNodeId: string | null;
  pos: Point;
  facing: Facing;
  state: SimState;
  currentNodeId: string | null;
  path: Point[];
  after: { nodeId: string; state: SimState; dwell: number } | null;
  timer: number;
  seed: number;
  speed: number;
}

interface Slime {
  department: Department;
  pos: Point;
  target: Point;
  alpha: number;
  fading: boolean;
  wait: number;
  seed: number;
  g: Graphics;
}

export interface SimulationOptions {
  graph: WaypointGraph;
  visuals: ReadonlyMap<string, AgentVisual>;
  regions: readonly DepartmentRegion[];
  /** floor layer (delegation lines + slimes, depth-sorted with agents) */
  spritesLayer: Container;
  /** overlay layer above agents (speech bubbles) */
  fxLayer: Container;
}

/** deterministic LCG so the office is reproducible frame-to-frame */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const ARRIVE_EPS = 1.5;

/**
 * The living office. Ports V1 app.js (routines, hallRoute/moveAlong pathfinding,
 * status-driven breaks, orchestrator delegation, green slimes, speech bubbles,
 * honest all-paused) onto the V2 waypoint graph + Pixi. Behavior is driven by
 * the LiveStatusProvider department statuses; movement is depth-sorted by foot Y.
 * Reduced motion holds everyone at their station; pause freezes the whole sim;
 * a fleet cap pauses every agent honestly (no fake "working").
 */
export class Simulation {
  private readonly graph: WaypointGraph;
  private readonly visuals: ReadonlyMap<string, AgentVisual>;
  private readonly regions = new Map<Department, DepartmentRegion>();
  private readonly agents = new Map<string, AgentSim>();
  private readonly rng = lcg(0x51b3e7);

  private statuses: Partial<Record<Department, DepartmentStatus>> = {};
  private capActive = false;
  private reducedMotion = false;
  private paused = false;
  private elapsed = 0;

  private readonly delegation: Graphics;
  private readonly slimeLayer: Container;
  private slimes: Slime[] = [];
  private nextSlimeAt = 1.5;
  private readonly bubbleLayer: Container;
  private readonly bubbles = new Map<Department, { c: Container; agentId: string }>();

  private poseRenderer: ((id: string, pose: AgentPose) => void) | null = null;

  constructor(opts: SimulationOptions) {
    this.graph = opts.graph;
    this.visuals = opts.visuals;
    for (const r of opts.regions) this.regions.set(r.department, r);

    this.delegation = new Graphics();
    this.delegation.zIndex = -100000; // under every agent/occluder
    opts.spritesLayer.addChild(this.delegation);
    this.slimeLayer = new Container();
    this.slimeLayer.sortableChildren = true;
    opts.spritesLayer.addChild(this.slimeLayer);
    this.bubbleLayer = new Container();
    opts.fxLayer.addChild(this.bubbleLayer);

    const rosterById = new Map(ROSTER.map((a) => [a.id, a]));
    for (const [id, visual] of this.visuals) {
      const rosterAgent = rosterById.get(id);
      if (!rosterAgent) continue;
      const home = { x: visual.footX, y: visual.footY };
      const dept = rosterAgent.department;
      const isOrchestrator = dept === 'orchestrator';
      this.agents.set(id, {
        id,
        department: dept,
        isOrchestrator,
        home,
        homeNodeId: this.graph.hubFor(dept) ?? this.graph.nearestNode(home),
        pos: { ...home },
        facing: 'se',
        state: 'work',
        currentNodeId: this.graph.hubFor(dept) ?? this.graph.nearestNode(home),
        path: [],
        after: null,
        // stagger so the office is immediately alive without a stampede
        timer: 0.6 + this.rng() * 7,
        seed: this.rng() * Math.PI * 2,
        speed: isOrchestrator ? 60 : 70 + this.rng() * 34,
      });
    }
  }

  /** M3 hook: route poses to the chibi renderer. Absent → token just moves. */
  setPoseRenderer(fn: ((id: string, pose: AgentPose) => void) | null): void {
    this.poseRenderer = fn;
  }

  setStatuses(statuses: Partial<Record<Department, DepartmentStatus>>, capActive: boolean): void {
    this.statuses = statuses;
    if (capActive !== this.capActive) {
      this.capActive = capActive;
      if (capActive) this.enterCap();
      else this.releaseCap();
    }
    this.syncBubbles();
  }

  setReducedMotion(on: boolean): void {
    if (on === this.reducedMotion) return;
    this.reducedMotion = on;
    if (on) this.holdAtStations();
  }

  setPaused(on: boolean): void {
    this.paused = on;
  }

  get animating(): boolean {
    return !this.reducedMotion && !this.paused;
  }

  /** app.ticker callback */
  readonly update = (ticker: Ticker): void => {
    if (this.paused) return;
    if (this.reducedMotion) return; // held static; positions already at stations
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    this.elapsed += dt;

    if (!this.capActive) {
      for (const a of this.agents.values()) this.stepAgent(a, dt);
      this.stepSlimes(dt);
    }
    this.drawDelegation();
    this.positionBubbles();
    this.writeVisuals();
  };

  private stepAgent(a: AgentSim, dt: number): void {
    if (a.state === 'walk') {
      if (this.moveAlong(a, dt)) {
        const after = a.after;
        a.after = null;
        if (after) {
          a.currentNodeId = after.nodeId;
          a.state = after.state;
          a.timer = after.dwell;
        } else {
          a.state = 'work';
          a.timer = 4 + this.rng() * 6;
        }
      }
      return;
    }
    a.timer -= dt;
    if (a.timer <= 0) this.decide(a);
  }

  private decide(a: AgentSim): void {
    const status = this.statuses[a.department] ?? 'idle';
    const hasVisitTarget = [...this.regions.keys()].some(
      (d) => d !== a.department && d !== 'orchestrator' && this.statuses[d] === 'working',
    );
    const b = nextBehavior(
      { status, isOrchestrator: a.isOrchestrator, hasVisitTarget },
      this.rng,
    );

    switch (b.kind) {
      case 'work':
        this.sendHome(a, 'work', b.dwell);
        return;
      case 'wait':
        this.sendHome(a, 'wait', b.dwell);
        return;
      case 'break': {
        const node = this.graph.node(b.area);
        if (!node) {
          this.sendHome(a, 'work', b.dwell);
          return;
        }
        this.sendTo(a, b.area, this.jitter(node), 'break', b.dwell);
        return;
      }
      case 'visit': {
        const target = this.pickVisitDept(a);
        const hub = target ? this.graph.hubFor(target) : null;
        const node = hub ? this.graph.node(hub) : null;
        if (!node || !hub) {
          this.sendHome(a, 'work', b.dwell);
          return;
        }
        this.sendTo(a, hub, this.jitter(node), 'chat', b.dwell);
        return;
      }
    }
  }

  private pickVisitDept(a: AgentSim): Department | null {
    const options = [...this.regions.keys()].filter(
      (d) => d !== a.department && d !== 'orchestrator' && this.statuses[d] === 'working',
    );
    if (options.length === 0) return null;
    return options[Math.floor(this.rng() * options.length)] ?? null;
  }

  private sendHome(a: AgentSim, arriveState: SimState, dwell: number): void {
    if (a.homeNodeId === null) {
      a.state = arriveState;
      a.timer = dwell;
      return;
    }
    // already home → just settle, no walk
    if (a.currentNodeId === a.homeNodeId && dist(a.pos, a.home) < 4) {
      a.state = arriveState;
      a.timer = dwell;
      a.facing = 'se';
      return;
    }
    this.sendTo(a, a.homeNodeId, a.home, arriveState, dwell);
  }

  private sendTo(
    a: AgentSim,
    nodeId: string,
    target: Point,
    arriveState: SimState,
    dwell: number,
  ): void {
    const from = a.currentNodeId ?? this.graph.nearestNode(a.pos);
    a.path = from
      ? this.graph.planRoute(a.pos, from, nodeId, target)
      : [target];
    // drop the start point (that's where we already are)
    if (a.path.length > 1) a.path.shift();
    a.state = 'walk';
    a.after = { nodeId, state: arriveState, dwell };
  }

  private moveAlong(a: AgentSim, dt: number): boolean {
    let left = a.speed * dt;
    while (left > 0 && a.path.length > 0) {
      const p = a.path[0] as Point;
      const dx = p.x - a.pos.x;
      const dy = p.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      if (d < ARRIVE_EPS) {
        a.path.shift();
        continue;
      }
      const f = facingFromVelocity(dx, dy);
      if (f) a.facing = f;
      const step = Math.min(d, left);
      a.pos.x += (dx / d) * step;
      a.pos.y += (dy / d) * step;
      left -= step;
    }
    return a.path.length === 0;
  }

  private jitter(node: Point): Point {
    return { x: node.x + (this.rng() - 0.5) * 40, y: node.y + (this.rng() - 0.5) * 24 };
  }

  // ---- fleet cap: honest all-paused -------------------------------------

  private enterCap(): void {
    for (const a of this.agents.values()) {
      a.state = 'paused';
      a.path = [];
      a.after = null;
      a.timer = Infinity;
    }
    for (const s of this.slimes) s.g.destroy();
    this.slimes = [];
    this.delegation.clear();
  }

  private releaseCap(): void {
    for (const a of this.agents.values()) {
      a.state = 'work';
      a.timer = 1 + this.rng() * 6;
    }
  }

  private holdAtStations(): void {
    for (const a of this.agents.values()) {
      a.pos = { ...a.home };
      a.path = [];
      a.after = null;
      a.state = 'work';
      a.facing = 'se';
      a.currentNodeId = a.homeNodeId;
    }
    for (const s of this.slimes) s.g.destroy();
    this.slimes = [];
    this.delegation.clear();
    this.writeVisuals();
  }

  // ---- delegation beams from the orchestrator platform ------------------

  private drawDelegation(): void {
    this.delegation.clear();
    if (this.capActive) return;
    const orchHub = this.graph.hubFor('orchestrator');
    const origin = orchHub ? this.graph.node(orchHub) : null;
    if (!origin) return;

    for (const [dept] of this.regions) {
      if (dept === 'orchestrator') continue;
      if (this.statuses[dept] !== 'working') continue;
      const hub = this.graph.hubFor(dept);
      const target = hub ? this.graph.node(hub) : null;
      if (!target) continue;
      const color = hexToNumber(DEPARTMENT_COLORS[dept]);
      // bowed beam
      const midx = (origin.x + target.x) / 2;
      const midy = Math.min(origin.y, target.y) - 60;
      this.delegation
        .moveTo(origin.x, origin.y)
        .quadraticCurveTo(midx, midy, target.x, target.y)
        .stroke({ color, width: 2, alpha: 0.22 });
      // two dots flowing along the beam
      for (let k = 0; k < 2; k += 1) {
        const t = (this.elapsed * 0.55 + k * 0.5) % 1;
        const p = quadPoint(origin, { x: midx, y: midy }, target, t);
        this.delegation.circle(p.x, p.y, 3).fill({ color, alpha: 0.85 * (1 - Math.abs(0.5 - t)) });
      }
    }
  }

  // ---- green slime subagents -------------------------------------------

  private stepSlimes(dt: number): void {
    const working = [...this.regions.keys()].filter(
      (d) => d !== 'orchestrator' && this.statuses[d] === 'working',
    );
    this.nextSlimeAt -= dt;
    if (this.nextSlimeAt <= 0) {
      this.nextSlimeAt = 2 + this.rng() * 2.5;
      const live = this.slimes.filter((s) => !s.fading).length;
      if (working.length > 0 && live < working.length * 2) {
        const dept = working[Math.floor(this.rng() * working.length)] as Department;
        const region = this.regions.get(dept);
        if (region) {
          const spawn = randIn(region, this.rng);
          const g = new Graphics();
          this.slimeLayer.addChild(g);
          this.slimes.push({
            department: dept,
            pos: spawn,
            target: randIn(region, this.rng),
            alpha: 0,
            fading: false,
            wait: 0,
            seed: this.rng() * Math.PI * 2,
            g,
          });
        }
      }
    }

    for (const s of this.slimes) {
      const stillWorking = this.statuses[s.department] === 'working';
      if (!stillWorking) s.fading = true;
      if (s.fading) s.alpha -= dt * 1.5;
      else s.alpha = Math.min(1, s.alpha + dt * 2);
      if (!s.fading) {
        if (s.wait > 0) {
          s.wait -= dt;
        } else {
          const dx = s.target.x - s.pos.x;
          const dy = s.target.y - s.pos.y;
          const d = Math.hypot(dx, dy);
          if (d < 3) {
            s.wait = 0.6 + this.rng() * 2;
            const region = this.regions.get(s.department);
            if (region) s.target = randIn(region, this.rng);
          } else {
            const step = Math.min(d, 42 * dt);
            s.pos.x += (dx / d) * step;
            s.pos.y += (dy / d) * step;
          }
        }
      }
      this.drawSlime(s);
    }
    this.slimes = this.slimes.filter((s) => {
      if (s.alpha <= 0.02) {
        s.g.destroy();
        return false;
      }
      return true;
    });
  }

  private drawSlime(s: Slime): void {
    const hop = Math.abs(Math.sin(this.elapsed * 4 + s.seed));
    const lift = s.wait > 0 ? 0 : hop * 5;
    s.g.clear();
    s.g
      .ellipse(0, 2, 9, 3)
      .fill({ color: 0x000000, alpha: 0.22 })
      .moveTo(-9, -lift)
      .quadraticCurveTo(-9, -20 - lift, 0, -20 - lift)
      .quadraticCurveTo(9, -20 - lift, 9, -lift)
      .quadraticCurveTo(4, 1 - lift, 0, 1 - lift)
      .quadraticCurveTo(-4, 1 - lift, -9, -lift)
      .fill({ color: 0x46c46a })
      .ellipse(-3, -13 - lift, 2, 1.4)
      .fill({ color: 0xd8ffe0, alpha: 0.6 })
      .circle(-2.6, -10 - lift, 1.4)
      .circle(2.6, -10 - lift, 1.4)
      .fill(0x12321c);
    s.g.position.set(s.pos.x, s.pos.y);
    s.g.zIndex = s.pos.y - 1;
    s.g.alpha = Math.max(0, Math.min(1, s.alpha));
  }

  // ---- status speech bubbles -------------------------------------------

  private syncBubbles(): void {
    // remove bubbles whose department no longer needs one
    for (const [dept, bubble] of [...this.bubbles]) {
      const txt = this.capActive ? null : statusBubble(this.statuses[dept] ?? 'idle');
      if (!txt) {
        bubble.c.destroy({ children: true });
        this.bubbles.delete(dept);
      }
    }
    if (this.capActive) return;
    for (const [dept] of this.regions) {
      const txt = statusBubble(this.statuses[dept] ?? 'idle');
      if (!txt) continue;
      const existing = this.bubbles.get(dept);
      if (existing) {
        const label = existing.c.getChildAt(1) as Text;
        if (label.text !== txt) label.text = txt;
        continue;
      }
      const agentId = [...this.agents.values()].find((a) => a.department === dept)?.id;
      if (!agentId) continue;
      this.bubbles.set(dept, { c: makeBubble(txt), agentId });
      this.bubbleLayer.addChild(this.bubbles.get(dept)!.c);
    }
  }

  private positionBubbles(): void {
    for (const { c, agentId } of this.bubbles.values()) {
      const v = this.visuals.get(agentId);
      const a = this.agents.get(agentId);
      if (!v || !a) continue;
      const bob = Math.sin(this.elapsed * 2 + a.seed) * 2;
      c.position.set(a.pos.x + 18, a.pos.y - v.height - 14 + bob);
    }
  }

  // ---- write sim state to the display objects ---------------------------

  private writeVisuals(): void {
    for (const [id, a] of this.agents) {
      const v = this.visuals.get(id);
      if (!v) continue;
      v.footX = a.pos.x;
      v.footY = a.pos.y;
      v.container.position.set(a.pos.x, a.pos.y);
      v.container.zIndex = a.pos.y; // continuous depth-sort by foot Y
      if (this.poseRenderer) {
        this.poseRenderer(id, {
          x: a.pos.x,
          y: a.pos.y,
          facing: a.facing,
          moving: a.state === 'walk',
          phase: walkPhase(this.elapsed, a.seed, a.state === 'walk'),
          state: a.state,
        });
      }
    }
  }

  // ---- debug / test hooks ----------------------------------------------

  poseOf(id: string): AgentPose | null {
    const a = this.agents.get(id);
    if (!a) return null;
    return {
      x: a.pos.x,
      y: a.pos.y,
      facing: a.facing,
      moving: a.state === 'walk',
      phase: walkPhase(this.elapsed, a.seed, a.state === 'walk'),
      state: a.state,
    };
  }

  walkingCount(): number {
    let n = 0;
    for (const a of this.agents.values()) if (a.state === 'walk') n += 1;
    return n;
  }

  /** Force an agent to stroll to a break room (deterministic movement for e2e). */
  forceWander(id: string): boolean {
    const a = this.agents.get(id);
    if (!a || this.capActive) return false;
    const breaks = this.graph.nodesOfKind('break');
    const target = breaks[Math.floor(this.rng() * breaks.length)];
    if (!target) return false;
    this.sendTo(a, target.id, this.jitter(target), 'break', 6);
    return true;
  }

  destroy(): void {
    for (const s of this.slimes) s.g.destroy();
    this.slimes = [];
    for (const b of this.bubbles.values()) b.c.destroy({ children: true });
    this.bubbles.clear();
    this.delegation.destroy();
    this.slimeLayer.destroy({ children: true });
    this.bubbleLayer.destroy({ children: true });
  }
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function quadPoint(a: Point, c: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

function randIn(r: DepartmentRegion, rng: () => number): Point {
  return {
    x: r.x + 20 + rng() * Math.max(1, r.width - 40),
    y: r.y + 20 + rng() * Math.max(1, r.height - 40),
  };
}

function makeBubble(text: string): Container {
  const c = new Container();
  const label = new Text({
    text,
    style: {
      fill: 0x0b1226,
      fontSize: 13,
      fontWeight: '700',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    },
  });
  label.anchor.set(0.5);
  const w = label.width + 16;
  const bg = new Graphics()
    .roundRect(-w / 2, -12, w, 22, 7)
    .fill({ color: 0xf5fbff, alpha: 0.96 })
    .stroke({ color: 0x7896be, width: 1, alpha: 0.8 })
    .moveTo(-4, 9)
    .lineTo(3, 16)
    .lineTo(6, 9)
    .closePath()
    .fill({ color: 0xf5fbff, alpha: 0.96 });
  label.position.set(0, -1);
  // NOTE: child order matters — syncBubbles reads getChildAt(1) as the label.
  c.addChild(bg, label);
  return c;
}
