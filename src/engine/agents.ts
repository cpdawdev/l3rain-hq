import { Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { AgentAsset, Manifest } from '../manifest/schema';
import { ROSTER } from '../data/roster';
import { Chibi, DirectionalDoll, hashPalette, samplePalette, type Doll } from './chibi';

/** How a given agent ends up on screen. Placeholders are always labeled. */
export type RenderPath =
  | 'production-sprite' // final full-body still
  | 'directional-sheet' // final baked 4-direction idle/walk sheets
  | 'chibi' // interim: animated chibi paper-doll (portrait = head)
  | 'placeholder-sprite' // full-body file exists but status=placeholder → dimmed + tag
  | 'placeholder-silhouette'; // no usable texture → silhouette + tag

/** Pure decision (unit-tested): spec rule — placeholder status is never presented as final. */
export function resolveRenderPath(
  entry: Pick<AgentAsset, 'status' | 'spriteKind' | 'directionalSheet'>,
  textureLoaded: boolean,
): RenderPath {
  // Baked final art takes priority and does not depend on the portrait texture.
  if (entry.spriteKind === 'directional-sheet' && entry.directionalSheet) return 'directional-sheet';
  if (!textureLoaded) return 'placeholder-silhouette';
  if (entry.status === 'production') return 'production-sprite';
  // Interim portrait tokens are now rendered as animated chibi paper-dolls.
  return entry.spriteKind === 'portrait-token' ? 'chibi' : 'placeholder-sprite';
}

export interface AgentVisual {
  id: string;
  entry: AgentAsset;
  container: Container;
  /** live foot contact point in world px (the simulation writes this each frame) */
  footX: number;
  /** foot contact Y in world px — also the depth key (zIndex) */
  footY: number;
  /** visual height above the foot point in world px (label anchoring) */
  height: number;
  path: RenderPath;
  /** animated doll (chibi / directional-sheet) the simulation poses each frame */
  doll?: Doll;
}

export interface AgentLayerResult {
  visuals: Map<string, AgentVisual>;
  errors: string[];
}

/** Reference sprite height (px) the pipeline delivers; worldSpriteScale maps it to world px. */
const SPRITE_SOURCE_HEIGHT = 512;

/**
 * Builds every roster agent into the sprites layer from the manifest.
 * Missing manifest entries render as labeled silhouettes on a fallback row so
 * all 30 agents are always visible and honestly marked.
 */
export async function buildAgentLayer(
  manifest: Manifest,
  layer: Container,
  worldHeight: number,
  onTap?: (id: string) => void,
): Promise<AgentLayerResult> {
  const errors: string[] = [];
  const visuals = new Map<string, AgentVisual>();
  layer.sortableChildren = true;

  const byId = new Map(manifest.agents.map((a) => [a.id, a]));

  // Preload every texture in ONE concurrent batch, then build synchronously.
  // Sequential await-per-agent loads interleaved with an actively rendering
  // Application stall Pixi's texture pipeline (loads stop resolving after
  // ~10 textures) — see docs/IMPLEMENTATION_STATUS.md "Known engine notes".
  const urls = [
    ...manifest.occluders.map((o) => `./${o.file}`),
    ...manifest.agents.map((a) => `./${a.sprite}`),
    // future baked directional sheets (four strips per agent) preload here too
    ...manifest.agents.flatMap((a) =>
      a.spriteKind === 'directional-sheet' && a.directionalSheet
        ? Object.values(a.directionalSheet.directions)
            .filter((f): f is string => Boolean(f))
            .map((f) => `./${f}`)
        : [],
    ),
  ];
  const textures = new Map<string, Texture>();
  const results = await Promise.allSettled(
    urls.map(async (url) => ({ url, texture: await Assets.load<Texture>(url) })),
  );
  for (const r of results) {
    if (r.status === 'fulfilled') textures.set(r.value.url, r.value.texture);
  }

  // Occluders participate in the same depth space (zIndex = depthY).
  for (const occ of manifest.occluders) {
    const texture = textures.get(`./${occ.file}`);
    if (!texture) {
      errors.push(`occluder: failed to load "${occ.file}" — skipped`);
      continue;
    }
    const sprite = new Sprite(texture);
    sprite.position.set(0, 0); // full-canvas PNGs per the pipeline
    sprite.zIndex = occ.depthY;
    layer.addChild(sprite);
  }

  let missingIndex = 0;

  for (const rosterAgent of ROSTER) {
    let entry = byId.get(rosterAgent.id);
    if (!entry) {
      // Fallback row along the bottom edge; crossCheckRoster already reported it.
      entry = {
        id: rosterAgent.id,
        sprite: `characters/${rosterAgent.id}_idle_se.png`,
        anchor: 'bottom-center',
        scale: 1,
        mirrorSafe: true,
        flip: false,
        station: { x: 80 + missingIndex * 90, y: worldHeight - 40 },
        status: 'placeholder',
        spriteKind: 'full-body',
      };
      missingIndex += 1;
    }

    if (entry.flip && !entry.mirrorSafe) {
      errors.push(`agent ${entry.id}: flip requested but mirrorSafe=false (asymmetric design)`);
    }

    const texture = textures.get(`./${entry.sprite}`) ?? null;
    if (texture === null && entry.status !== 'placeholder') {
      errors.push(`agent ${entry.id}: sprite "${entry.sprite}" failed to load — placeholder`);
    }

    let path = resolveRenderPath(entry, texture !== null);
    const container = new Container();
    container.position.set(entry.station.x, entry.station.y);
    container.zIndex = entry.station.y;

    let height = 0;
    let doll: Doll | undefined;
    switch (path) {
      case 'production-sprite':
      case 'placeholder-sprite': {
        if (!texture) break;
        height = buildFullBody(container, texture, manifest.worldSpriteScale, entry, path);
        break;
      }
      case 'directional-sheet': {
        const built = buildDirectionalDoll(container, textures, manifest.worldSpriteScale, entry);
        if (built) {
          height = built.height;
          doll = built.doll;
        } else {
          errors.push(`agent ${entry.id}: directional sheets failed to load — silhouette`);
          height = buildSilhouette(container, manifest.worldSpriteScale, entry);
          path = 'placeholder-silhouette';
        }
        break;
      }
      case 'chibi': {
        const built = buildChibi(container, texture, manifest.worldSpriteScale, entry);
        height = built.height;
        doll = built.doll;
        break;
      }
      case 'placeholder-silhouette': {
        height = buildSilhouette(container, manifest.worldSpriteScale, entry);
        break;
      }
    }

    container.eventMode = 'static';
    container.cursor = 'pointer';
    if (onTap) {
      container.on('pointertap', () => {
        onTap(entry.id);
      });
    }

    layer.addChild(container);
    visuals.set(entry.id, {
      id: entry.id,
      entry,
      container,
      footX: entry.station.x,
      footY: entry.station.y,
      height,
      path,
      ...(doll ? { doll } : {}),
    });
  }

  return { visuals, errors };
}

/** Full-body sprite, bottom-center anchored at the foot point. Returns world height. */
function buildFullBody(
  container: Container,
  texture: Texture,
  worldSpriteScale: number,
  entry: AgentAsset,
  path: RenderPath,
): number {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 1);
  const s = worldSpriteScale * entry.scale * (SPRITE_SOURCE_HEIGHT / texture.height);
  sprite.scale.set(entry.flip ? -s : s, s);
  container.addChild(sprite);
  const height = texture.height * s;
  if (path === 'placeholder-sprite') {
    sprite.alpha = 0.55;
    sprite.tint = 0x8899bb;
    container.addChild(tag('PLACEHOLDER', height, worldSpriteScale * entry.scale));
  }
  return height;
}

