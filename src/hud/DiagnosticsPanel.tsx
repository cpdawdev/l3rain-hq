import { useEffect, useState } from 'react';
import type { HqEngine } from '../engine/HqEngine';

interface DiagnosticsPanelProps {
  engine: HqEngine | null;
  issues: string[];
}

/**
 * Dev diagnostics (?dev=1): FPS, manifest/engine issues (never silent),
 * sprite-bounds + depth-value overlay toggle.
 */
export function DiagnosticsPanel({ engine, issues }: DiagnosticsPanelProps) {
  const [fps, setFps] = useState(0);
  const [bounds, setBounds] = useState(false);

  useEffect(() => {
    if (!engine) return;
    const timer = setInterval(() => {
      setFps(Math.round(engine.app.ticker.FPS));
    }, 500);
    return () => {
      clearInterval(timer);
    };
  }, [engine]);

  useEffect(() => {
    engine?.diagnostics.setEnabled(bounds);
  }, [engine, bounds]);

  return (
    <div
      className="absolute right-3 bottom-3 z-10 w-96 rounded-md border border-hq-border bg-hq-panel/90 p-2 text-[11px]"
      data-testid="diagnostics-panel"
    >
      <div className="mb-1 flex items-center justify-between">
        <p className="font-semibold tracking-widest text-hq-text-dim">DIAGNOSTICS</p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-hq-text-dim">
            <input
              type="checkbox"
              checked={bounds}
              onChange={(e) => {
                setBounds(e.target.checked);
              }}
            />
            bounds+depth
          </label>
          <span className="font-mono text-hq-cyan" data-testid="fps">
            {fps} fps
          </span>
        </div>
      </div>
      {issues.length > 0 ? (
        <ul
          className="max-h-32 space-y-0.5 overflow-auto text-hq-amber"
          data-testid="manifest-issues"
        >
          {issues.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : (
        <p className="text-hq-green">manifest + engine clean · no issues</p>
      )}
    </div>
  );
}
