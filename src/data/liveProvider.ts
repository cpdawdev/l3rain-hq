import { z } from 'zod';
import { ROSTER, type Department } from './roster';
import { MockDataProvider, buildMockSnapshot } from './mockProvider';
import {
  DEPARTMENT_STATUSES,
  agentStatusFromDepartment,
  countActivity,
  overallPct,
  type AgentStatus,
  type DataProvider,
  type DepartmentStatus,
  type HqData,
} from './provider';

/**
 * The live endpoint the previous dashboard used (single source of truth for it).
 * Served by the l3rain arch-docs stage Worker; CORS is open (`*`).
 */
export const STATUS_JSON_URL = 'https://l3rain-arch-docs-stage.cpda-wdev.workers.dev/status.json';

/** Loose schema for /status.json — tolerate additions, never crash on them. */
const StatusJsonSchema = z.object({
  phases: z.array(z.object({ name: z.string(), pct: z.number() })).default([]),
  departments: z.record(z.string(), z.string()).default({}),
  usage: z
    .object({
      capActive: z.boolean().optional(),
      resetIso: z.string().nullable().optional(),
      fiveHour: z
        .object({
          usedPct: z.number().nullable().optional(),
          pctElapsed: z.number().optional(),
          resetIso: z.string().nullable().optional(),
          secsToReset: z.number().nullable().optional(),
          usedPctSource: z.string().nullable().optional(),
        })
        .partial()
        .optional(),
      weekly: z
        .object({
          usedPct: z.number().nullable().optional(),
          resetIso: z.string().nullable().optional(),
        })
        .partial()
        .nullable()
        .optional(),
    })
    .partial()
    .optional(),
  feed: z.array(z.object({ k: z.string(), v: z.string(), c: z.string().optional() })).default([]),
});

/** /status.json department keys → roster departments. */
const LIVE_DEPT_KEYS: Record<string, Department> = {
  orchestrator: 'orchestrator',
  engineering: 'engineering',
  infra: 'infra-ops',
  integrations: 'integrations',
  customer: 'customer',
  marketing: 'marketing-design',
  csuite: 'c-suite',
};

function coerceStatus(value: string): DepartmentStatus {
  return (DEPARTMENT_STATUSES as readonly string[]).includes(value)
    ? (value as DepartmentStatus)
    : 'idle';
}

/** Finite number → itself; null/undefined/NaN → null. */
function numOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Pure mapping from a raw /status.json body to HqData (unit-testable). */
export function mapStatusJson(raw: unknown, now: () => Date = () => new Date()): HqData {
  const parsed = StatusJsonSchema.parse(raw);

  const departments = {} as Record<Department, DepartmentStatus>;
  // Default every department, then overlay whatever the feed provides.
  for (const dept of Object.values(LIVE_DEPT_KEYS)) departments[dept] = 'idle';
  for (const [key, value] of Object.entries(parsed.departments)) {
    const dept = LIVE_DEPT_KEYS[key];
    if (dept) departments[dept] = coerceStatus(value);
  }

  const agentActivity: Record<string, AgentStatus> = {};
  for (const agent of ROSTER) {
    agentActivity[agent.id] = agentStatusFromDepartment(departments[agent.department]);
  }

  return {
    source: 'live',
    updatedAt: now().toISOString(),
    phases: parsed.phases,
    overallPct: overallPct(parsed.phases),
    departments,
    agentActivity,
    activityCounts: countActivity(agentActivity),
    usage: {
      capActive: parsed.usage?.capActive ?? false,
      // REAL quota consumed lives under fiveHour.usedPct (present only for real
      // captures); the older top-level shapes simply leave it null.
      fiveHourUsedPct: numOrNull(parsed.usage?.fiveHour?.usedPct),
      fiveHourPctElapsed: numOrNull(parsed.usage?.fiveHour?.pctElapsed),
      // Prefer the nested 5-hour reset; fall back to the generic top-level one.
      resetIso: parsed.usage?.fiveHour?.resetIso ?? parsed.usage?.resetIso ?? null,
      secsToReset: numOrNull(parsed.usage?.fiveHour?.secsToReset),
      weeklyUsedPct: numOrNull(parsed.usage?.weekly?.usedPct),
    },
    feed: parsed.feed,
  };
}

export type FetchLike = (url: string, init?: { cache?: RequestCache }) => Promise<Response>;

/**
 * Live provider: polls /status.json; on ANY failure it degrades to the mock
 * snapshot (source: 'mock-fallback') instead of rejecting — the dashboard
 * always renders.
 */
export class LiveStatusProvider implements DataProvider {
  readonly kind = 'live' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(data: HqData) => void>();

  constructor(
    private readonly url: string = STATUS_JSON_URL,
    private readonly fetchFn: FetchLike = (u, init) => fetch(u, init),
    private readonly pollMs = 30_000,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async snapshot(): Promise<HqData> {
    try {
      const res = await this.fetchFn(this.url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
      const body: unknown = await res.json();
      return mapStatusJson(body, this.now);
    } catch (err) {
      const fallback = buildMockSnapshot(this.now);
      return {
        ...fallback,
        source: 'mock-fallback',
        feed: [
          { k: 'Source', v: 'live unreachable — mock fallback', c: '#f87171' },
          { k: 'Error', v: String(err).slice(0, 80), c: '#f87171' },
          ...fallback.feed.filter((f) => f.k !== 'Source'),
        ],
      };
    }
  }

  subscribe(listener: (data: HqData) => void): () => void {
    this.listeners.add(listener);
    const push = () => {
      void this.snapshot().then((snap) => {
        for (const l of this.listeners) l(snap);
      });
    };
    push();
    this.timer ??= setInterval(push, this.pollMs);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.dispose();
    };
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }
}

/** ?data=live|mock (default live, graceful fallback). */
export function selectProvider(search: string): DataProvider {
  const mode = new URLSearchParams(search).get('data');
  if (mode === 'mock') return new MockDataProvider();
  return new LiveStatusProvider();
}
