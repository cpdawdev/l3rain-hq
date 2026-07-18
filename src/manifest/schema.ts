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

/** Frames a state occupies within a direction strip (see pipeline PART 1.7). */
export const SheetStateSchema = z.object({
  frames: z.number().int().positive(),
});

/**
 * Future final-art contract: one horizontal sprite strip per direction, each
 * strip laid out as [idle frames…][walk frames…] at a fixed frameSize. `sw`/`nw`
 * are optional (the engine mirrors `se`/`ne` when absent). Dropping a manifest
 * entry with spriteKind "directional-sheet" + these files swaps the procedural
 * chibi for the baked sheets with ZERO code changes.
 */
export const DirectionalSheetSchema = z.object({
  directions: z.object({
    se: z.string().min(1),
    sw: z.string().min(1).optional(),
    ne: z.string().min(1),
    nw: z.string().min(1).optional(),
  }),
  states: z.object({
    idle: SheetStateSchema,
    walk: SheetStateSchema,
  }),
  frameSize: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
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
   * production  — final full-body / directional-sheet art
   * placeholder — missing art OR interim art (e.g. portrait tokens rendered as
   *               animated chibis); always carries an explicit interim treatment
   */
  status: z.enum(['production', 'placeholder']).default('placeholder'),
  /**
   * How the sprite is presented:
   * "portrait-token"    — `sprite` is a face portrait → animated chibi paper-doll
   *                        (procedural cel-shaded body + the portrait as the head)
   * "full-body"         — `sprite` is a single full-body still
   * "directional-sheet" — `directionalSheet` carries baked 4-direction idle/walk
   *                        strips (final art); drops in with zero code changes
   */
  spriteKind: z.enum(['full-body', 'portrait-token', 'directional-sheet']).default('full-body'),
  /** Present only when spriteKind = "directional-sheet". */
  directionalSheet: DirectionalSheetSchema.optional(),
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

/**
 * Walkable waypoint node (world pixel space). `room` hubs carry a department and
 * are where agents enter/leave a room; `hall` are corridor junctions; `break`
 * are social rooms (kitchen/lounge/restroom). Edited live via the station picker.
 */
export const WaypointNodeSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  kind: z.enum(['room', 'hall', 'break']),
  department: z.enum(DEPARTMENTS).optional(),
});

export const WaypointGraphSchema = z.object({
  nodes: z.array(WaypointNodeSchema).default([]),
  /** undirected corridor edges as [nodeIdA, nodeIdB] */
  edges: z.array(z.tuple([z.string(), z.string()])).default([]),
});

export const ManifestSchema = z.object({
  worldSpriteScale: z.number().positive(),
  backdrop: BackdropSchema.nullable(),
  occluders: z.array(OccluderSchema).default([]),
  agents: z.array(AgentAssetSchema),
  departmentRegions: z.array(DepartmentRegionSchema).default([]),
  /** Walkable graph for the living simulation (M2.1); empty = no locomotion. */
  waypoints: WaypointGraphSchema.default({ nodes: [], edges: [] }),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type AgentAsset = z.infer<typeof AgentAssetSchema>;
export type Occluder = z.infer<typeof OccluderSchema>;
export type DepartmentRegion = z.infer<typeof DepartmentRegionSchema>;
export type WaypointNode = z.infer<typeof WaypointNodeSchema>;
export type WaypointGraph = z.infer<typeof WaypointGraphSchema>;
export type DirectionalSheet = z.infer<typeof DirectionalSheetSchema>;

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
