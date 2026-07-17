import { Graphics, Text, type Container } from 'pixi.js';
import type { AgentVisual } from './agents';

/**
 * Dev diagnostics overlay (spec M7): sprite bounds + depth values drawn in
 * screen space over each agent visual. Toggled from the diagnostics panel.
 */
export class DiagnosticsLayer {
  private readonly g: Graphics;
  private readonly texts = new Map<string, Text>();
  private enabled = false;

  constructor(
    private readonly overlay: Container,
    private readonly agents: ReadonlyMap<string, AgentVisual>,
  ) {
    this.g = new Graphics();
    this.g.visible = false;
    overlay.addChild(this.g);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.g.visible = on;
    if (!on) {
      for (const t of this.texts.values()) t.visible = false;
    }
    this.sync();
  }

  /** Redraw bounds rects + depth labels (called on camera change). */
  sync(): void {
    if (!this.enabled) return;
    this.g.clear();
    for (const [id, visual] of this.agents) {
      const b = visual.container.getBounds();
      this.g.rect(b.x, b.y, b.width, b.height).stroke({ color: 0xf472b6, width: 1, alpha: 0.8 });
      let t = this.texts.get(id);
      if (!t) {
        t = new Text({
          text: '',
          style: { fill: 0xf472b6, fontSize: 9, fontFamily: 'ui-monospace, monospace' },
        });
        this.texts.set(id, t);
        this.overlay.addChild(t);
      }
      t.visible = true;
      t.text = `y=${String(Math.round(visual.footY))}`;
      t.position.set(b.x, b.y + b.height + 2);
    }
  }
}
