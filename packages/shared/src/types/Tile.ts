import type { Vector3, Quaternion } from './Physics';
import type { PuzzleConfig } from './Puzzle';

/**
 * Tile state enum - determines physics behavior and rendering
 */
export enum TileState {
  /** Not yet spawned (in pool, no physics body, not visible) */
  NOT_SPAWNED = 'not_spawned',

  /** On floor with active physics simulation */
  ON_FLOOR = 'on_floor',

  /** Being charged for shooting (grabbed by arms, follows player) */
  CHARGING = 'charging',

  /** Locked to player solving puzzle (follows player, physics disabled) */
  LOCKED = 'locked',

  /** Flying to frame slot (no physics, server-side animation) */
  FLYING = 'flying',

  /** Placed in picture frame (physics disabled, static position) */
  PLACED = 'placed',
}

/**
 * Available tile entity - physics-enabled collectible on the floor
 * Server runs authoritative physics, clients interpolate
 *
 * NEW ARCHITECTURE:
 * - availableId: 0-799 (unique identifier for available tiles)
 * - frameSlotIndex: 0-399 (which frame slot this tile fills)
 * - phase: 1 or 2 (first half or second half of the slot)
 *
 * When solved, this tile is REMOVED and a PlacedTile is created/updated
 *
 * NOTE: Only synced fields are included here. Server-only fields
 * (velocity, angularVelocity, isSleeping, etc.) are in TileSchema only.
 */
export interface Tile {
  /** Current tile state (determines physics and rendering) */
  state: TileState;

  /** 3D world position (updated by physics engine) */
  position: Vector3;

  /** 3D rotation as quaternion (physics-driven) */
  rotation: Quaternion;

  /** Session ID of player who owns this tile (null if on floor) */
  ownedBy: string | null;

  /** Unique ID for available tiles (0-799) */
  availableId: number;

  /** Designated slot index in picture frame (0-399) */
  frameSlotIndex: number;

  /** Phase: 1 = first half, 2 = second half */
  phase: number;
}

/**
 * Placed tile entity - tile that has been placed in the picture frame
 * These are persistent and always visible in the frame
 */
export interface PlacedTile {
  /** Frame slot index (0-399) */
  frameSlotIndex: number;

  /** Fill count: 1 = half-filled (0.5 scale), 2 = complete (1.0 scale) */
  fillCount: number;

  /** Display name of player(s) who completed this slot */
  completedBy: string;

  /** 3D position in frame */
  position: Vector3;

  /** 3D rotation in frame */
  rotation: Quaternion;
}
