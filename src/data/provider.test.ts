import { describe, expect, it } from 'vitest';
import { MockDataProvider, buildMockSnapshot } from './mockProvider';
import { LiveStatusProvider, mapStatusJson, selectProvider } from './liveProvider';
import { agentStatusFromDepartment, countActivity, overallPct } from './provider';
import { ROSTER } from './roster';

const FIXED_NOW = () => new Date('2026-07-16T12:00:00Z');

/** Real captured /status.json body (2026-07-17). */
const LIVE_FIXTURE = {
  phases: [
    { name: 'PHASE 0 · FOUNDATIONS', pct: 100 },
    { name: 'PHASE 1 · MVP + REAL PILOT', pct: 96 },
    { name: 'PHASE 2 · AUTO PROVISIONING', pct: 83 },
    { name: 'PHASE 3 · AGENT-RUN OPS', pct: 83 },
    { name: 'PHASE 4 · SCALE + OVERNIGHT', pct: 33 },
  ],
  departments: {
    orchestrator: 'working',
    engineering: 'working',
    infra: 'idle',
    integrations: 'idle',
    customer: 'working',
    marketing: 'idle',
    csuite: 'waiting',
  },
  usage: {
    capActive: false,
    capReason: null,
    resetIso: '2026-07-17T06:00:00Z',
    windowStartIso: '2026-07-17T01:00:00Z',
    fiveHour: { pctElapsed: 16, secsToReset: 15090, windowOpen: true },
    tokenPresent: true,
  },
  feed: [
    { k: 'Source', v: '/status live', c: '#4ade80' },
    { k: 'Updated', v: '2026-07-17T01:48Z', c: '#67e8f9' },
  ],
};

describe('helpers', () => {
  it('overallPct averages and clamps', () => {
    expect(overallPct([])).toBe(0);
    expect(
      overallPct([
        { name: 'a', pct: 100 },
        { name: 'b', pct: 50 },
      ]),
    ).toBe(75);
    expect(overallPct([{ name: 'a', pct: 150 }])).toBe(100);
  });

  it('maps department states to agent activity', () => {
    expect(agentStatusFromDepartment('working')).toBe('working');
    expect(agentStatusFromDepartment('waiting')).toBe('waiting');
    expect(agentStatusFromDepartment('opening')).toBe('waiting');
    expect(agentStatusFromDepartment('idle')).toBe('idle');
    expect(agentStatusFromDepartment('black-lit')).toBe('idle');
  });

  it('counts activity to 30 total', () => {
    const counts = countActivity(buildMockSnapshot(FIXED_NOW).agentActivity);
    expect(counts.working + counts.waiting + counts.idle).toBe(30);
  });
});

describe('MockDataProvider', () => {
  it('produces a full typed snapshot covering all agents and departments', async () => {
    const snap = await new MockDataProvider(FIXED_NOW).snapshot();
    expect(snap.source).toBe('mock');
    expect(snap.phases.length).toBeGreaterThan(0);
    expect(Object.keys(snap.agentActivity)).toHaveLength(30);
    expect(Object.keys(snap.departments)).toHaveLength(7);
    expect(snap.overallPct).toBeGreaterThan(0);
  });

  it('pushes an initial snapshot to subscribers and unsubscribes cleanly', () => {
    const provider = new MockDataProvider(FIXED_NOW);
    let pushes = 0;
    const off = provider.subscribe(() => {
      pushes += 1;
    });
    expect(pushes).toBe(1);
    off();
    provider.dispose();
  });
});

