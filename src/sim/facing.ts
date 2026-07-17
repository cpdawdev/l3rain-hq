/**
 * Isometric facing + animation-state derivation for the chibi paper-dolls.
 * Four facings match the camera's iso quadrants:
 *   se = front, moving screen right+down    sw = front-mirror, left+down
 *   ne = back,  moving right+up              nw = back-mirror, left+up
 * SE/SW show the face; NE/NW show the back of the head (see chibi renderer).
 */
export type Facing = 'se' | 'sw' | 'ne' | 'nw';

export const FACINGS: readonly Facing[] = ['se', 'sw', 'ne', 'nw'];

/** SE/SW face the camera (face visible); NE/NW face away (back of head). */
export function isFrontFacing(f: Facing): boolean {
  return f === 'se' || f === 'sw';
}

/** SW/NW are the horizontally-mirrored (left-facing) variants. */
export function isMirrored(f: Facing): boolean {
  return f === 'sw' || f === 'nw';
}

/**
 * Facing from a velocity vector in screen/backdrop space. Returns null when the
 * motion is below `eps` (caller keeps the previous facing — idle agents don't
 * spin). Vertical dominates the front/back choice; horizontal the mirror.
 */
export function facingFromVelocity(dx: number, dy: number, eps = 0.01): Facing | null {
  if (Math.abs(dx) < eps && Math.abs(dy) < eps) return null;
  const south = dy >= 0; // moving down the screen = toward the camera = front
  const east = dx >= 0;
  if (south) return east ? 'se' : 'sw';
  return east ? 'ne' : 'nw';
}

export type AnimState = 'idle' | 'walk';

/** The renderer only distinguishes idle vs walk; every non-walk state is idle. */
export function animStateFor(simState: string): AnimState {
  return simState === 'walk' ? 'walk' : 'idle';
}

/**
 * Continuous walk-cycle phase (radians). Walking advances at `rate`; idle holds
 * a slow breathing oscillation. Deterministic given (elapsed, seed).
 */
export function walkPhase(elapsed: number, seed: number, moving: boolean): number {
  const rate = moving ? 9 : 2.2;
  return elapsed * rate + seed;
}
