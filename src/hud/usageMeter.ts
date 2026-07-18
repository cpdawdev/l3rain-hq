import type { UsageInfo } from '../data/provider';

/** What the 5-HOUR USAGE strip renders, derived from a usage snapshot. */
export interface UsageMeter {
  /** Meter value 0..100 shown as the bar width + the big number. */
  pct: number;
  /**
   * 'used'    → pct is REAL quota consumed (usage.fiveHour.usedPct).
   * 'elapsed' → pct is time elapsed in the window (honest fallback, never faked
   *             as quota when a real capture is missing).
   */
  mode: 'used' | 'elapsed';
  capActive: boolean;
  /** 7-day quota %, when a real number is known (else null → hide the line). */
  weeklyPct: number | null;
  /** ms until the 5-hour window resets, when known (else null → hide countdown). */
  remainingMs: number | null;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, n));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Pure selector for the 5-HOUR USAGE strip (unit-testable, no DOM).
 *
 * Prefers REAL quota consumed (`fiveHourUsedPct`) when a live capture exists;
 * otherwise falls back to time-elapsed (`fiveHourPctElapsed`) — labelled honestly
 * via `mode` so the meter is never mislabeled. Returns null when there is nothing
 * to show, so the strip degrades gracefully to hidden.
 */
export function usageMeter(usage: UsageInfo | null, nowMs: number = Date.now()): UsageMeter | null {
  if (!usage) return null;

  const { fiveHourUsedPct: used, fiveHourPctElapsed: elapsed } = usage;
  let pct: number;
  let mode: 'used' | 'elapsed';
  if (isNum(used)) {
    pct = clamp(used);
    mode = 'used';
  } else if (isNum(elapsed)) {
    pct = clamp(elapsed);
    mode = 'elapsed';
  } else {
    return null;
  }

  // Reset countdown: prefer the ISO instant (ticks live), fall back to secsToReset.
  let remainingMs: number | null = null;
  if (usage.resetIso !== null) {
    const t = Date.parse(usage.resetIso);
    if (Number.isFinite(t)) remainingMs = Math.max(0, t - nowMs);
  }
  if (remainingMs === null && isNum(usage.secsToReset)) {
    remainingMs = Math.max(0, usage.secsToReset * 1000);
  }

  return {
    pct: Math.round(pct),
    mode,
    capActive: usage.capActive,
    weeklyPct: isNum(usage.weeklyUsedPct) ? Math.round(clamp(usage.weeklyUsedPct)) : null,
    remainingMs,
  };
}

/** "1h 34m 05s" style countdown, matching the main dashboard. */
export function formatCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(h)}h ${pad(m)}m ${pad(sec)}s`;
}
