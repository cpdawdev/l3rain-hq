import { describe, expect, it } from 'vitest';
import { isBreakStatus, nextBehavior, statusBubble, type DecisionContext } from './behavior';

/** Deterministic RNG that yields a fixed queue (then repeats the last value). */
function queue(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

const base: DecisionContext = { status: 'working', isOrchestrator: false, hasVisitTarget: true };

describe('isBreakStatus', () => {
  it('is true only for idle and black-lit', () => {
    expect(isBreakStatus('idle')).toBe(true);
    expect(isBreakStatus('black-lit')).toBe(true);
    expect(isBreakStatus('working')).toBe(false);
    expect(isBreakStatus('waiting')).toBe(false);
    expect(isBreakStatus('opening')).toBe(false);
  });
});

describe('nextBehavior', () => {
  it('keeps the orchestrator working almost always', () => {
    expect(nextBehavior({ ...base, isOrchestrator: true }, queue([0.5, 0.1]))).toEqual({
      kind: 'work',
      dwell: expect.closeTo(6.8),
    });
    expect(nextBehavior({ ...base, isOrchestrator: true }, queue([0.95, 0]))).toEqual({
      kind: 'break',
      area: 'kitchen',
      dwell: 3,
    });
  });

  it('sends idle / black-lit departments on break every time', () => {
    for (const status of ['idle', 'black-lit'] as const) {
      const b = nextBehavior({ ...base, status }, queue([0.99, 0, 0]));
      expect(b.kind).toBe('break');
    }
  });

  it('holds waiting / opening departments at the desk (with rare stretches)', () => {
    expect(nextBehavior({ ...base, status: 'waiting' }, queue([0.5, 0])).kind).toBe('wait');
    expect(nextBehavior({ ...base, status: 'opening' }, queue([0.5, 0])).kind).toBe('wait');
    expect(nextBehavior({ ...base, status: 'waiting' }, queue([0.9, 0, 0])).kind).toBe('break');
  });

  it('working departments split between desk, breaks and visits', () => {
    expect(nextBehavior(base, queue([0.3, 0])).kind).toBe('work');
    expect(nextBehavior(base, queue([0.6, 0, 0])).kind).toBe('break');
    expect(nextBehavior(base, queue([0.85, 0])).kind).toBe('visit');
  });

  it('never visits when no other department is active', () => {
    expect(nextBehavior({ ...base, hasVisitTarget: false }, queue([0.85, 0])).kind).toBe('work');
  });

  it('chooses break areas from the RNG', () => {
    expect(nextBehavior({ ...base, status: 'idle' }, queue([0.99, 0.0, 0])).kind).toBe('break');
    const lounge = nextBehavior({ ...base, status: 'idle' }, queue([0.99, 0.5, 0]));
    expect(lounge.kind === 'break' && lounge.area).toBe('lounge');
    const restroom = nextBehavior({ ...base, status: 'idle' }, queue([0.99, 0.9, 0]));
    expect(restroom.kind === 'break' && restroom.area).toBe('restroom');
  });
});

describe('statusBubble', () => {
  it('shows a glyph only for blocked / paused states', () => {
    expect(statusBubble('waiting')).toBe('waiting');
    expect(statusBubble('opening')).toBe('?');
    expect(statusBubble('black-lit')).toBe('on break');
    expect(statusBubble('working')).toBeNull();
    expect(statusBubble('idle')).toBeNull();
  });
});
