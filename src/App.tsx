import { useEffect, useState } from 'react';
import { loadManifest } from './manifest/loader';
import type { ManifestValidation } from './manifest/schema';
import { WorldCanvas } from './hud/WorldCanvas';
import type { HqEngine } from './engine/HqEngine';

export function App() {
  const [validation, setValidation] = useState<ManifestValidation | null>(null);
  const [, setEngine] = useState<HqEngine | null>(null);

  useEffect(() => {
    let alive = true;
    void loadManifest().then((v) => {
      if (alive) setValidation(v);
    });
    return () => {
      alive = false;
    };
  }, []);

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

      {validation !== null && validation.errors.length > 0 && (
        <div
          className="absolute right-3 bottom-3 z-10 max-h-40 w-96 overflow-auto rounded-md border border-hq-border bg-hq-panel/90 p-2 text-[11px] text-hq-amber"
          data-testid="manifest-issues"
        >
          <p className="mb-1 font-semibold tracking-widest text-hq-text-dim">
            MANIFEST DIAGNOSTICS ({validation.errors.length})
          </p>
          <ul className="space-y-0.5">
            {validation.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