describe('LiveStatusProvider', () => {
  it('maps the captured /status.json fixture to HqData', () => {
    const snap = mapStatusJson(LIVE_FIXTURE, FIXED_NOW);
    expect(snap.source).toBe('live');
    expect(snap.phases).toHaveLength(5);
    expect(snap.overallPct).toBe(79); // (100+96+83+83+33)/5 = 79
    expect(snap.departments['infra-ops']).toBe('idle');
    expect(snap.departments['c-suite']).toBe('waiting');
    expect(snap.departments['marketing-design']).toBe('idle');
    expect(snap.usage?.fiveHourPctElapsed).toBe(16);
    // no real capture in this fixture → usedPct stays null (elapsed fallback)
    expect(snap.usage?.fiveHourUsedPct).toBeNull();
    expect(snap.usage?.secsToReset).toBe(15090);
    expect(snap.usage?.resetIso).toBe('2026-07-17T06:00:00Z');
    expect(snap.usage?.weeklyUsedPct).toBeNull();
    // engineering agents inherit 'working'
    for (const a of ROSTER.filter((r) => r.department === 'engineering')) {
      expect(snap.agentActivity[a.id]).toBe('working');
    }
  });

  it('maps REAL quota (fiveHour.usedPct) + nested resetIso + weekly when present', () => {
    const snap = mapStatusJson(
      {
        ...LIVE_FIXTURE,
        usage: {
          capActive: false,
          resetIso: '2026-07-18T99:99:99Z', // top-level ignored in favour of nested
          fiveHour: {
            usedPct: 27,
            pctElapsed: 68,
            resetIso: '2026-07-18T03:34:00Z',
            secsToReset: 5640,
            usedPctSource: 'real',
          },
          weekly: { usedPct: 41, resetIso: '2026-07-21T00:00:00Z' },
        },
      },
      FIXED_NOW,
    );
    expect(snap.usage?.fiveHourUsedPct).toBe(27);
    expect(snap.usage?.fiveHourPctElapsed).toBe(68);
    expect(snap.usage?.resetIso).toBe('2026-07-18T03:34:00Z'); // nested wins
    expect(snap.usage?.secsToReset).toBe(5640);
    expect(snap.usage?.weeklyUsedPct).toBe(41);
  });

  it('tolerates weekly = null (contract allows null | undefined)', () => {
    const snap = mapStatusJson(
      { ...LIVE_FIXTURE, usage: { ...LIVE_FIXTURE.usage, weekly: null } },
      FIXED_NOW,
    );
    expect(snap.usage?.weeklyUsedPct).toBeNull();
  });

  it('coerces unknown department states to idle and tolerates extra fields', () => {
    const snap = mapStatusJson({
      ...LIVE_FIXTURE,
      departments: { engineering: 'exploded', novel: 'working' },
      extra: { future: true },
    });
    expect(snap.departments.engineering).toBe('idle');
  });

  it('falls back to mock data when fetch fails (never rejects)', async () => {
    const provider = new LiveStatusProvider(
      'https://unreachable.invalid/status.json',
      () => Promise.reject(new Error('network down')),
      60_000,
      FIXED_NOW,
    );
    const snap = await provider.snapshot();
    expect(snap.source).toBe('mock-fallback');
    expect(snap.feed[0]?.v).toContain('mock fallback');
    expect(Object.keys(snap.agentActivity)).toHaveLength(30);
    provider.dispose();
  });

  it('falls back on non-OK responses', async () => {
    const provider = new LiveStatusProvider(
      'x',
      () => Promise.resolve(new Response('nope', { status: 503 })),
      60_000,
      FIXED_NOW,
    );
    const snap = await provider.snapshot();
    expect(snap.source).toBe('mock-fallback');
    provider.dispose();
  });

  it('serves live data through the same interface', async () => {
    const provider = new LiveStatusProvider(
      'x',
      () =>
        Promise.resolve(
          new Response(JSON.stringify(LIVE_FIXTURE), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      60_000,
      FIXED_NOW,
    );
    const snap = await provider.snapshot();
    expect(snap.source).toBe('live');
    expect(snap.overallPct).toBe(79);
    provider.dispose();
  });
});

describe('selectProvider (?data=live|mock)', () => {
  it('defaults to live', () => {
    const p = selectProvider('');
    expect(p.kind).toBe('live');
    p.dispose();
  });
  it('selects mock explicitly', () => {
    const p = selectProvider('?data=mock');
    expect(p.kind).toBe('mock');
    p.dispose();
  });
  it('falls back to live for unknown values', () => {
    const p = selectProvider('?data=banana');
    expect(p.kind).toBe('live');
    p.dispose();
  });
});
