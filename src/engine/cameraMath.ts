/**
 * Pure camera math — unit-tested without Pixi.
 * A view is the transform applied to the world container:
 * worldPoint * scale + (x, y) = screenPoint.
 */

export interface CameraView {
  scale: number;
  x: number;
  y: number;
}

export interface ZoomBounds {
  min: number;
  max: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Scale + offset so the world fits centered in the viewport with a margin. */
export function fitView(
  viewW: number,
  viewH: number,
  worldW: number,
  worldH: number,
  margin = 0.97,
): CameraView {
  if (viewW <= 0 || viewH <= 0 || worldW <= 0 || worldH <= 0) {
    return { scale: 1, x: 0, y: 0 };
  }
  const scale = Math.min(viewW / worldW, viewH / worldH) * margin;
  return {
    scale,
    x: (viewW - worldW * scale) / 2,
    y: (viewH - worldH * scale) / 2,
  };
}

/** Zoom limits derived from the fit scale: half fit … several times in. */
export function zoomBounds(fitScale: number): ZoomBounds {
  return { min: fitScale * 0.5, max: Math.max(fitScale * 8, 2.5) };
}

/** Cursor-anchored zoom: the world point under the cursor stays under it. */
export function zoomAt(
  view: CameraView,
  cursorX: number,
  cursorY: number,
  factor: number,
  bounds: ZoomBounds,
): CameraView {
  const scale = clamp(view.scale * factor, bounds.min, bounds.max);
  if (scale === view.scale) return view;
  const ratio = scale / view.scale;
  return {
    scale,
    x: cursorX - (cursorX - view.x) * ratio,
    y: cursorY - (cursorY - view.y) * ratio,
  };
}

export function panBy(view: CameraView, dx: number, dy: number): CameraView {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

export interface Point {
  x: number;
  y: number;
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Two-finger pinch update: scales by `factor` (new spread / old spread) while
 * keeping the world point that was under the old pinch midpoint pinned under
 * the new midpoint — this gives midpoint-anchored zoom AND two-finger pan in
 * one transform.
 */
export function pinchView(
  view: CameraView,
  oldMid: Point,
  newMid: Point,
  factor: number,
  bounds: ZoomBounds,
): CameraView {
  const scale = clamp(view.scale * factor, bounds.min, bounds.max);
  const worldX = (oldMid.x - view.x) / view.scale;
  const worldY = (oldMid.y - view.y) / view.scale;
  return {
    scale,
    x: newMid.x - worldX * scale,
    y: newMid.y - worldY * scale,
  };
}

/** Keep at least `keep` px of world visible on every side (prevents losing the map). */
export function constrainPan(
  view: CameraView,
  viewW: number,
  viewH: number,
  worldW: number,
  worldH: number,
  keep = 120,
): CameraView {
  const w = worldW * view.scale;
  const h = worldH * view.scale;
  return {
    ...view,
    x: clamp(view.x, keep - w, viewW - keep),
    y: clamp(view.y, keep - h, viewH - keep),
  };
}