/**
 * Interim animated chibi paper-doll (workstream 3): the portrait becomes the
 * head, the body is procedural cel-shaded parts with a per-agent palette sampled
 * from the portrait. Still honestly interim (keeps the small INTERIM chip); the
 * simulation poses it (walk cycle / facings / idle sway) each frame.
 */
function buildChibi(
  container: Container,
  texture: Texture | null,
  worldSpriteScale: number,
  entry: AgentAsset,
): { height: number; doll: Doll } {
  const palette = texture ? samplePalette(texture, entry.id) : hashPalette(entry.id);
  const chibi = new Chibi(texture, palette, worldSpriteScale * entry.scale);
  container.addChild(chibi.root);
  container.addChild(tag('INTERIM', chibi.height, worldSpriteScale * entry.scale));
  return { height: chibi.height, doll: chibi };
}

/**
 * Final baked directional-sheet art (spriteKind "directional-sheet"): four
 * idle/walk strips animated behind the same pose contract. No INTERIM chip —
 * this is production art. Returns null if the sheet textures are missing.
 */
function buildDirectionalDoll(
  container: Container,
  textures: Map<string, Texture>,
  worldSpriteScale: number,
  entry: AgentAsset,
): { height: number; doll: Doll } | null {
  const ds = entry.directionalSheet;
  if (!ds) return null;
  const tex = (f?: string): Texture | undefined => (f ? textures.get(`./${f}`) : undefined);
  const se = tex(ds.directions.se);
  const ne = tex(ds.directions.ne);
  if (!se || !ne) return null;
  const doll = new DirectionalDoll(
    { se, ne, sw: tex(ds.directions.sw), nw: tex(ds.directions.nw) },
    {
      idleFrames: ds.states.idle.frames,
      walkFrames: ds.states.walk.frames,
      frameW: ds.frameSize.width,
      frameH: ds.frameSize.height,
      unitScale: worldSpriteScale * entry.scale,
    },
  );
  container.addChild(doll.root);
  return { height: doll.height, doll };
}

