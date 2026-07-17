import { ManifestSchema, emptyManifest, type Manifest, type ManifestValidation } from './schema';
import { ROSTER } from '../data/roster';

/**
 * Loads and validates assets/manifest.json (served at ./manifest.json).
 * Validation problems never crash the app and are never silent: they are
 * returned for the diagnostics panel and the engine falls back to
 * placeholders for anything missing or malformed.
 */
export async function loadManifest(url = './manifest.json'): Promise<ManifestValidation> {
  const errors: string[] = [];
  let raw: unknown;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      errors.push(`manifest fetch failed: HTTP ${String(res.status)} for ${url}`);
      return { manifest: emptyManifest(), errors };
    }
    raw = await res.json();
  } catch (err) {
    errors.push(`manifest fetch/parse failed: ${String(err)}`);
    return { manifest: emptyManifest(), errors };
  }
  return validateManifest(raw);
}

/** Pure validation step (unit-testable without fetch). */
export function validateManifest(raw: unknown): ManifestValidation {
  const errors: string[] = [];
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`manifest: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
    return { manifest: emptyManifest(), errors };
  }
  const manifest = parsed.data;
  errors.push(...crossCheckRoster(manifest));
  return { manifest, errors };
}

/** Roster cross-checks: unknown ids, duplicate render instances, missing agents. */
export function crossCheckRoster(manifest: Manifest): string[] {
  const errors: string[] = [];
  const rosterIds = new Set(ROSTER.map((a) => a.id));
  const seen = new Set<string>();
  for (const agent of manifest.agents) {
    if (!rosterIds.has(agent.id)) {
      errors.push(`manifest: agent "${agent.id}" is not in the roster`);
    }
    if (seen.has(agent.id)) {
      errors.push(`manifest: duplicate render instance for agent "${agent.id}"`);
    }
    seen.add(agent.id);
  }
  for (const id of rosterIds) {
    if (!seen.has(id)) {
      errors.push(
        `manifest: roster agent "${id}" has no manifest entry (will render as placeholder)`,
      );
    }
  }
  return errors;
}
