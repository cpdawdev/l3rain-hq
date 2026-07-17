import { Graphics, type Container } from 'pixi.js';
import type { DepartmentRegion } from '../manifest/schema';
import type { Department } from '../data/roster';
import type { DepartmentStatus } from '../data/provider';

/**
 * Restrained lighting overlays per department status (no bloom storms).
 * black-lit darkens the room; the rest are gentle color washes.
 */
export const STATUS_TINT: Record<DepartmentStatus, { color: number; alpha: number }> = {
  working: { color: 0x4ade80, alpha: 0.09 },
  waiting: { color: 0xfacc15, alpha: 0.11 },
  idle: { color: 0x0f172a, alpha: 0.16 },
  opening: { color: 0x67e8f9, alpha: 0.11 },
  'black-lit': { color: 0x020617, alpha: 0.45 },
};

interface RegionVisual {
  def: DepartmentRegion;
  g: Graphics;
}

/** Code-driven department status tinting over manifest-declared backdrop regions. */
export class TintLayer {
  private readonly regions: RegionVisual[] = [];
  private current: Partial<Record<Department, DepartmentStatus>> = {};

  constructor(layer: Container, defs: readonly DepartmentRegion[]) {
    for (const def of defs) {
      const g = new Graphics();
      layer.addChild(g);
      this.regions.push({ def, g });
    }
  }

  apply(statuses: Partial<Record<Department, DepartmentStatus>>): void {
    this.current = statuses;
    for (const { def, g } of this.regions) {
      const status = statuses[def.department];
      g.clear();
      if (!status) continue;
      const tint = STATUS_TINT[status];
      const color = def.color ? Number.parseInt(def.color.slice(1), 16) : tint.color;
      g.roundRect(def.x, def.y, def.width, def.height, 26).fill({
        color: status === 'black-lit' ? tint.color : color,
        alpha: tint.alpha,
      });
    }
  }

  /** current status for a department (effects layer reads this) */
  statusOf(department: Department): DepartmentStatus | undefined {
    return this.current[department];
  }
}
