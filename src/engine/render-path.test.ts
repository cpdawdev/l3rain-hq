import { describe, expect, it } from 'vitest';
import { resolveRenderPath } from './agents';
import type { AgentAsset } from '../manifest/schema';

type Entry = Pick<AgentAsset, 'status' | 'spriteKind' | 'directionalSheet'>;

const sheet: NonNullable<AgentAsset['directionalSheet']> = {
  directions: { se: 'characters/x_se.png', ne: 'characters/x_ne.png' },
  states: { idle: { frames: 1 }, walk: { frames: 4 } },
  frameSize: { width: 128, height: 192 },
};

describe('resolveRenderPath', () => {
  it('renders interim portrait tokens as animated chibis', () => {
    const e: Entry = { status: 'placeholder', spriteKind: 'portrait-token' };
    expect(resolveRenderPath(e, true)).toBe('chibi');
  });

  it('falls back to a labeled silhouette when the portrait texture is missing', () => {
    const e: Entry = { status: 'placeholder', spriteKind: 'portrait-token' };
    expect(resolveRenderPath(e, false)).toBe('placeholder-silhouette');
  });

  it('uses production full-body stills as-is', () => {
    const e: Entry = { status: 'production', spriteKind: 'full-body' };
    expect(resolveRenderPath(e, true)).toBe('production-sprite');
  });

  it('dims a placeholder full-body file with a tag', () => {
    const e: Entry = { status: 'placeholder', spriteKind: 'full-body' };
    expect(resolveRenderPath(e, true)).toBe('placeholder-sprite');
  });

  it('prefers baked directional sheets, even before the portrait loads', () => {
    const e: Entry = { status: 'production', spriteKind: 'directional-sheet', directionalSheet: sheet };
    expect(resolveRenderPath(e, false)).toBe('directional-sheet');
  });

  it('does not claim directional-sheet without the sheet data', () => {
    const e: Entry = { status: 'placeholder', spriteKind: 'directional-sheet' };
    expect(resolveRenderPath(e, true)).toBe('placeholder-sprite');
  });
});
