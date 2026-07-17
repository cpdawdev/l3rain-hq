/** Test/diagnostics handle exposed by the engine (read by Playwright). */
interface L3rainDebug {
  agentCount: number;
  labelCount: () => number;
  effectsAnimating: () => boolean;
  errors: string[];
}

interface Window {
  __l3rainDebug?: L3rainDebug;
}
