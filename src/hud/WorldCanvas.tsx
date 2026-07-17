import { useEffect, useRef } from 'react';
import type { Manifest } from '../manifest/schema';
import { HqEngine } from '../engine/HqEngine';

interface WorldCanvasProps {
  manifest: Manifest;
  onEngine?: (engine: HqEngine | null) => void;
}

/**
 * Mounts the Pixi engine into a full-size div. React owns nothing inside the
 * canvas; the engine is created once per manifest and destroyed on unmount.
 */
export function WorldCanvas({ manifest, onEngine }: WorldCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: HqEngine | null = null;
    let cancelled = false;

    void HqEngine.create(host, manifest)
      .then((created) => {
        if (cancelled) {
          created.destroy();
          return;
        }
        engine = created;
        onEngine?.(created);
      })
      .catch((err: unknown) => {
        console.error('engine create failed:', err);
      });

    return () => {
      cancelled = true;
      onEngine?.(null);
      engine?.destroy();
      engine = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engine lifecycle is tied to the manifest only
  }, [manifest]);

  return <div ref={hostRef} className="absolute inset-0" data-testid="world-canvas" />;
}
