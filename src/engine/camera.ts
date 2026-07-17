import type { Container } from 'pixi.js';
import {
  constrainPan,
  fitView,
  panBy,
  zoomAt,
  zoomBounds,
  type CameraView,
  type ZoomBounds,
} from './cameraMath';

/**
 * Camera: scroll-zoom (cursor-anchored), drag-pan, double-click reset,
 * min/max zoom, fit-on-load. Applies a CameraView to the world container.
 * DOM events are bound to the host element (screen space).
 */
export class Camera {
  private view: CameraView = { scale: 1, x: 0, y: 0 };
  private bounds: ZoomBounds = { min: 0.1, max: 4 };
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private readonly listeners = new Set<(view: CameraView) => void>();
  private readonly abort = new AbortController();

  constructor(
    private readonly host: HTMLElement,
    private readonly world: Container,
    private readonly worldW: number,
    private readonly worldH: number,
  ) {
    const { signal } = this.abort;
    host.addEventListener('wheel', this.onWheel, { passive: false, signal });
    host.addEventListener('pointerdown', this.onPointerDown, { signal });
    window.addEventListener('pointermove', this.onPointerMove, { signal });
    window.addEventListener('pointerup', this.onPointerUp, { signal });
    host.addEventListener('dblclick', this.onDoubleClick, { signal });
    this.fit();
  }

  destroy(): void {
    this.abort.abort();
    this.listeners.clear();
  }

  /** Notified after every view change (labels layer re-syncs on this). */
  onChange(listener: (view: CameraView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getView(): CameraView {
    return this.view;
  }

  /** The scale that exactly fits the world in the current viewport. */
  fitScale(): number {
    const { width, height } = this.hostSize();
    return fitView(width, height, this.worldW, this.worldH).scale;
  }

  /** Fit-on-load / reset / responsive re-fit. */
  fit(): void {
    const { width, height } = this.hostSize();
    const view = fitView(width, height, this.worldW, this.worldH);
    this.bounds = zoomBounds(view.scale);
    this.apply(view);
  }

  /** Call when the host element resized; keeps the framing sane. */
  onResize(): void {
    const { width, height } = this.hostSize();
    this.bounds = zoomBounds(fitView(width, height, this.worldW, this.worldH).scale);
    this.apply(constrainPan(this.view, width, height, this.worldW, this.worldH));
  }

  zoomBy(factor: number, cx?: number, cy?: number): void {
    const { width, height } = this.hostSize();
    const next = zoomAt(this.view, cx ?? width / 2, cy ?? height / 2, factor, this.bounds);
    this.apply(constrainPan(next, width, height, this.worldW, this.worldH));
  }

  private hostSize(): { width: number; height: number } {
    return { width: this.host.clientWidth, height: this.host.clientHeight };
  }

  private apply(view: CameraView): void {
    this.view = view;
    this.world.scale.set(view.scale);
    this.world.position.set(view.x, view.y);
    for (const l of this.listeners) l(view);
  }

  private localPoint(e: MouseEvent): { x: number; y: number } {
    const rect = this.host.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.localPoint(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.zoomBy(factor, p.x, p.y);
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.dragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.host.style.cursor = 'grabbing';
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    const { width, height } = this.hostSize();
    this.apply(constrainPan(panBy(this.view, dx, dy), width, height, this.worldW, this.worldH));
  };

  private readonly onPointerUp = (): void => {
    this.dragging = false;
    this.host.style.cursor = 'grab';
  };

  private readonly onDoubleClick = (e: MouseEvent): void => {
    e.preventDefault();
    this.fit();
  };
}
