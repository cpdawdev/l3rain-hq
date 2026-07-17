import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ManifestSchema, emptyManifest } from './schema';
import { crossCheckRoster, validateManifest } from './loader';
import { ROSTER } from '../data/roster';

const validAgent = {
  id: 'sung-jin-woo',
  sprite: 'characters/sung-jin-woo_idle_se.png',
  anchor: 'bottom-center',
  scale: 1.0,
  mirrorSafe: true,
  flip: false,
  station: { x: 1920, y: 1080 },
  status: 'production',
};

describe('manifest schema', () => {
  it('accepts the spec example shape', () => {
    const result = ManifestSchema.safeParse({
      worldSpriteScale: 0.34,
      backdrop: { base: 'building/base_plate.png', width: 3840, height: 2160 },
      occluders: [{ file: 'building/occluder_boardroom_table.png', depthY: 1712 }],
      agents: [validAgent],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a null backdrop (checker placeholder mode)', () => {
    const result = ManifestSchema.safeParse({
      worldSpriteScale: 1,
      backdrop: null,
      agents: [],
    });
    expect(result.success).toBe(true);
  });

  it('defaults status to placeholder and spriteKind to full-body', () => {
    const parsed = ManifestSchema.parse({
      worldSpriteScale: 1,
      backdrop: null,
      agents: [{ id: 'levi', sprite: 'x.png', station: { x: 0, y: 0 } }],
    });
    expect(parsed.agents[0]?.status).toBe('placeholder');
    expect(parsed.agents[0]?.spriteKind).toBe('full-body');
    expect(parsed.agents[0]?.scale).toBe(1);
    expect(parsed.agents[0]?.mirrorSafe).toBe(true);
  });

  it('rejects a missing station', () => {
    const result = ManifestSchema.safeParse({
      worldSpriteScale: 1,
      backdrop: null,
      agents: [{ id: 'levi', sprite: 'x.png' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive worldSpriteScale', () => {
    const result = ManifestSchema.safeParse({ worldSpriteScale: 0, backdrop: null, agents: [] });
    expect(result.success).toBe(false);
  });
});

describe('validateManifest', () => {
  it('returns readable errors and an empty manifest on schema failure', () => {
    const { manifest, errors } = validateManifest({ nope: true });
    expect(errors.length).toBeGreaterThan(0);
    expect(manifest).toEqual(emptyManifest());
  });

  it('flags duplicate render instances', () => {
    const { errors } = validateManifest({
      worldSpriteScale: 1,
      backdrop: null,
      agents: [validAgent, validAgent],
    });
    expect(errors.some((e) => e.includes('duplicate render instance'))).toBe(true);
  });

  it('flags ids that are not on the roster', () => {
    const { errors } = validateManifest({
      worldSpriteScale: 1,
      backdrop: null,
      agents: [{ ...validAgent, id: 'not-a-real-agent' }],
    });
    expect(errors.some((e) => e.includes('not in the roster'))).toBe(true);
  });

  it('flags roster agents missing from the manifest', () => {
    const manifest = ManifestSchema.parse({ worldSpriteScale: 1, backdrop: null, agents: [] });
    const errors = crossCheckRoster(manifest);
    expect(errors).toHaveLength(30);
  });
});

describe('committed assets/manifest.json', () => {
  const committed: unknown = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../assets/manifest.json'), 'utf-8'),
  );

  it('is valid and covers all 30 roster agents exactly once', () => {
    const { manifest, errors } = validateManifest(committed);
    expect(errors).toEqual([]);
    expect(manifest.agents).toHaveLength(30);
    expect(new Set(manifest.agents.map((a) => a.id)).size).toBe(30);
    const rosterIds = new Set(ROSTER.map((a) => a.id));
    for (const agent of manifest.agents) expect(rosterIds.has(agent.id)).toBe(true);
  });

  it('references only sprite files that exist on disk', () => {
    const { manifest } = validateManifest(committed);
    for (const agent of manifest.agents) {
      const file = path.resolve(__dirname, '../../assets', agent.sprite);
      expect(fs.existsSync(file), `${agent.id}: ${agent.sprite}`).toBe(true);
    }
  });
});
