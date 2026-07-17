import { describe, expect, it } from 'vitest';
import {
  clamp,
  constrainPan,
  distance,
  fitView,
  midpoint,
  panBy,
  pinchView,
  zoomAt,
  zoomBounds,
} from './cameraMath';

describe('fitView', () => {
  it('fits a wide world into a 16:9 viewport, centered', () => {
    const v = fitView(1920, 1080, 3840, 2160, 1);
    expect(v.scale).toBeCloseTo(0.5);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(0);
  });

  it('centers a world narrower than the viewport', () => {
    const v = fitView(2000, 1000, 1000, 1000, 1);
    expect(v.scale).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(500);
    expect(v.y).toBeCloseTo(0);
  });

  it('is safe against zero dimensions', () => {
    expect(fitView(0, 0, 3840, 2160)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe('zoomAt', () => {
  const bounds = zoomBounds(0.5);

  it('keeps the world point under the cursor fixed', () => {
    const v0 = { scale: 0.5, x: 0, y: 0 };
    const cursor = { x: 960, y: 540 };
    // world point under cursor before zoom:
    const wx = (cursor.x - v0.x) / v0.scale;
    const wy = (cursor.y - v0.y) / v0.scale;
    const v1 = zoomAt(v0, cursor.x, cursor.y, 2, bounds);
    expect(wx * v1.scale + v1.x).toBeCloseTo(cursor.x);
    expect(wy * v1.scale + v1.y).toBeCloseTo(cursor.y);
  });

  it('clamps to min and max zoom', () => {
    const v = { scale: 0.5, x: 0, y: 0 };
    expect(zoomAt(v, 0, 0, 1e-9, bounds).scale).toBeCloseTo(bounds.min);
    expect(zoomAt(v, 0, 0, 1e9, bounds).scale).toBeCloseTo(bounds.max);
  });

  it('returns the same view when already at the bound', () => {
    const v = { scale: bounds.max, x: 10, y: 10 };
    expect(zoomAt(v, 0, 0, 2, bounds)).toBe(v);
  });
});

describe('panBy / constrainPan', () => {
  it('translates the view', () => {
    expect(panBy({ scale: 1, x: 5, y: 5 }, 10, -3)).toEqual({ scale: 1, x: 15, y: 2 });
  });

  it('never lets the world fully leave the viewport', () => {
    const v = constrainPan({ scale: 0.5, x: 99999, y: -99999 }, 1920, 1080, 3840, 2160, 120);
    expect(v.x).toBeLessThanOrEqual(1920 - 120);
    expect(v.y).toBeGreaterThanOrEqual(120 - 2160 * 0.5);
  });
});

describe('pinchView (two-finger gesture)', () => {
  const bounds = zoomBounds(0.5);

  it('midpoint helpers', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
  });

  it('scales by the spread factor, anchored at the pinch midpoint', () => {
    const v0 = { scale: 0.5, x: 100, y: 50 };
    const mid = { x: 400, y: 300 };
    // fingers spread ×2 without the midpoint moving
    const v1 = pinchView(v0, mid, mid, 2, bounds);
    expect(v1.scale).toBeCloseTo(1);
    // the world point under the midpoint stays under it
    const wx = (mid.x - v0.x) / v0.scale;
    const wy = (mid.y - v0.y) / v0.scale;
    expect(wx * v1.scale + v1.x).toBeCloseTo(mid.x);
    expect(wy * v1.scale + v1.y).toBeCloseTo(mid.y);
  });

  it('pans with the moving midpoint (two-finger pan at factor 1)', () => {
    const v0 = { scale: 0.5, x: 0, y: 0 };
    const v1 = pinchView(v0, { x: 200, y: 200 }, { x: 260, y: 170 }, 1, bounds);
    expect(v1.scale).toBeCloseTo(0.5);
    expect(v1.x).toBeCloseTo(60);
    expect(v1.y).toBeCloseTo(-30);
  });

  it('pins the world point under the old midpoint to the new midpoint while zooming', () => {
    const v0 = { scale: 0.8, x: -40, y: 25 };
    const oldMid = { x: 300, y: 400 };
    const newMid = { x: 340, y: 360 };
    const wx = (oldMid.x - v0.x) / v0.scale;
    const wy = (oldMid.y - v0.y) / v0.scale;
    const v1 = pinchView(v0, oldMid, newMid, 1.5, bounds);
    expect(wx * v1.scale + v1.x).toBeCloseTo(newMid.x);
    expect(wy * v1.scale + v1.y).toBeCloseTo(newMid.y);
  });

  it('clamps the pinch scale to the zoom bounds', () => {
    const v = { scale: 0.5, x: 0, y: 0 };
    const mid = { x: 0, y: 0 };
    expect(pinchView(v, mid, mid, 1e9, bounds).scale).toBeCloseTo(bounds.max);
    expect(pinchView(v, mid, mid, 1e-9, bounds).scale).toBeCloseTo(bounds.min);
  });
});

describe('clamp', () => {
  it('clamps both ends', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
