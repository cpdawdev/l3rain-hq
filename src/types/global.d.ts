/** Test/diagnostics handle exposed by the engine (read by Playwright). */
interface L3rainDebug {
  agentCount: number;
  labelCount: () => number;
  effectsAnimating: () => boolean;
  cameraView: () => { scale: number; x: number; y: number };
  agentHitPos: (id: string) => { x: number; y: number } | null;
  fps: () => number;
  errors: string[];
}

interface Window {
  __l3rainDebug?: L3rainDebug;
}
