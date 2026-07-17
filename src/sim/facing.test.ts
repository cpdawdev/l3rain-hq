import { describe, expect, it } from 'vitest';
import {
  animStateFor,
  facingFromVelocity,
  isFrontFacing,
  isMirrored,
  walkPhase,
} from './facing';

describe('facingFromVelocity', () => {
  it('maps each velocity quadrant to a facing', () => {
    expect(facingFromVelocity(1, 1)).toBe('se'); // right + down
    expect(facingFromVelocity(-1, 1)).toBe('sw'); // left + down
    expect(facingFromVelocity(1, -1)).toBe('ne'); // right + up
    expect(facingFromVelocity(-1, -1)).toBe('nw'); // left + up
  });

  it('returns null below the movement epsilon (idle keeps its facing)', () => {
    expect(facingFromVelocity(0, 0)).toBeNull();
    expect(facingFromVelocity(0.001, -0.001)).toBeNull();
  });

  it('lets vertical decide front/back and horizontal decide mirror', () => {
    expect(facingFromVelocity(0.2, 3)).toBe('se'); // mostly down → front
    expect(facingFromVelocity(-0.2, -3)).toBe('nw'); // mostly up → back, left
  });
});

describe('front/mirror classification', () => {
  it('SE/SW show the face, NE/NW show the back', () => {
    expect(isFrontFacing('se')).toBe(true);
    expect(isFrontFacing('sw')).toBe(true);
    expect(isFrontFacing('ne')).toBe(false);
    expect(isFrontFacing('nw')).toBe(false);
  });

  it('SW/NW are the mirrored variants', () => {
    expect(isMirrored('se')).toBe(false);
    expect(isMirrored('sw')).toBe(true);
    expect(isMirrored('ne')).toBe(false);
    expect(isMirrored('nw')).toBe(true);
  });
});

describe('animation state', () => {
  it('collapses every non-walk sim state to idle', () => {
    expect(animStateFor('walk')).toBe('walk');
    expect(animStateFor('work')).toBe('idle');
    expect(animStateFor('break')).toBe('idle');
    expect(animStateFor('paused')).toBe('idle');
  });

  it('advances the walk phase faster than the idle sway, deterministically', () => {
    const idle = walkPhase(1, 0.5, false);
    const walk = walkPhase(1, 0.5, true);
    expect(walk).toBeGreaterThan(idle);
    expect(walkPhase(1, 0.5, true)).toBe(walk); // pure
  });
});
