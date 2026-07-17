import { describe, expect, it } from 'vitest';
import { rendersBehind, sortByDepth } from './depth';
import { resolveRenderPath } from './agents';

describe('depth sorting (spec: sort by foot/base Y)', () => {
  it('paints lower footY first (further back)', () => {
    const sorted = sortByDepth([
      { id: 'front', footY: 900 },
      { id: 'back', footY: 100 },
      { id: 'mid', footY: 500 },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(['back', 'mid', 'front']);
  });

  it('is stable for equal footY', () => {
    const sorted = sortByDepth([
      { id: 'a', footY: 500 },
      { id: 'b', footY: 500 },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('agent behind occluder iff foot Y < occluder depthY', () => {
    expect(rendersBehind(1000, 1712)).toBe(true);
    expect(rendersBehind(1800, 1712)).toBe(false);
    // mixed ordering: agent(1000) < occluder(1712) < agent(1800)
    const sorted = sortByDepth([
      { id: 'agent-front', footY: 1800 },
      { id: 'occluder', footY: 1712 },
      { id: 'agent-back', footY: 1000 },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(['agent-back', 'occluder', 'agent-front']);
  });
});

describe('resolveRenderPath (placeholder fallback rules)', () => {
  it('missing texture always yields a labeled silhouette', () => {
    expect(resolveRenderPath({ status: 'production', spriteKind: 'full-body' }, false)).toBe(
      'placeholder-silhouette',
    );
    expect(resolveRenderPath({ status: 'placeholder', spriteKind: 'portrait-token' }, false)).toBe(
      'placeholder-silhouette',
    );
  });

  it('production + texture renders the real sprite', () => {
    expect(resolveRenderPath({ status: 'production', spriteKind: 'full-body' }, true)).toBe(
      'production-sprite',
    );
  });

  it('placeholder status is never presented as final', () => {
    expect(resolveRenderPath({ status: 'placeholder', spriteKind: 'full-body' }, true)).toBe(
      'placeholder-sprite',
    );
    expect(resolveRenderPath({ status: 'placeholder', spriteKind: 'portrait-token' }, true)).toBe(
      'portrait-token',
    );
  });
});
