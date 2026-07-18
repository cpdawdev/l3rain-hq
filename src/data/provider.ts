import type { Department } from './roster';

/** Department lighting states (spec) — live feed values map into this set. */
export const DEPARTMENT_STATUSES = ['working', 'waiting', 'idle', 'opening', 'black-lit'] as const;
export type DepartmentStatus = (typeof DEPARTMENT_STATUSES)[number];

export type AgentStatus = 'working' | 'waiting' | 'idle';

export interface PhaseProgress {
  name: string;
  /** 0..100 */
  pct: number;
}

export interface FeedItem {
  k: string;
  v: string;
  /** Optional #rrggbb accent from the feed source. */
  c?: string | undefined;
}

export interface UsageInfo {
  capActive: boolean;
  /** REAL quota consumed 0..100 in the 5-hour window — present only when a live
   *  capture exists (usage.fiveHour.usedPct); null otherwise. */
  fiveHourUsedPct: number | null;
  /** 0..100 time elapsed within the current 5-hour window, if known. */
  fiveHourPctElapsed: number | null;
  /** ISO timestamp the 5-hour window resets at, if known. */
  resetIso: string | null;
  /** Seconds until the 5-hour window resets — a redundant hint to resetIso. */
  secsToReset: number | null;
  /** REAL quota consumed 0..100 in the 7-day window, when known (else null). */
  weeklyUsedPct: number | null;
}

/** One immutable snapshot of everything the HUD + engine consume. */
export interface HqData {
  /** 'live' = real /status.json; 'mock-fallback' = live requested but unreachable. */
  source: 'live' | 'mock' | 'mock-fallback';
  updatedAt: string;
  phases: PhaseProgress[];
  /** Overall completion 0..100 (mean of phases). */
  overallPct: number;
  departments: Record<Department, DepartmentStatus>;
  /** Per-agent activity, derived from department status when no finer data exists. */
  agentActivity: Record<string, AgentStatus>;
  activityCounts: { working: number; waiting: number; idle: number };
  usage: UsageInfo | null;
  feed: FeedItem[];
}

/**
 * The single data interface the app talks to. Implementations:
 *   MockDataProvider  — typed in-repo mock (spec)
 *   LiveStatusProvider — polls /status.json with mock fallback (deviation 4)
 * A Cloudflare Worker / Durable Object source can implement this later
 * without touching the renderer or the HUD.
 */
export interface DataProvider {
  readonly kind: 'mock' | 'live';
  /** Resolves one snapshot. MUST never reject — degrade, don't throw. */
  snapshot(): Promise<HqData>;
  /** Push snapshots (initial + periodic). Returns an unsubscribe function. */
  subscribe(listener: (data: HqData) => void): () => void;
  dispose(): void;
}

export function overallPct(phases: PhaseProgress[]): number {
  if (phases.length === 0) return 0;
  const sum = phases.reduce((acc, p) => acc + Math.max(0, Math.min(100, p.pct)), 0);
  return Math.round(sum / phases.length);
}

export function countActivity(
  agentActivity: Record<string, AgentStatus>,
): HqData['activityCounts'] {
  const counts = { working: 0, waiting: 0, idle: 0 };
  for (const status of Object.values(agentActivity)) counts[status] += 1;
  return counts;
}

/** Derive a per-agent status from its department's lighting state. */
export function agentStatusFromDepartment(status: DepartmentStatus): AgentStatus {
  switch (status) {
    case 'working':
      return 'working';
    case 'waiting':
    case 'opening':
      return 'waiting';
    case 'idle':
    case 'black-lit':
      return 'idle';
  }
}
