/** Test/diagnostics handle exposed by the engine (read by Playwright). */
interface L3rainDebug {
  agentCount: number;
  labelCount: () => number;
  effectsAnimating: () => boolean;
  cameraView: () => { scale: number; x: number; y: number };
  agentHitPos: (id: string) => { x: number; y: number } | null;
  /** live foot position of an agent in world px (moves with the simulation) */
  agentPos: (id: string) => { x: number; y: number } | null;
  /** number of agents currently walking */
  walkingCount: () => number;
  /** send an agent on a stroll to a break room; returns false if capped/unknown */
  forceWander: (id: string) => boolean;
  fps: () => number;
  errors: string[];
}

interface Window {
  __l3rainDebug?: L3rainDebug;
}
