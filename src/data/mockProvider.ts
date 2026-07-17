import { ROSTER, type Department } from './roster';
import {
  agentStatusFromDepartment,
  countActivity,
  overallPct,
  type AgentStatus,
  type DataProvider,
  type DepartmentStatus,
  type HqData,
} from './provider';

/** Static, typed mock — mirrors the live /status.json shape and values. */
export const MOCK_DEPARTMENTS: Record<Department, DepartmentStatus> = {
  orchestrator: 'working',
  engineering: 'working',
  'infra-ops': 'idle',
  integrations: 'waiting',
  customer: 'working',
  'marketing-design': 'idle',
  'c-suite': 'black-lit',
};

export const MOCK_PHASES = [
  { name: 'PHASE 0 · FOUNDATIONS', pct: 100 },
  { name: 'PHASE 1 · MVP + REAL PILOT', pct: 96 },
  { name: 'PHASE 2 · AUTO PROVISIONING', pct: 83 },
  { name: 'PHASE 3 · AGENT-RUN OPS', pct: 83 },
  { name: 'PHASE 4 · SCALE + OVERNIGHT', pct: 33 },
];

export function buildMockSnapshot(now: () => Date = () => new Date()): HqData {
  const agentActivity: Record<string, AgentStatus> = {};
  for (const agent of ROSTER) {
    agentActivity[agent.id] = agentStatusFromDepartment(MOCK_DEPARTMENTS[agent.department]);
  }
  const phases = MOCK_PHASES.map((p) => ({ ...p }));
  return {
    source: 'mock',
    updatedAt: now().toISOString(),
    phases,
    overallPct: overallPct(phases),
    departments: { ...MOCK_DEPARTMENTS },
    agentActivity,
    activityCounts: countActivity(agentActivity),
    usage: { capActive: false, fiveHourPctElapsed: 42, resetIso: null },
    feed: [
      { k: 'Source', v: 'mock data', c: '#facc15' },
      { k: 'Phases', v: `${String(MOCK_PHASES.length)} tracked`, c: '#67e8f9' },
      { k: 'Agents', v: `${String(ROSTER.length)} on roster`, c: '#67e8f9' },
      { k: 'Mode', v: 'V2 asset renderer', c: '#4ade80' },
    ],
  };
}

export class MockDataProvider implements DataProvider {
  readonly kind = 'mock' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(data: HqData) => void>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly refreshMs = 30_000,
  ) {}

  snapshot(): Promise<HqData> {
    return Promise.resolve(buildMockSnapshot(this.now));
  }

  subscribe(listener: (data: HqData) => void): () => void {
    this.listeners.add(listener);
    listener(buildMockSnapshot(this.now));
    this.timer ??= setInterval(() => {
      const snap = buildMockSnapshot(this.now);
      for (const l of this.listeners) l(snap);
    }, this.refreshMs);
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
