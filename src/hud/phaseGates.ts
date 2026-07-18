/**
 * Authoritative, honest annotation of WHO each phase's remaining work waits on.
 *
 * Keyed by phase INDEX 0..4 — the gates are stable, so this stays correct
 * regardless of the names/percentages the /status.json wire delivers. This is
 * why a plateaued bar reads as "gated" (waiting on a specific act), not "stuck".
 *
 *   owner 'joseph' — a tier-3, real-world act only Joseph can trigger.
 *   owner 'agents' — engineering depth the agents keep building autonomously.
 */
export type PhaseOwner = 'joseph' | 'agents';

export interface PhaseGate {
  owner: PhaseOwner;
  /** The specific act the remaining % / gate waits on. */
  act: string;
}

export const PHASE_GATES: readonly PhaseGate[] = [
  { owner: 'joseph', act: 'Run the first production deploy' },
  { owner: 'joseph', act: 'Onboard the first real pilot farm' },
  {
    owner: 'joseph',
    act: 'Enable paid Cloudflare features (Cloudflare-for-SaaS / Workers-for-Platforms)',
  },
  { owner: 'agents', act: 'Agents building depth (+ real ESP / gateway when you activate them)' },
  { owner: 'agents', act: 'Agents building scale + hardening depth' },
];

export interface GateChip {
  owner: PhaseOwner;
  label: string;
}

export const GATE_CHIP: Record<PhaseOwner, GateChip> = {
  joseph: { owner: 'joseph', label: '⏳ YOUR MOVE' },
  agents: { owner: 'agents', label: '🔧 agents' },
};

/** The gate for a phase index, or null when the index has no mapped gate. */
export function gateForIndex(index: number): PhaseGate | null {
  return PHASE_GATES[index] ?? null;
}

/** One honest, calm line summarising the picture, shown under the phase bars. */
export const PHASE_GATE_SUMMARY =
  'Buildable width: shipped ✅ — the big bars now wait on you: prod deploy · real pilot · paid features.';
