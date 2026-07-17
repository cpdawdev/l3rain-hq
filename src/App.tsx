import { useEffect, useState } from 'react';
import { loadManifest } from './manifest/loader';
import type { ManifestValidation } from './manifest/schema';
import { ROSTER } from './data/roster';

/**
 * Milestone 1 shell: boots, loads + validates the manifest, reports status.
 * The Pixi world stage mounts here from Milestone 2.
 */
export function App() {
  const [validation, setValidation] = useState<ManifestValidation | null>(null);

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
    <div className="flex h-full items-center justify-center">
      <div className="max-w-xl rounded-lg border border-hq-border bg-hq-panel p-6">
        <h1 className="text-lg font-semibold tracking-widest text-hq-cyan">
          L3RAIN HEADQUARTERS · V2
        </h1>
        <p className="mt-2 text-sm text-hq-text-dim">
          Milestone 1 boot shell — world renderer arrives in Milestone 2.
        </p>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between gap-8">
            <dt className="text-hq-text-dim">Roster</dt>
            <dd>{ROSTER.length} agents</dd>
          </div>
          <div className="flex justify-between gap-8">
            <dt className="text-hq-text-dim">Manifest</dt>
            <dd>
              {validation === null
                ? 'loading…'
                : `${String(validation.manifest.agents.length)} agents · ${String(validation.errors.length)} issue(s)`}
            </dd>
          </div>
        </dl>
        {validation !== null && validation.errors.length > 0 && (
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-xs text-hq-amber">
            {validation.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
