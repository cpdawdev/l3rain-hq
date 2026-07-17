import { Application, Container } from 'pixi.js';
import type { Manifest } from '../manifest/schema';
import { Camera } from './camera';
import { createBackdrop } from './backdrop';
import { buildAgentLayer, type AgentVisual } from './agents';
import { LabelLayer } from './labels';
import { Graphics } from 'pixi.js';

export interface EngineLayers {
  /** painted backdrop (or checker placeholder) */
  backdrop: Container;
  /** department status tint overlays (M5) */
  tint: Container;
  /** depth-sorted agents + occluders (M3) */
  sprites: Container;
  /** code-driven ambient effects (M6) */
  fx: Container;
}

/**
 * Owns the Pixi Application, the camera-transformed world container and its
 * layer stack, plus a screen-space overlay container (labels, diagnostics).
 * React never renders world objects; Pixi never renders UI panels.
 */
export class HqEngine {
  readonly app: Application;
  readonly world: Container;
  readonly overlay: Container;
  readonly layers: EngineLayers;
  readonly camera: Camera;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly backdropPlaceholder: boolean;
  readonly backdropInterim: boolean;
  /** non-fatal problems for the diagnostics panel */
  readonly errors: string[];

  /** all 30 agent visuals by id */
  readonly agents = new Map<string, AgentVisual>();
  /** screen-space label layer (created in create()) */
  labels!: LabelLayer;

  private selectionMarker: Graphics | null = null;

  private readonly resizeObserver: ResizeObserver;
  private readonly worldClickListeners = new Set<(x: number, y: number) => void>();
  private readonly agentTapListeners = new Set<(id: string) => void>();
  private destroyed = false;

  private constructor(
    private readonly host: HTMLElement,
    app: Application,
    args: {
      worldWidth: number;
      worldHeight: number;
      backdrop: Container;
      backdropPlaceholder: boolean;
      backdropInterim: boolean;
      errors: string[];
    },
  ) {
    this.app = app;
    this.worldWidth = args.worldWidth;
    this.worldHeight = args.worldHeight;
    this.backdropPlaceholder = args.backdropPlaceholder;
    this.backdropInterim = args.backdropInterim;
    this.errors = args.errors;

    this.world = new Container();
    this.layers = {
      backdrop: args.backdrop,
      tint: new Container(),
      sprites: new Container(),
      fx: new Container(),
    };
    this.world.addChild(
      this.layers.backdrop,
      this.layers.tint,
      this.layers.sprites,
      this.layers.fx,
    );
    this.overlay = new Container();
    app.stage.addChild(this.world, this.overlay);

    this.camera = new Camera(host, this.world, this.worldWidth, this.worldHeight);
    host.style.cursor = 'grab';
    host.style.touchAction = 'none';

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.destroyed) this.camera.onResize();
    });
    this.resizeObserver.observe(host);

    // world-coordinate clicks (selection M4, station picker M3)
    host.addEventListener('pointerdown', this.onHostPointerDown);
    host.addEventListener('click', this.onHostClick);
  }

  static async create(host: HTMLElement, manifest: Manifest): Promise<HqEngine> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: 0x060b1a,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    host.appendChild(app.canvas);

    const backdrop = await createBackdrop(manifest);
    const engine = new HqEngine(host, app, {
      worldWidth: backdrop.width,
      worldHeight: backdrop.height,
      backdrop: backdrop.container,
      backdropPlaceholder: backdrop.placeholder,
      backdropInterim: backdrop.interim,
      errors: backdrop.errors,
    });

    const agentLayer = await buildAgentLayer(
      manifest,
      engine.layers.sprites,
      backdrop.height,
      (id) => {
        for (const l of engine.agentTapListeners) l(id);
      },
    );
    for (const [id, visual] of agentLayer.visuals) engine.agents.set(id, visual);
    engine.errors.push(...agentLayer.errors);

    engine.labels = new LabelLayer(engine.overlay, engine.agents, {
      worldToScreen: (wx, wy) => engine.worldToScreen(wx, wy),
      fitScale: () => engine.camera.fitScale(),
    });
    engine.camera.onChange((view) => {
      engine.labels.sync(view);
    });
    engine.labels.sync(engine.camera.getView());

    window.__l3rainDebug = {
      agentCount: engine.agents.size,
      labelCount: () => engine.labels.count,
      errors: engine.errors,
    };
    return engine;
  }

  /** Highlight the selected agent with a restrained cyan foot ring. */
  setSelected(id: string | null): void {
    if (this.selectionMarker) {
      this.selectionMarker.destroy();
      this.selectionMarker = null;
    }
    this.labels.setSelected(id);
    if (id === null) return;
    const visual = this.agents.get(id);
    if (!visual) return;
    const r = Math.max(14, visual.height * 0.35);
    const marker = new Graphics()
      .ellipse(0, 0, r, r * 0.36)
      .stroke({ color: 0x67e8f9, width: 2, alpha: 0.9 })
      .ellipse(0, 0, r * 1.25, r * 0.45)
      .stroke({ color: 0x67e8f9, width: 1, alpha: 0.35 });
    visual.container.addChildAt(marker, 0);
    this.selectionMarker = marker;
  }

  onAgentTap(listener: (id: string) => void): () => void {
    this.agentTapListeners.add(listener);
    return () => this.agentTapListeners.delete(listener);
  }

  /** Station-picker support: move an agent's station live (world px). */
  moveAgent(id: string, x: number, y: number): void {
    const visual = this.agents.get(id);
    if (!visual) return;
    visual.container.position.set(x, y);
    visual.container.zIndex = y;
    visual.footY = y;
    visual.entry.station.x = x;
    visual.entry.station.y = y;
  }

  /** screen (host-local) → world/backdrop pixel coordinates */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const v = this.camera.getView();
    return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
  }

  /** world/backdrop pixel → screen (host-local) coordinates */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const v = this.camera.getView();
    return { x: wx * v.scale + v.x, y: wy * v.scale + v.y };
  }

  onWorldClick(listener: (x: number, y: number) => void): () => void {
    this.worldClickListeners.add(listener);
    return () => this.worldClickListeners.delete(listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.host.removeEventListener('pointerdown', this.onHostPointerDown);
    this.host.removeEventListener('click', this.onHostClick);
    this.resizeObserver.disconnect();
    this.camera.destroy();
    this.app.destroy(true, { children: true, texture: false });
  }

  private pointerDownAt: { x: number; y: number } | null = null;

  private readonly onHostPointerDown = (e: PointerEvent): void => {
    this.pointerDownAt = { x: e.clientX, y: e.clientY };
  };

  private readonly onHostClick = (e: MouseEvent): void => {
    if (e.detail > 1) return; // double-click is camera reset, not a selection
    // Suppress clicks that were really drags (camera pan).
    if (this.pointerDownAt !== null) {
      const moved = Math.hypot(e.clientX - this.pointerDownAt.x, e.clientY - this.pointerDownAt.y);
      if (moved > 5) return;
    }
    const rect = this.host.getBoundingClientRect();
    const p = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (p.x < 0 || p.y < 0 || p.x > this.worldWidth || p.y > this.worldHeight) return;
    for (const l of this.worldClickListeners) l(p.x, p.y);
  };
}
