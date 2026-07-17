import { z } from 'zod';
import { DEPARTMENTS } from '../data/roster';

/**
 * assets/manifest.json — the contract between art and code.
 * See docs/l3rain-asset-pipeline.md (Part 3) and the master spec.
 * All paths are relative to assets/ (served at the web root).
 */

export const StationSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const AgentAssetSchema = z.object({
  id: z.string().min(1),
  /** Sprite path relative to assets/. May be a full-body sprite or, interim, a portrait. */
  sprite: z.string().min(1),
  anchor: z.literal('bottom-center').default('bottom-center'),
  scale: z.number().positive().default(1),
  mirrorSafe: z.boolean().default(true),
  flip: z.boolean().default(false),
  station: StationSchema,
  /**
   * production  — final full-body sprite art
   * placeholder — missing art OR interim art (e.g. portrait tokens); always
   *               rendered with an explicit interim/placeholder treatment
   */
  status: z.enum(['production', 'placeholder']).default('placeholder'),
  /**
   * How the sprite file should be presented while status is "placeholder":
   * "portrait-token" — the file is a face portrait; render as a floating token
   * "full-body"      — the file is real full-body art
   */
  spriteKind: z.enum(['full-body', 'portrait-token']).default('full-body'),
});

export const OccluderSchema = z.object({
  file: z.string().min(1),
  depthY: z.number(),
});

export const BackdropSchema = z.object({
  base: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Interim backdrops (e.g. a style reference with characters baked in) are flagged. */
  interim: z.boolean().default(false),
});

/** Optional per-department lighting region for status tint overlays (additive extension). */
export const DepartmentRegionSchema = z.object({
  department: z.enum(DEPARTMENTS),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  /** Accent tint as #rrggbb; falls back to the department default in code. */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const ManifestSchema = z.object({
  worldSpriteScale: z.number().positive(),
  backdrop: BackdropSchema.nullable(),
  occluders: z.array(OccluderSchema).default([]),
  agents: z.array(AgentAssetSchema),
  departmentRegions: z.array(DepartmentRegionSchema).default([]),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type AgentAsset = z.infer<typeof AgentAssetSchema>;
export type Occluder = z.infer<typeof OccluderSchema>;
export type DepartmentRegion = z.infer<typeof DepartmentRegionSchema>;

export interface ManifestValidation {
  manifest: Manifest;
  /** Human-readable problems, surfaced in the diagnostics panel — never silent. */
  errors: string[];
}

/** Fallback manifest used when assets/manifest.json is absent or invalid. */
export function emptyManifest(): Manifest {
  return ManifestSchema.parse({
    worldSpriteScale: 1,
    backdrop: null,
    occluders: [],
    agents: [],
  });
}
