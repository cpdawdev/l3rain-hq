/** Test/diagnostics handle exposed by the engine (read by Playwright). */
interface L3rainDebug {
  agentCount: number;
  labelCount: () => number;
  errors: string[];
}

interface Window {
  __l3rainDebug?: L3rainDebug;
}
