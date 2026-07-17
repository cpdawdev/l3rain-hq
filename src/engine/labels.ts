import { Container, Graphics, Text } from 'pixi.js';
import type { AgentVisual } from './agents';
import type { CameraView } from './cameraMath';
import { agentById, DEPARTMENT_COLORS, hexToNumber } from '../data/roster';
import type { LabelMode } from '../state/store';

interface LabelEntry {
  id: string;
  container: Container;
  width: number;
  height: number;
}

export interface LabelHost {
  worldToScreen(wx: number, wy: number): { x: number; y: number };
  fitScale(): number;
}

const PANEL_BG = 0x0b1226;
const PANEL_BORDER = 0x2dd4bf;

/**
 * Screen-space label layer: name + role panels attached above each agent
 * visual, crisp at every zoom (labels never scale with the world), fading at
 * low zoom, collision-aware (stacked upward), toggleable all/names/selected.
 * Labels sit above the sprite so they never cover faces.
 */
export class LabelLayer {
  private entries: LabelEntry[] = [];
  private mode: LabelMode = 'all';
  private sizeFactor = 1;
  private selectedId: string | null = null;
  private lastView: CameraView = { scale: 1, x: 0, y: 0 };

  constructor(
    private readonly overlay: Container,
    private readonly agents: ReadonlyMap<string, AgentVisual>,
    private readonly host: LabelHost,
  ) {
    this.rebuild();
  }

  get count(): number {
    return this.entries.length;
  }

  setMode(mode: LabelMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.rebuild();
  }

  setSizeFactor(factor: number): void {
    if (factor === this.sizeFactor) return;
    this.sizeFactor = factor;
    this.rebuild();
  }

  setSelected(id: string | null): void {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.rebuild();
  }

  /** Re-project all labels for the given camera view. */
  sync(view: CameraView): void {
    this.lastView = view;
    const fit = this.host.fitScale();
    // Fade labels away when zooming OUT below the fitted framing.
    const alpha =
      view.scale >= fit * 0.85 ? 1 : Math.max(0, (view.scale - fit * 0.5) / (fit * 0.35));

    const placed: { x: number; y: number; w: number; h: number }[] = [];
    // Stable order: back-to-front (live foot Y) so stacking reads naturally as
    // agents walk around.
    const ordered = [...this.entries].sort((a, b) => {
      const va = this.agents.get(a.id);
      const vb = this.agents.get(b.id);
      return (va?.footY ?? 0) - (vb?.footY ?? 0);
    });

    for (const entry of ordered) {
      const visual = this.agents.get(entry.id);
      if (!visual) continue;
      const isSelected = entry.id === this.selectedId;
      entry.container.alpha = isSelected ? 1 : alpha;
      entry.container.visible = entry.container.alpha > 0.02;
      if (!entry.container.visible) continue;

      // Anchor to the LIVE foot point so labels ride along with moving agents.
      const anchor = this.host.worldToScreen(visual.footX, visual.footY - visual.height);
      const x = anchor.x - entry.width / 2;
      let y = anchor.y - entry.height - 8;

      // Collision-aware: push up until free of already-placed labels.
      let guard = 0;
      while (guard < 40) {
        const hit = placed.find(
          (r) => x < r.x + r.w && x + entry.width > r.x && y < r.y + r.h && y + entry.height > r.y,
        );
        if (!hit) break;
        y = hit.y - entry.height - 2;
        guard += 1;
      }
      placed.push({ x, y, w: entry.width, h: entry.height });
      entry.container.position.set(Math.round(x), Math.round(y));
    }
  }

  destroy(): void {
    for (const e of this.entries) e.container.destroy({ children: true });
    this.entries = [];
  }

  private rebuild(): void {
    this.destroy();
    for (const [id] of this.agents) {
      if (this.mode === 'selected' && id !== this.selectedId) continue;
      const entry = this.buildLabel(id);
      if (entry) this.entries.push(entry);
    }
    this.sync(this.lastView);
  }

  private buildLabel(id: string): LabelEntry | null {
    const rosterAgent = agentById(id);
    if (!rosterAgent) return null;
    const isSelected = id === this.selectedId;
    const accent = hexToNumber(DEPARTMENT_COLORS[rosterAgent.department]);
    const f = this.sizeFactor;

    const container = new Container();
    const name = new Text({
      text: rosterAgent.name,
      style: {
        fill: 0xe2e8f0,
        fontSize: 11 * f,
        fontWeight: '600',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      },
    });
    const showRole = this.mode === 'all' || (this.mode === 'selected' && isSelected);
    const role = showRole
      ? new Text({
          text: rosterAgent.role,
          style: {
            fill: 0x7dd3fc,
            fontSize: 9 * f,
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          },
        })
      : null;

    const padX = 7 * f;
    const padY = 4 * f;
    const w = Math.max(name.width, role?.width ?? 0) + padX * 2;
    const h = name.height + (role ? role.height + 1 : 0) + padY * 2;

    const bg = new Graphics()
      .roundRect(0, 0, w, h, 5 * f)
      .fill({ color: PANEL_BG, alpha: 0.88 })
      .stroke({
        color: isSelected ? 0x67e8f9 : PANEL_BORDER,
        width: isSelected ? 1.5 : 1,
        alpha: 0.75,
      });
    // department accent tick on the left edge
    const tick = new Graphics()
      .roundRect(0, h * 0.25, 2.5, h * 0.5, 1)
      .fill({ color: accent, alpha: 0.95 });

    name.position.set(padX, padY);
    role?.position.set(padX, padY + name.height + 1);
    container.addChild(bg, tick, name);
    if (role) container.addChild(role);

    this.overlay.addChild(container);
    return { id, container, width: w, height: h };
  }
}
