import { useSyncExternalStore } from 'react';

export type LabelMode = 'all' | 'names' | 'selected';
export type LabelSize = 'small' | 'medium' | 'large';

export interface UiState {
  selectedAgentId: string | null;
  labelMode: LabelMode;
  labelSize: LabelSize;
  reducedMotion: boolean;
  paused: boolean;
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let state: UiState = {
  selectedAgentId: null,
  labelMode: 'all',
  labelSize: 'medium',
  reducedMotion: prefersReducedMotion,
  paused: false,
};

const listeners = new Set<() => void>();

/** Tiny external store bridging React HUD and the Pixi engine. */
export const uiStore = {
  get(): UiState {
    return state;
  },
  set(patch: Partial<UiState>): void {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useUiState(): UiState {
  return useSyncExternalStore(uiStore.subscribe, uiStore.get);
}

export const LABEL_SIZE_FACTOR: Record<LabelSize, number> = {
  small: 0.85,
  medium: 1,
  large: 1.25,
};
