import { describe, expect, it } from 'vitest';
import type { UsageInfo } from '../data/provider';
import { formatCountdown, usageMeter } from './usageMeter';

const NOW = Date.parse('2026-07-18T02:00:00Z');
// reset 1h34m from NOW
const RESET_ISO = new Date(NOW + (94 * 60 + 0) * 1000).toISOString();

function usage(partial: Partial<UsageInfo>): UsageInfo {
  return {
    capActive: false,
    fiveHourUsedPct: null,
    fiveHourPctElapsed: null,
    resetIso: null,
    secsToReset: null,
    weeklyUsedPct: null,
    ...partial,
  };
}

describe('usageMeter', () => {
  it('usedPct present → shows REAL quota + mode "used"', () => {
    const m = usageMeter(usage({ fiveHourUsedPct: 27, fiveHourPctElapsed: 68 }), NOW);
    expect(m).not.toBeNull();
    expect(m?.pct).toBe(27); // quota, NOT the 68% elapsed
    expect(m?.mode).toBe('used');
  });

  it('usedPct null/absent → falls back to pctElapsed + mode "elapsed"', () => {
    const m = usageMeter(usage({ fiveHourUsedPct: null, fiveHourPctElapsed: 68 }), NOW);
    expect(m?.pct).toBe(68);
    expect(m?.mode).toBe('elapsed');
  });

  it('rounds and clamps the meter value into 0..100', () => {
    expect(usageMeter(usage({ fiveHourUsedPct: 26.6 }), NOW)?.pct).toBe(27);
    expect(usageMeter(usage({ fiveHourUsedPct: 140 }), NOW)?.pct).toBe(100);
    expect(usageMeter(usage({ fiveHourPctElapsed: -5 }), NOW)?.pct).toBe(0);
  });

  it('returns null when there is nothing to show (degrade gracefully)', () => {
    expect(usageMeter(usage({}), NOW)).toBeNull();
    expect(usageMeter(null, NOW)).toBeNull();
  });

  it('reset countdown comes from resetIso (ticks with now)', () => {
    const m = usageMeter(usage({ fiveHourUsedPct: 27, resetIso: RESET_ISO }), NOW);
    expect(m?.remainingMs).toBe((94 * 60 + 0) * 1000);
    expect(formatCountdown(m?.remainingMs ?? 0)).toBe('1h 34m 00s');
    // one second later the countdown has ticked down
    const later = usageMeter(usage({ fiveHourUsedPct: 27, resetIso: RESET_ISO }), NOW + 1000);
    expect(later?.remainingMs).toBe((94 * 60 - 1) * 1000);
  });

  it('falls back to secsToReset when resetIso is absent', () => {
    const m = usageMeter(usage({ fiveHourPctElapsed: 40, secsToReset: 5640 }), NOW);
    expect(m?.remainingMs).toBe(5640 * 1000);
    expect(m?.remainingMs).not.toBeNull();
  });

  it('exposes weekly quota only when a real number is present', () => {
    expect(usageMeter(usage({ fiveHourUsedPct: 27, weeklyUsedPct: 41 }), NOW)?.weeklyPct).toBe(41);
    expect(
      usageMeter(usage({ fiveHourUsedPct: 27, weeklyUsedPct: null }), NOW)?.weeklyPct,
    ).toBeNull();
  });

  it('carries capActive through', () => {
    expect(usageMeter(usage({ fiveHourPctElapsed: 90, capActive: true }), NOW)?.capActive).toBe(
      true,
    );
  });
});

describe('formatCountdown', () => {
  it('formats h/m/s with zero-padding', () => {
    expect(formatCountdown(0)).toBe('0h 00m 00s');
    expect(formatCountdown((2 * 3600 + 5 * 60 + 9) * 1000)).toBe('2h 05m 09s');
  });
});
