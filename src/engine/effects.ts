import { Container, Graphics, Text, type Ticker } from 'pixi.js';
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

interface Packet {
  g: Graphics;
  from: { x: number; y: number };
  to: { x: number; y: number };
  t: number;
}

interface Bubble {
  c: Container;
  t: number;
}

/**
 * Code-driven ambient life (spec M6). All tween/shader-style effects on top of
 * static paint — no frame art, restrained alphas, no bloom storms.
 * - hologram glow pulse + rising aura particles at the orchestrator platform
 * - screen flicker in working rooms
 * - neon edge breathing on the world border
 * - floor-path shimmer: data packets traveling platform → working rooms
 * - occasional ?, !, coffee speech bubbles above random working agents
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
  private packets: Packet[] = [];
  private bubbles: Bubble[] = [];
  private nextPacketAt = 1.2;
  private nextBubbleAt = 2.5;
  private readonly rand = lcg(0x13b7a1);

  constructor(
    private readonly layer: Container,
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

    // floor-path shimmer packets
    this.nextPacketAt -= dt;
    if (this.nextPacketAt <= 0) {
      this.spawnPacket();
      this.nextPacketAt = 2.2 + this.rand() * 1.6;
    }
    this.packets = this.packets.filter((p) => {
      p.t += dt / 1.3;
      if (p.t >= 1) {
        p.g.destroy();
        return false;
      }
      const ease = p.t * p.t * (3 - 2 * p.t);
      p.g.position.set(
        p.from.x + (p.to.x - p.from.x) * ease,
        p.from.y + (p.to.y - p.from.y) * ease,
      );
      p.g.alpha = 0.55 * Math.sin(Math.PI * p.t);
      return true;
    });

    // speech bubbles above random working agents
    this.nextBubbleAt -= dt;
    if (this.nextBubbleAt <= 0) {
      this.spawnBubble();
      this.nextBubbleAt = 3.5 + this.rand() * 3.5;
    }
    this.bubbles = this.bubbles.filter((b) => {
      b.t += dt / 2.2;
      if (b.t >= 1) {
        b.c.destroy({ children: true });
        return false;
      }
      const pop = Math.min(1, b.t * 6);
      b.c.scale.set(0.7 + 0.3 * pop);
      b.c.alpha = b.t < 0.85 ? pop : 1 - (b.t - 0.85) / 0.15;
      return true;
    });
  };

  destroy(): void {
    for (const p of this.packets) p.g.destroy();
    for (const b of this.bubbles) b.c.destroy({ children: true });
    this.packets = [];
    this.bubbles = [];
  }

  /** one calm static frame for reduced motion */
  private renderStatic(): void {
    this.drawEdge(0.12);
    this.drawHolo(0.4);
    this.flicker.clear();
    for (const dot of this.auraDots) dot.g.alpha = 0;
    for (const p of this.packets) p.g.destroy();
    this.packets = [];
    for (const b of this.bubbles) b.c.destroy({ children: true });
    this.bubbles = [];
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

  private spawnPacket(): void {
    const station = this.opts.orchestratorStation;
    if (!station) return;
    const working = this.opts.regions.filter(
      (reg) => this.opts.getDepartmentStatus(reg.department) === 'working',
    );
    if (working.length === 0) return;
    const target = working[Math.floor(this.rand() * working.length)];
    if (!target) return;
    const g = new Graphics().circle(0, 0, 2.4).fill({ color: 0x9ee8ff, alpha: 0.9 });
    g.position.set(station.x, station.y);
    this.layer.addChild(g);
    this.packets.push({
      g,
      from: { x: station.x, y: station.y },
      to: { x: target.x + target.width / 2, y: target.y + target.height * 0.7 },
      t: 0,
    });
  }

  private spawnBubble(): void {
    const working: AgentVisual[] = [];
    for (const [id, visual] of this.opts.agents) {
      if (this.opts.getAgentActivity(id) === 'working') working.push(visual);
    }
    if (working.length === 0) return;
    const visual = working[Math.floor(this.rand() * working.length)];
    if (!visual) return;
    const icons = ['?', '!', '☕'] as const;
    const icon = icons[Math.floor(this.rand() * icons.length)] ?? '?';

    const c = new Container();
    const text = new Text({
      text: icon,
      style: {
        fill: 0x0b1226,
        fontSize: 13,
        fontWeight: '700',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      },
    });
    text.anchor.set(0.5);
    const rx = Math.max(11, text.width * 0.75);
    const bg = new Graphics()
      .ellipse(0, 0, rx, 10)
      .fill({ color: 0xe2f4ff, alpha: 0.95 })
      .moveTo(-3, 8)
      .lineTo(2, 15)
      .lineTo(5, 8)
      .closePath()
      .fill({ color: 0xe2f4ff, alpha: 0.95 });
    c.addChild(bg, text);
    c.position.set(visual.entry.station.x + 16, visual.entry.station.y - visual.height - 12);
    this.layer.addChild(c);
    this.bubbles.push({ c, t: 0 });
  }
}
