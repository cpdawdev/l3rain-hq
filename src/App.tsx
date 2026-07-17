import { useEffect, useMemo, useState } from 'react';
import { loadManifest } from './manifest/loader';
import type { ManifestValidation } from './manifest/schema';
import { WorldCanvas } from './hud/WorldCanvas';
import { StationPicker } from './hud/StationPicker';
import { Inspector } from './hud/Inspector';
import { Controls } from './hud/Controls';
import { Hud } from './hud/Hud';
import { DiagnosticsPanel } from './hud/DiagnosticsPanel';
import type { HqEngine } from './engine/HqEngine';
import type { HqData } from './data/provider';
import { selectProvider } from './data/liveProvider';
import { uiStore, useUiState, LABEL_SIZE_FACTOR } from './state/store';

export function App() {
  const [validation, setValidation] = useState<ManifestValidation | null>(null);
  const [engine, setEngine] = useState<HqEngine | null>(null);
  const [data, setData] = useState<HqData | null>(null);
  const ui = useUiState();

  const devMode = useMemo(() => new URLSearchParams(window.location.search).get('dev') === '1', []);

  useEffect(() => {
    let alive = true;
    void loadManifest().then((v) => {
      if (alive) setValidation(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  // data provider (?data=live|mock, default live with mock fallback)
  useEffect(() => {
    const provider = selectProvider(window.location.search);
    const off = provider.subscribe(setData);
    return () => {
      off();
      provider.dispose();
    };
  }, []);

  // data → engine: department tint overlays + agent activity + simulation
  useEffect(() => {
    if (!engine || !data) return;
    engine.applyData(data.departments, data.agentActivity, data.usage?.capActive ?? false);
  }, [engine, data]);

  // engine → store: agent selection
  useEffect(() => {
    if (!engine) return;
    return engine.onAgentTap((id) => {
      uiStore.set({ selectedAgentId: id });
    });
  }, [engine]);

  // store → engine: selection highlight + label config
  useEffect(() => {
    engine?.setSelected(ui.selectedAgentId);
  }, [engine, ui.selectedAgentId]);

  useEffect(() => {
    if (!engine) return;
    engine.labels.setMode(ui.labelMode);
    engine.labels.setSizeFactor(LABEL_SIZE_FACTOR[ui.labelSize]);
  }, [engine, ui.labelMode, ui.labelSize]);

  // store → engine: motion preferences (ambient effects + living simulation)
  useEffect(() => {
    if (!engine) return;
    engine.effects.setReducedMotion(ui.reducedMotion);
    engine.effects.setPaused(ui.paused);
    engine.simulation.setReducedMotion(ui.reducedMotion);
    engine.simulation.setPaused(ui.paused);
  }, [engine, ui.reducedMotion, ui.paused]);

  const issues = [...(validation?.errors ?? []), ...(engine?.errors ?? [])];

  return (
    <div className="relative h-full w-full overflow-hidden bg-hq-bg">
      {validation === null ? (
        <div className="flex h-full items-center justify-center text-sm tracking-widest text-hq-text-dim">
          LOADING MANIFEST…
        </div>
      ) : (
        <WorldCanvas manifest={validation.manifest} onEngine={setEngine} />
      )}

      <header className="pointer-events-none absolute top-3 left-3 z-10 rounded-md border border-hq-border bg-hq-panel/85 px-3 py-1.5">
        <h1 className="text-xs font-semibold tracking-[0.3em] text-hq-cyan">L3RAIN HEADQUARTERS</h1>
      </header>

      {/* e2e beacon: present once the engine is mounted AND wired to React state */}
      {engine !== null && <div data-testid="engine-ready" className="hidden" />}

      <Controls />

      <Hud data={data} />

      {ui.selectedAgentId !== null && (
        <Inspector
          agentId={ui.selectedAgentId}
          visual={engine?.agents.get(ui.selectedAgentId)}
          activity={data?.agentActivity[ui.selectedAgentId]}
        />
      )}

      {devMode && engine !== null && validation !== null && (
        <StationPicker engine={engine} manifest={validation.manifest} />
      )}

      {devMode && <DiagnosticsPanel engine={engine} issues={issues} />}
    </div>
  );
}
