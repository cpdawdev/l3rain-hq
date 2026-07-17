import type { DepartmentStatus } from '../data/provider';

/**
 * Pure agent behavior policy — ported from V1 app.js decide()/goHome()/isBreak().
 * Given the agent's department status and a seeded RNG, choose the next action.
 * No side effects, no world state: the Simulation applies the result. This is
 * what makes the office feel driven by the live feed instead of random.
 */

export type Behavior =
  | { kind: 'work'; dwell: number } // return to / stay at the desk, producing
  | { kind: 'wait'; dwell: number } // stand at the desk, blocked (waiting/opening)
  | { kind: 'break'; area: BreakArea; dwell: number } // walk to a social room
  | { kind: 'visit'; dwell: number }; // walk to another active department

export type BreakArea = 'kitchen' | 'lounge' | 'restroom';

/** Statuses where the room is NOT actively producing → agents drift to breaks. */
export function isBreakStatus(status: DepartmentStatus): boolean {
  return status === 'idle' || status === 'black-lit';
}

const BREAK_AREAS: readonly BreakArea[] = ['kitchen', 'lounge', 'restroom'];

function pickBreak(rng: () => number): BreakArea {
  return BREAK_AREAS[Math.floor(rng() * BREAK_AREAS.length)] ?? 'kitchen';
}

export interface DecisionContext {
  status: DepartmentStatus;
  isOrchestrator: boolean;
  /** true if at least one OTHER department is currently working (visit target exists) */
  hasVisitTarget: boolean;
}

/**
 * Choose the next behavior. `rng` is injected so the Simulation stays
 * deterministic under a seeded generator (and unit tests are exact).
 * Cap/paused is handled by the Simulation, not here.
 */
export function nextBehavior(ctx: DecisionContext, rng: () => number): Behavior {
  const r = rng();

  // The orchestrator holds the platform; only rarely steps out for coffee.
  if (ctx.isOrchestrator) {
    if (r < 0.9) return { kind: 'work', dwell: 6 + rng() * 8 };
    return { kind: 'break', area: 'kitchen', dwell: 3 + rng() * 3 };
  }

  // Idle / black-lit department → people are on break (idle wander).
  if (isBreakStatus(ctx.status)) {
    return { kind: 'break', area: pickBreak(rng), dwell: 12 + rng() * 15 };
  }

  // Waiting / opening → blocked at the desk (bubble), with the odd stretch.
  if (ctx.status === 'waiting' || ctx.status === 'opening') {
    if (r < 0.8) return { kind: 'wait', dwell: 5 + rng() * 6 };
    return { kind: 'break', area: pickBreak(rng), dwell: 4 + rng() * 4 };
  }

  // Working department: mostly heads-down, with human breaks and cross-team visits.
  if (r < 0.52) return { kind: 'work', dwell: 7 + rng() * 9 };
  if (r < 0.78) return { kind: 'break', area: pickBreak(rng), dwell: 4 + rng() * 5 };
  if (r < 0.92 && ctx.hasVisitTarget) return { kind: 'visit', dwell: 4 + rng() * 3 };
  return { kind: 'work', dwell: 5 + rng() * 6 };
}

/** A speech-bubble glyph for a status, or null (working/idle show nothing). */
export function statusBubble(status: DepartmentStatus): string | null {
  switch (status) {
    case 'waiting':
      return 'waiting';
    case 'opening':
      return '?';
    case 'black-lit':
      return 'on break';
    default:
      return null;
  }
}
