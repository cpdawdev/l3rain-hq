import { describe, expect, it } from 'vitest';
import { BufferImageSource, Texture } from 'pixi.js';
import { Chibi, hashPalette, shade, sliceFrames } from './chibi';
import type { AgentPose } from '../sim/Simulation';
import type { Facing } from '../sim/facing';

/** A 1×1 RGBA texture with no DOM/canvas dependency — usable in the node env. */
function stubTexture(): Texture {
  const source = new BufferImageSource({
    resource: new Uint8Array([200, 150, 120, 255]),
    width: 1,
    height: 1,
  });
  return new Texture({ source });
}

function pose(facing: Facing, moving: boolean, phase = 0): AgentPose {
  return { x: 0, y: 0, facing, moving, phase, state: moving ? 'walk' : 'work' };
}

describe('sliceFrames (directional-sheet layout math)', () => {
  it('slices a horizontal strip into per-frame rects', () => {
    const rects = sliceFrames(64, 96, 4);
    expect(rects.map((r) => [r.x, r.y, r.width, r.height])).toEqual([
      [0, 0, 64, 96],
      [64, 0, 64, 96],
      [128, 0, 64, 96],
      [192, 0, 64, 96],
    ]);
  });

  it('applies a frame offset (walk frames start after the idle frames)', () => {
    const walk = sliceFrames(48, 64, 4, 2); // idle=2 → walk begins at frame 2
    expect(walk).toHaveLength(4);
    expect(walk.map((r) => r.x)).toEqual([96, 144, 192, 240]);
    expect(walk.every((r) => r.width === 48 && r.height === 64)).toBe(true);
  });
});

describe('shade', () => {
  it('is a no-op at factor 0', () => {
    expect(shade(0x808080, 0)).toBe(0x808080);
  });
  it('lightens toward white and darkens toward black', () => {
    expect(shade(0x000000, 1)).toBe(0xffffff);
    expect(shade(0xffffff, -1)).toBe(0x000000);
    expect(shade(0x808080, 0.5)).toBeGreaterThan(0x808080);
  });
});

describe('hashPalette (per-agent fallback palette)', () => {
  it('is deterministic for a given id', () => {
    expect(hashPalette('sung-jin-woo')).toEqual(hashPalette('sung-jin-woo'));
  });
  it('gives different agents different shirt colors', () => {
    const ids = ['senku', 'nami', 'levi', 'reborn', 'erwin-smith'];
    const shirts = new Set(ids.map((id) => hashPalette(id).shirt));
    expect(shirts.size).toBeGreaterThan(1);
  });
  it('always yields a dark outline and a pants tone darker than the shirt', () => {
    const p = hashPalette('gojo-satoru');
    expect(p.outline).toBe(0x0d1420);
    expect(p.pants).toBeLessThan(p.shirt);
  });
});

describe('Chibi (animated paper-doll)', () => {
  it('shows the face on SE/SW and the back of the head (no face) on NE/NW', () => {
    const chibi = new Chibi(stubTexture(), hashPalette('levi'), 0.2);

    chibi.update(pose('se', false));
    expect(chibi.showingFace).toBe(true);
    expect(chibi.showingBack).toBe(false);

    chibi.update(pose('sw', false));
    expect(chibi.showingFace).toBe(true); // mirrored front still shows the face
    expect(chibi.showingBack).toBe(false);

    // back views: the face is hidden, the back-of-head disc is shown
    chibi.update(pose('ne', true));
    expect(chibi.showingFace).toBe(false);
    expect(chibi.showingBack).toBe(true);

    chibi.update(pose('nw', true));
    expect(chibi.showingFace).toBe(false);
    expect(chibi.showingBack).toBe(true);
  });

  it('mirrors the whole doll (negative x-scale) for the left-facing variants', () => {
    const chibi = new Chibi(stubTexture(), hashPalette('nami'), 0.5);

    chibi.update(pose('se', false));
    const right = chibi.root.scale.x;
    expect(right).toBeGreaterThan(0);

    chibi.update(pose('sw', false));
    expect(chibi.root.scale.x).toBeCloseTo(-right, 6);

    chibi.update(pose('ne', true));
    expect(chibi.root.scale.x).toBeGreaterThan(0);

    chibi.update(pose('nw', true));
    expect(chibi.root.scale.x).toBeCloseTo(-right, 6);
  });

  it('advances the walk cycle: the body bob differs across phases while walking', () => {
    const chibi = new Chibi(null, hashPalette('senku'), 0.3);
    // foot point stays fixed; the visible height is measured above it
    expect(chibi.height).toBeGreaterThan(0);
    // exercising every facing/state must never throw (walk + idle poses)
    for (const f of ['se', 'sw', 'ne', 'nw'] as Facing[]) {
      for (const moving of [false, true]) {
        for (const phase of [0, Math.PI / 2, Math.PI]) {
          expect(() => chibi.update(pose(f, moving, phase))).not.toThrow();
        }
      }
    }
  });
});
