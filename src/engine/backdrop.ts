import { Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Manifest } from '../manifest/schema';

/** Default virtual world size while no backdrop asset exists. */
export const DEFAULT_WORLD = { width: 3840, height: 2160 } as const;

export interface BackdropResult {
  container: Container;
  width: number;
  height: number;
  /** true when rendering the labeled checkerboard placeholder */
  placeholder: boolean;
  /** true when rendering an interim (non-final) painted backdrop */
  interim: boolean;
  /** problems to surface in diagnostics */
  errors: string[];
}

/**
 * Loads the painted backdrop from the manifest, or renders the explicitly
 * labeled checkerboard placeholder. The engine NEVER paints world geometry —
 * the checkerboard is the spec-mandated placeholder, not substitute art.
 */
export async function createBackdrop(manifest: Manifest): Promise<BackdropResult> {
  const errors: string[] = [];

  if (manifest.backdrop !== null) {
    const { base, width, height, interim } = manifest.backdrop;
    try {
      const texture = await Assets.load<Texture>(`./${base}`);
      const container = new Container();
      const sprite = new Sprite(texture);
      sprite.width = width;
      sprite.height = height;
      container.addChild(sprite);
      if (interim) container.addChild(interimBanner(width));
      return { container, width, height, placeholder: false, interim, errors };
    } catch (err) {
      errors.push(`backdrop: failed to load "${base}" (${String(err)}) — using placeholder`);
    }
  }

  const width = manifest.backdrop?.width ?? DEFAULT_WORLD.width;
  const height = manifest.backdrop?.height ?? DEFAULT_WORLD.height;
  return {
    container: checkerPlaceholder(width, height),
    width,
    height,
    placeholder: true,
    interim: false,
    errors,
  };
}

/** Dim navy checkerboard + explicit label. */
function checkerPlaceholder(width: number, height: number): Container {
  const container = new Container();
  const g = new Graphics();
  const tile = 128;
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      const even = ((x / tile) | 0) % 2 === ((y / tile) | 0) % 2;
      g.rect(x, y, Math.min(tile, width - x), Math.min(tile, height - y)).fill(
        even ? 0x0a1226 : 0x0d1830,
      );
    }
  }
  g.rect(0, 0, width, height).stroke({ color: 0x1f3a63, width: 6 });
  container.addChild(g);

  const label = new Text({
    text: 'BACKDROP PLACEHOLDER — awaiting base plate (assets/manifest.json → backdrop.base)',
    style: {
      fill: 0x67e8f9,
      fontSize: 56,
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      letterSpacing: 4,
    },
  });
  label.alpha = 0.55;
  label.anchor.set(0.5);
  label.position.set(width / 2, height / 2);
  container.addChild(label);
  return container;
}

/** Thin top banner marking an interim painted backdrop. */
function interimBanner(width: number): Container {
  const c = new Container();
  const g = new Graphics().rect(0, 0, width, 44).fill({ color: 0x0b1226, alpha: 0.82 });
  c.addChild(g);
  const t = new Text({
    text: 'INTERIM BACKDROP — style reference with baked-in characters; empty base plate pending',
    style: {
      fill: 0xfacc15,
      fontSize: 26,
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      letterSpacing: 2,
    },
  });
  t.position.set(16, 8);
  c.addChild(t);
  return c;
}
