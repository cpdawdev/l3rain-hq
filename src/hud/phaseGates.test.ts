import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Department } from '../data/roster';
import { DEPARTMENTS } from '../data/roster';
import type { DepartmentStatus, HqData } from '../data/provider';
import { PhaseBars } from './Hud';
import { GATE_CHIP, PHASE_GATES, gateForIndex } from './phaseGates';

// Minimal, fully-typed HqData with the 5 live-shaped phases (plateau pcts).
function makeData(): HqData {
  const departments = Object.fromEntries(DEPARTMENTS.map((d) => [d, 'working'] as const)) as Record<
    Department,
    DepartmentStatus
  >;
  return {
    source: 'mock',
    updatedAt: new Date(0).toISOString(),
    phases: [
      { name: 'Phase 0 · Foundations', pct: 100 },
      { name: 'Phase 1 · MVP + Real Pilot', pct: 96 },
      { name: 'Phase 2 · Auto Provisioning', pct: 83 },
      { name: 'Phase 3 · Agent-Run Ops', pct: 83 },
      { name: 'Phase 4 · Scale + Overnight', pct: 33 },
    ],
    overallPct: 79,
    departments,
    agentActivity: {},
    activityCounts: { working: 0, waiting: 0, idle: 0 },
    usage: null,
    feed: [],
  };
}

// Pull each rendered chip's index → { owner, label } out of the static markup.
// Attribute order inside the tag is not assumed.
function renderedChips(html: string): Record<number, { owner: string; label: string }> {
  const spanRe = /<span\b([^>]*\bdata-testid="phase-chip-\d+"[^>]*)>([^<]*)<\/span>/g;
  const out: Record<number, { owner: string; label: string }> = {};
  let m: RegExpExecArray | null;
  while ((m = spanRe.exec(html)) !== null) {
    const attrs = m[1] ?? '';
    const idx = /data-testid="phase-chip-(\d+)"/.exec(attrs)?.[1];
    const owner = /data-owner="(joseph|agents)"/.exec(attrs)?.[1];
    if (idx !== undefined && owner !== undefined) {
      out[Number(idx)] = { owner, label: m[2] ?? '' };
    }
  }
  return out;
}

describe('phaseGates map', () => {
  it('owns phases 0-2 as Joseph and 3-4 as agents', () => {
    expect(PHASE_GATES.map((g) => g.owner)).toEqual([
      'joseph',
      'joseph',
      'joseph',
      'agents',
      'agents',
    ]);
    expect(gateForIndex(0)?.owner).toBe('joseph');
    expect(gateForIndex(4)?.owner).toBe('agents');
    expect(gateForIndex(5)).toBeNull();
  });
});

describe('PhaseBars renders honest owner chips', () => {
  const html = renderToStaticMarkup(createElement(PhaseBars, { data: makeData() }));
  const chips = renderedChips(html);

  it('renders a JOSEPH ("⏳ YOUR MOVE") chip on phases 0, 1, 2', () => {
    for (const i of [0, 1, 2]) {
      expect(chips[i], `phase ${String(i)} chip`).toBeDefined();
      expect(chips[i]?.owner).toBe('joseph');
      expect(chips[i]?.label).toBe(GATE_CHIP.joseph.label);
    }
  });

  it('renders an AGENTS ("🔧 agents") chip on phases 3, 4', () => {
    for (const i of [3, 4]) {
      expect(chips[i], `phase ${String(i)} chip`).toBeDefined();
      expect(chips[i]?.owner).toBe('agents');
      expect(chips[i]?.label).toBe(GATE_CHIP.agents.label);
    }
  });

  it('shows the honest one-line summary under the bars', () => {
    expect(html).toContain('data-testid="hud-phase-summary"');
    expect(html).toContain('the big bars now wait on you');
  });
});
