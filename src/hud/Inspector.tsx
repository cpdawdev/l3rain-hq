import { agentById, DEPARTMENT_COLORS, DEPARTMENT_LABELS } from '../data/roster';
import type { AgentVisual } from '../engine/agents';
import type { AgentStatus } from '../data/provider';
import { uiStore } from '../state/store';

interface InspectorProps {
  agentId: string;
  visual: AgentVisual | undefined;
  /** live/mock activity for this agent, when the data provider has resolved */
  activity?: AgentStatus | undefined;
}

const ART_STATUS_LABEL: Record<string, string> = {
  'production-sprite': 'production art',
  'portrait-token': 'interim portrait token',
  'placeholder-sprite': 'placeholder (dimmed sprite)',
  'placeholder-silhouette': 'placeholder (silhouette)',
};

/** Right-hand inspector panel for the selected agent. React-only UI (no Pixi). */
export function Inspector({ agentId, visual, activity }: InspectorProps) {
  const agent = agentById(agentId);
  if (!agent) return null;
  const accent = DEPARTMENT_COLORS[agent.department];

  return (
    <aside
      className="absolute top-14 right-3 z-10 w-72 rounded-lg border border-hq-border bg-hq-panel/95 p-4 shadow-xl backdrop-blur"
      data-testid="inspector"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {visual && visual.entry.sprite.includes('characters-portraits') ? (
            <img
              src={`./${visual.entry.sprite}`}
              alt=""
              className="h-14 w-14 rounded-full border-2 bg-hq-panel-2 object-cover"
              style={{ borderColor: accent }}
            />
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full border-2 bg-hq-panel-2 text-lg font-bold text-hq-text-dim"
              style={{ borderColor: accent }}
            >
              {agent.name.charAt(0)}
            </div>
          )}
          <div>
            <h2 className="text-sm font-bold text-hq-text" data-testid="inspector-name">
              {agent.name}
            </h2>
            <p className="text-xs text-hq-cyan">{agent.role}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close inspector"
          className="rounded px-1.5 py-0.5 text-hq-text-dim hover:bg-hq-panel-2 hover:text-hq-text"
          onClick={() => {
            uiStore.set({ selectedAgentId: null });
          }}
        >
          ×
        </button>
      </div>

      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <dt className="text-hq-text-dim">Department</dt>
          <dd className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: accent }}
            />
            {DEPARTMENT_LABELS[agent.department]}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-hq-text-dim">Agent</dt>
          <dd className="font-mono">agent-cpd-{agent.cpdRole}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-hq-text-dim">Activity</dt>
          <dd
            className={
              activity === 'working'
                ? 'text-hq-green'
                : activity === 'waiting'
                  ? 'text-hq-amber'
                  : 'text-hq-text-dim'
            }
          >
            {activity ?? '—'}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-hq-text-dim">Art status</dt>
          <dd className="text-hq-amber">
            {visual ? (ART_STATUS_LABEL[visual.path] ?? visual.path) : 'not rendered'}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
