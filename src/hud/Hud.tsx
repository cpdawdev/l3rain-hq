import type { HqData, DepartmentStatus } from '../data/provider';
import { DEPARTMENTS, DEPARTMENT_LABELS } from '../data/roster';
import { uiStore, useUiState } from '../state/store';

const STATUS_DOT: Record<DepartmentStatus, string> = {
  working: '#4ade80',
  waiting: '#facc15',
  idle: '#64748b',
  opening: '#67e8f9',
  'black-lit': '#7c3aed',
};

function Panel({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string | undefined;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-lg border border-hq-border bg-hq-panel/88 p-3 backdrop-blur"
    >
      <h2 className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-hq-text-dim">{title}</h2>
      {children}
    </section>
  );
}

function PhaseBars({ data }: { data: HqData }) {
  return (
    <Panel title="PHASES" testId="hud-phases">
      <ul className="space-y-2">
        {data.phases.map((p) => (
          <li key={p.name}>
            <div className="mb-0.5 flex justify-between text-[10px]">
              <span className="text-hq-text">{p.name}</span>
              <span className="text-hq-cyan">{p.pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-hq-panel-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${String(Math.max(0, Math.min(100, p.pct)))}%`,
                  background: 'linear-gradient(90deg,#22d3ee,#3b82f6)',
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function CompletionRing({ data }: { data: HqData }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const filled = (data.overallPct / 100) * c;
  return (
    <Panel title="OVERALL COMPLETION" testId="hud-completion">
      <div className="flex items-center justify-center">
        <svg
          width="110"
          height="110"
          viewBox="0 0 110 110"
          role="img"
          aria-label={`Overall completion ${String(data.overallPct)} percent`}
        >
          <circle cx="55" cy="55" r={r} fill="none" stroke="#0e1730" strokeWidth="9" />
          <circle
            cx="55"
            cy="55"
            r={r}
            fill="none"
            stroke="url(#ringGrad)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${String(filled)} ${String(c - filled)}`}
            transform="rotate(-90 55 55)"
          />
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
          <text
            x="55"
            y="60"
            textAnchor="middle"
            fill="#67e8f9"
            fontSize="22"
            fontWeight="700"
            fontFamily="ui-sans-serif, system-ui"
          >
            {data.overallPct}%
          </text>
        </svg>
      </div>
    </Panel>
  );
}

function DepartmentList({ data }: { data: HqData }) {
  return (
    <Panel title="DEPARTMENTS" testId="hud-departments">
      <ul className="space-y-1.5">
        {DEPARTMENTS.map((d) => {
          const status = data.departments[d];
          return (
            <li key={d} className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-2 text-hq-text">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: STATUS_DOT[status],
                    boxShadow: status === 'working' ? `0 0 6px ${STATUS_DOT[status]}` : 'none',
                  }}
                />
                {DEPARTMENT_LABELS[d]}
              </span>
              <span className="text-hq-text-dim">{status}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ActivityCounts({ data }: { data: HqData }) {
  const { working, waiting, idle } = data.activityCounts;
  const cell = (label: string, value: number, cls: string) => (
    <div className="flex-1 rounded bg-hq-panel-2 px-2 py-1.5 text-center">
      <div className={`text-base font-bold ${cls}`}>{value}</div>
      <div className="text-[9px] tracking-widest text-hq-text-dim">{label}</div>
    </div>
  );
  return (
    <Panel title="EMPLOYEES" testId="hud-activity">
      <div className="flex gap-2">
        {cell('WORKING', working, 'text-hq-green')}
        {cell('WAITING', waiting, 'text-hq-amber')}
        {cell('IDLE', idle, 'text-hq-text-dim')}
      </div>
    </Panel>
  );
}

function UsageStrip({ data }: { data: HqData }) {
  if (!data.usage || data.usage.fiveHourPctElapsed === null) return null;
  const pct = Math.max(0, Math.min(100, data.usage.fiveHourPctElapsed));
  return (
    <Panel title="5-HOUR USAGE WINDOW" testId="hud-usage">
      <div className="h-1.5 overflow-hidden rounded-full bg-hq-panel-2">
        <div
          className="h-full rounded-full"
          style={{
            width: `${String(pct)}%`,
            background: data.usage.capActive ? '#f87171' : 'linear-gradient(90deg,#22d3ee,#3b82f6)',
          }}
        />
      </div>
      <p className="mt-1 text-[10px] text-hq-text-dim">
        {pct}% elapsed{data.usage.capActive ? ' · CAP ACTIVE' : ''}
      </p>
    </Panel>
  );
}

function FeedPanel({ data }: { data: HqData }) {
  return (
    <Panel title="LIVE DATA FEED" testId="hud-feed">
      <ul className="space-y-1">
        {data.feed.map((f, i) => (
          <li key={`${f.k}-${String(i)}`} className="flex justify-between text-[10px]">
            <span className="text-hq-text-dim">{f.k}</span>
            <span style={{ color: f.c ?? '#cbd5e1' }}>{f.v}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-hq-border pt-1.5 text-[9px] text-hq-text-dim">
        source: <span data-testid="data-source">{data.source}</span> ·{' '}
        {new Date(data.updatedAt).toLocaleTimeString()}
      </p>
    </Panel>
  );
}

function Panels({ data }: { data: HqData | null }) {
  if (data === null) {
    return (
      <div className="rounded-lg border border-hq-border bg-hq-panel/88 p-3 text-[11px] text-hq-text-dim">
        connecting data…
      </div>
    );
  }
  return (
    <>
      <PhaseBars data={data} />
      <CompletionRing data={data} />
      <DepartmentList data={data} />
      <ActivityCounts data={data} />
      <UsageStrip data={data} />
      <FeedPanel data={data} />
    </>
  );
}

/**
 * HUD — pure React, fed by the DataProvider snapshot.
 * ≥768px (md): fixed left rail. <768px: the rail collapses entirely so the
 * world gets the full screen; a STATUS button opens the same panels as a
 * dismissible overlay drawer.
 */
export function Hud({ data }: { data: HqData | null }) {
  const ui = useUiState();
  return (
    <>
      {/* desktop rail */}
      <div
        className="absolute top-12 bottom-14 left-3 z-10 hidden w-64 flex-col gap-2 overflow-y-auto pr-1 md:flex"
        data-testid="hud"
      >
        <Panels data={data} />
      </div>

      {/* mobile: toggle button + overlay drawer */}
      <button
        type="button"
        data-testid="hud-toggle"
        aria-label="Toggle status panel"
        aria-expanded={ui.hudOpen}
        className="absolute top-3 right-3 z-30 rounded-md border border-hq-border bg-hq-panel/90 px-3 py-1.5 text-[11px] font-semibold tracking-widest text-hq-cyan md:hidden"
        onClick={() => {
          uiStore.set({ hudOpen: !ui.hudOpen });
        }}
      >
        {ui.hudOpen ? 'CLOSE' : 'STATUS'}
      </button>
      {ui.hudOpen && (
        <div
          className="absolute inset-y-0 left-0 z-20 flex w-[85vw] max-w-xs flex-col gap-2 overflow-y-auto border-r border-hq-border bg-hq-bg/95 p-3 pt-14 backdrop-blur md:hidden"
          data-testid="hud-drawer"
        >
          <Panels data={data} />
        </div>
      )}
    </>
  );
}
