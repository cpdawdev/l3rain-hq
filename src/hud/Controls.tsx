import { uiStore, useUiState, type LabelMode, type LabelSize } from '../state/store';

const MODES: { value: LabelMode; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'names', label: 'Names' },
  { value: 'selected', label: 'Selected' },
];

const SIZES: { value: LabelSize; label: string }[] = [
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
];

function GroupButton({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string | undefined;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={`px-2 py-0.5 text-[11px] transition-colors ${
        active ? 'bg-hq-cyan-dim text-hq-cyan' : 'text-hq-text-dim hover:text-hq-text'
      }`}
    >
      {children}
    </button>
  );
}

/** Bottom-left view controls: label mode/size, motion, pause. React-only UI. */
export function Controls() {
  const ui = useUiState();
  return (
    <div
      className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-hq-border bg-hq-panel/90 px-2.5 py-1.5"
      data-testid="controls"
    >
      <div className="flex items-center gap-1">
        <span className="text-[10px] tracking-widest text-hq-text-dim">LABELS</span>
        <div className="flex overflow-hidden rounded border border-hq-border">
          {MODES.map((m) => (
            <GroupButton
              key={m.value}
              testId={`label-mode-${m.value}`}
              active={ui.labelMode === m.value}
              onClick={() => {
                uiStore.set({ labelMode: m.value });
              }}
            >
              {m.label}
            </GroupButton>
          ))}
        </div>
        <div className="flex overflow-hidden rounded border border-hq-border">
          {SIZES.map((s) => (
            <GroupButton
              key={s.value}
              testId={`label-size-${s.value}`}
              active={ui.labelSize === s.value}
              onClick={() => {
                uiStore.set({ labelSize: s.value });
              }}
            >
              {s.label}
            </GroupButton>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <GroupButton
          testId="toggle-motion"
          active={ui.reducedMotion}
          onClick={() => {
            uiStore.set({ reducedMotion: !ui.reducedMotion });
          }}
        >
          Reduced motion
        </GroupButton>
        <GroupButton
          testId="toggle-pause"
          active={ui.paused}
          onClick={() => {
            uiStore.set({ paused: !ui.paused });
          }}
        >
          {ui.paused ? 'Resume' : 'Pause'}
        </GroupButton>
      </div>
    </div>
  );
}