/** Dimmed capsule silhouette + PLACEHOLDER tag (spec placeholder rule). */
function buildSilhouette(
  container: Container,
  worldSpriteScale: number,
  entry: AgentAsset,
): number {
  const h = SPRITE_SOURCE_HEIGHT * worldSpriteScale * entry.scale;
  const w = h * 0.36;
  const g = new Graphics();
  // body capsule
  g.roundRect(-w / 2, -h * 0.62, w, h * 0.62, w / 2).fill({ color: 0x24324f, alpha: 0.5 });
  // head
  g.circle(0, -h * 0.78, h * 0.16).fill({ color: 0x24324f, alpha: 0.5 });
  g.ellipse(0, 0, w * 0.7, w * 0.22).fill({ color: 0x000000, alpha: 0.28 });
  container.addChild(g);
  container.addChild(tag('PLACEHOLDER', h, worldSpriteScale * entry.scale));
  return h;
}

/** Small explicit status chip below the foot point. World-space by design. */
function tag(label: string, _visualHeight: number, scaleHint: number): Container {
  const c = new Container();
  const fontSize = Math.max(9, 62 * scaleHint);
  const text = new Text({
    text: label,
    style: {
      fill: label === 'INTERIM' ? 0xfacc15 : 0xf87171,
      fontSize,
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      letterSpacing: 1,
    },
  });
  text.anchor.set(0.5, 0);
  const padX = fontSize * 0.5;
  const padY = fontSize * 0.22;
  const bg = new Graphics()
    .roundRect(
      -text.width / 2 - padX,
      -padY,
      text.width + padX * 2,
      text.height + padY * 2,
      fontSize * 0.35,
    )
    .fill({ color: 0x0b1226, alpha: 0.78 });
  c.addChild(bg, text);
  c.position.set(0, fontSize * 0.5);
  return c;
}
