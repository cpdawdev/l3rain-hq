import { Graphics, type Container, type Ticker } from 'pixi.js';
import type { DepartmentRegion } from '../manifest/schema';
import type { AgentVisual } from './agents';
import type { AgentStatus, DepartmentStatus } from '../data/provider';
import type { Department } from '../data/roster';

export interface EffectsOptions {
  worldWidth: number;
  worldHeight: number;
  regions: readonly DepartmentRegion[];
  agents: ReadonlyMap<string, AgentVisual>;
  orchestratorStation: { x: number; y: number } | null;
  getDepartmentStatus: (d: Department) => DepartmentStatus | undefined;
  getAgentActivity: (id: string) => AgentStatus | undefined;
}

/** deterministic LCG so effects are stable frame-to-frame and testable */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * Code-driven ambient LIGHTING on top of static paint (spec M6) — restrained,
 * no frame art, no bloom storms. Delegation beams, status speech bubbles and
 * slimes moved to the living Simulation (M2.1); this layer keeps the calm
 * ambience:
 * - hologram glow pulse + rising aura particles at the orchestrator platform
 * - screen flicker in working rooms
 * - neon edge breathing on the world border
 * Reduced motion renders one static, calm frame; pause freezes time.
 */
export class EffectsLayer {
  private elapsed = 0;
  private reducedMotion = false;
  private paused = false;

  private readonly edge: Graphics;
  private readonly holo: Graphics;
  private readonly flicker: Graphics;
  private readonly auraDots: { g: Graphics; phase: number; radius: number }[] = [];

  constructor(
    layer: Container,
    private readonly opts: EffectsOptions,
  ) {
    this.edge = new Graphics();
    this.holo = new Graphics();
    this.flicker = new Graphics();
    layer.addChild(this.edge, this.holo, this.flicker);

    if (opts.orchestratorStation) {
      for (let i = 0; i < 9; i += 1) {
        const g = new Graphics().circle(0, 0, 1.6).fill({ color: 0x67e8f9, alpha: 0.8 });
        this.auraDots.push({ g, phase: i / 9, radius: 26 + (i % 3) * 9 });
        layer.addChild(g);
      }
    }
    this.renderStatic();
  }

  /** true when animations are advancing (Playwright asserts on this) */
  get animating(): boolean {
    return !this.reducedMotion && !this.paused;
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    if (on) this.renderStatic();
  }

  setPaused(on: boolean): void {
    this.paused = on;
  }

  /** app.ticker callback */
  readonly update = (ticker: Ticker): void => {
    if (!this.animating) return;
    const dt = ticker.deltaMS / 1000;
    this.elapsed += dt;
    const t = this.elapsed;

    // neon edge breathing
    this.drawEdge(0.1 + 0.06 * (0.5 + 0.5 * Math.sin(t * 1.1)));

    // hologram glow pulse
    this.drawHolo(0.5 + 0.5 * Math.sin(t * 1.7));

    // aura particles rising around the platform
    const station = this.opts.orchestratorStation;
    if (station) {
      for (const dot of this.auraDots) {
        const p = (t * 0.22 + dot.phase) % 1;
        const angle = dot.phase * Math.PI * 2 + t * 0.35;
        dot.g.position.set(station.x + Math.cos(angle) * dot.radius, station.y - 6 - p * 64);
        dot.g.alpha = 0.5 * (1 - p);
      }
    }

    // screen flicker in working rooms (sparse, dim)
    if (Math.floor(t * 6) % 3 === 0) this.drawFlicker(t);
  };

  destroy(): void {
    // nothing dynamic to tear down (layers destroyed with the stage)
  }

  /** one calm static frame for reduced motion */
  private renderStatic(): void {
    this.drawEdge(0.12);
    this.drawHolo(0.4);
    this.flicker.clear();
    for (const dot of this.auraDots) dot.g.alpha = 0;
  }

  private drawEdge(alpha: number): void {
    this.edge
      .clear()
      .roundRect(6, 6, this.opts.worldWidth - 12, this.opts.worldHeight - 12, 18)
      .stroke({ color: 0x22d3ee, width: 3, alpha });
  }

  private drawHolo(pulse01: number): void {
    const station = this.opts.orchestratorStation;
    this.holo.clear();
    if (!station) return;
    const cx = station.x;
    const cy = station.y - 34;
    const a = 0.045 + 0.05 * pulse01;
    this.holo
      .ellipse(cx, cy, 78, 40)
      .fill({ color: 0x22d3ee, alpha: a })
      .ellipse(cx, cy, 52, 26)
      .fill({ color: 0x67e8f9, alpha: a * 1.4 })
      .ellipse(cx, station.y + 2, 60, 16)
      .fill({ color: 0x22d3ee, alpha: a });
  }

  private drawFlicker(t: number): void {
    this.flicker.clear();
    const r = lcg(Math.floor(t * 2) * 7919);
    for (const region of this.opts.regions) {
      const status = this.opts.getDepartmentStatus(region.department);
      if (status !== 'working') continue;
      for (let i = 0; i < 2; i += 1) {
        if (r() < 0.4) continue;
        const x = region.x + r() * region.width * 0.8;
        const y = region.y + r() * region.height * 0.35;
        this.flicker
          .roundRect(x, y, 14 + r() * 10, 9 + r() * 6, 2)
          .fill({ color: 0x9ee8ff, alpha: 0.05 + r() * 0.05 });
      }
    }
  }
}
