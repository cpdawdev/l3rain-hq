import type { Container } from 'pixi.js';
import {
  constrainPan,
  distance,
  fitView,
  midpoint,
  panBy,
  pinchView,
  zoomAt,
  zoomBounds,
  type CameraView,
  type Point,
  type ZoomBounds,
} from './cameraMath';

/**
 * Camera: scroll-zoom (cursor-anchored), drag-pan, double-click reset,
 * min/max zoom, fit-on-load — plus full touch support:
 *   one finger  = pan
 *   two fingers = pinch zoom anchored at the pinch midpoint (+ two-finger pan)
 *   double-tap  = reset (fit)
 * Implemented with pointer events + pointer capture and a pointer cache, so
 * mouse, touch and pen share one code path. The host element must have
 * `touch-action: none` (the engine sets it) so mobile Safari does not hijack
 * the gestures for page scroll/zoom.
 */
/** How close (px) and how soon (ms) two taps must land to count as a double-tap. */
const DOUBLE_TAP_MS = 450;
const DOUBLE_TAP_PX = 48;
/** Finger travel (px) below which a press-release is treated as a tap, not a drag. */
const TAP_SLOP_PX = 12;

export class Camera {
  private view: CameraView = { scale: 1, x: 0, y: 0 };
  private bounds: ZoomBounds = { min: 0.1, max: 4 };
  /** active pointers in host-local coordinates */
  private readonly pointers = new Map<number, Point>();
  /** pointer ids we have taken capture of for the in-flight gesture */
  private readonly captured = new Set<number>();
  /** cumulative finger travel of the current gesture (tap detection) */
  private gestureTravel = 0;
  /** where the current single-finger gesture started (reliable tap location) */
  private tapCandidate: Point | null = null;
  private lastTap: { time: number; x: number; y: number } | null = null;
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
    host.addEventListener('pointermove', this.onPointerMove, { signal });
    host.addEventListener('pointerup', this.onPointerEnd, { signal });
    host.addEventListener('pointercancel', this.onPointerEnd, { signal });
    host.addEventListener('dblclick', this.onDoubleClick, { signal });
    // Older iOS Safari fires proprietary gesture events for pinches even with
    // pointer events; prevent them from zooming the page itself.
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      host.addEventListener(
        type,
        (e) => {
          e.preventDefault();
        },
        { passive: false, signal },
      );
    }
    this.fit();
  }

  destroy(): void {
    this.abort.abort();
    this.listeners.clear();
    this.pointers.clear();
    this.captured.clear();
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

  private localPoint(e: { clientX: number; clientY: number }): Point {
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
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const firstFinger = this.pointers.size === 0;
    const p = this.localPoint(e);
    this.pointers.set(e.pointerId, p);
    // A NEW gesture (first finger down) starts fresh — this must not depend on
    // the previous gesture releasing cleanly (synthetic touch can be untidy).
    if (firstFinger) {
      this.gestureTravel = 0;
      this.tapCandidate = p; // reliable tap position (pointerup coords can be bogus)
    } else {
      this.tapCandidate = null; // a multi-finger gesture is never a tap
    }
    this.host.style.cursor = 'grabbing';
    // NOTE: capture is deferred until the pointer actually moves (see onPointerMove).
    // Capturing on pointerdown re-targets pointerup away from Pixi's canvas and
    // breaks agent tap-selection; a pure tap must reach Pixi untouched.
  };

  /** Take pointer capture once — only for confirmed drags/pinches. */
  private capture(id: number): void {
    if (this.captured.has(id)) return;
    try {
      this.host.setPointerCapture(id);
      this.captured.add(id);
    } catch {
      /* capture is best-effort (e.g. detached during teardown) */
    }
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const next = this.localPoint(e);
    const { width, height } = this.hostSize();

    if (this.pointers.size === 1) {
      // one-finger / mouse drag = pan
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      this.gestureTravel += Math.hypot(dx, dy);
      this.pointers.set(e.pointerId, next);
      // Only capture once the move exceeds the tap slop, so taps stay taps.
      if (this.gestureTravel > TAP_SLOP_PX) this.capture(e.pointerId);
      this.apply(constrainPan(panBy(this.view, dx, dy), width, height, this.worldW, this.worldH));
      return;
    }

    if (this.pointers.size === 2) {
      // two-finger pinch: zoom anchored at the pinch midpoint + two-finger pan
      this.capture(e.pointerId);
      const before = [...this.pointers.values()];
      const oldMid = midpoint(before[0] as Point, before[1] as Point);
      const oldSpread = distance(before[0] as Point, before[1] as Point);
      this.pointers.set(e.pointerId, next);
      const after = [...this.pointers.values()];
      const newMid = midpoint(after[0] as Point, after[1] as Point);
      const newSpread = distance(after[0] as Point, after[1] as Point);
      this.gestureTravel += 1000; // a pinch is never a tap
      if (oldSpread <= 0) return;
      const factor = newSpread / oldSpread;
      this.apply(
        constrainPan(
          pinchView(this.view, oldMid, newMid, factor, this.bounds),
          width,
          height,
          this.worldW,
          this.worldH,
        ),
      );
      return;
    }

    // 3+ pointers: just track them
    this.pointers.set(e.pointerId, next);
  };

  private readonly onPointerEnd = (e: PointerEvent): void => {
    this.captured.delete(e.pointerId);
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size > 0) return;
    this.host.style.cursor = 'grab';

    // Manual double-tap reset for touch/pen — iOS Safari never fires dblclick
    // on a touch-action:none canvas. Use the DOWN position (pointerup coords are
    // unreliable under synthetic touch), and only if the finger barely moved.
    const tap = this.tapCandidate;
    this.tapCandidate = null;
    if (e.pointerType === 'mouse' || this.gestureTravel >= TAP_SLOP_PX || tap === null) return;

    const now = performance.now();
    if (
      this.lastTap !== null &&
      now - this.lastTap.time < DOUBLE_TAP_MS &&
      Math.hypot(tap.x - this.lastTap.x, tap.y - this.lastTap.y) < DOUBLE_TAP_PX
    ) {
      this.lastTap = null;
      this.fit();
    } else {
      this.lastTap = { time: now, x: tap.x, y: tap.y };
    }
  };

  private readonly onDoubleClick = (e: MouseEvent): void => {
    e.preventDefault();
    this.fit();
  };
}
