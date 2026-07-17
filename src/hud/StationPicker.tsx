import { useEffect, useState } from 'react';
import type { HqEngine } from '../engine/HqEngine';
import type { Manifest } from '../manifest/schema';
import { ROSTER } from '../data/roster';

interface StationPickerProps {
  engine: HqEngine;
  manifest: Manifest;
}

/**
 * Dev mode (?dev=1): click the backdrop to read world pixel coordinates.
 * With an agent selected, a click re-stations that agent live, and "Save"
 * writes the updated manifest back to assets/manifest.json through the
 * dev-server middleware. This is how stations are actually placed.
 */
export function StationPicker({ engine, manifest }: StationPickerProps) {
  const [agentId, setAgentId] = useState<string>('');
  const [lastClick, setLastClick] = useState<{ x: number; y: number } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    return engine.onWorldClick((x, y) => {
      const p = { x: Math.round(x), y: Math.round(y) };
      setLastClick(p);
      console.info(`[station-picker] world: { "x": ${String(p.x)}, "y": ${String(p.y)} }`);
      void navigator.clipboard
        ?.writeText(`{ "x": ${String(p.x)}, "y": ${String(p.y)} }`)
        .catch(() => {});
      if (agentId) engine.moveAgent(agentId, p.x, p.y);
    });
  }, [engine, agentId]);

  const save = async () => {
    setSaveState('saving');
    try {
      const res = await fetch('/__station-picker/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(manifest, null, 2),
      });
      setSaveState(res.ok ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  };

  return (
    <aside
      className="absolute top-3 right-3 z-20 w-64 rounded-md border border-hq-border bg-hq-panel/95 p-3 text-xs"
      data-testid="station-picker"
    >
      <h2 className="mb-2 font-semibold tracking-widest text-hq-cyan">STATION PICKER · DEV</h2>
      <label className="mb-1 block text-hq-text-dim" htmlFor="sp-agent">
        Assign clicks to agent
      </label>
      <select
        id="sp-agent"
        className="mb-2 w-full rounded border border-hq-border bg-hq-panel-2 px-1 py-1"
        value={agentId}
        onChange={(e) => {
          setAgentId(e.target.value);
        }}
      >
        <option value="">— log/copy only —</option>
        {ROSTER.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.role})
          </option>
        ))}
      </select>
      <p className="mb-2 text-hq-text-dim">
        Last click:{' '}
        <span className="text-hq-text">
          {lastClick ? `${String(lastClick.x)}, ${String(lastClick.y)}` : '—'}
        </span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded border border-hq-border bg-hq-panel-2 px-2 py-1 hover:border-hq-cyan"
          onClick={() => {
            void save();
          }}
        >
          Save manifest
        </button>
        <span
          className={
            saveState === 'saved'
              ? 'text-hq-green'
              : saveState === 'error'
                ? 'text-hq-red'
                : 'text-hq-text-dim'
          }
        >
          {saveState === 'idle' ? '' : saveState}
        </span>
      </div>
    </aside>
  );
}
