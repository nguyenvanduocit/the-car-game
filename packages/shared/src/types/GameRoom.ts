import type { Player } from './Player';
import type { Tile, PlacedTile } from './Tile';
import type { Vector3 } from './Physics';
import type { MapSchema, ArraySchema } from '@colyseus/schema';

/**
 * Game room configuration - static properties of the game world
 * Set once on room creation, never changes
 */
export interface GameRoomConfig {
  /** Room width in world units */
  floorWidth: number; // 100

  /** Room length in world units */
  floorLength: number; // 200

  /** Floor Y position (always 0) */
  floorY: number; // 0

  /** Number of tiles to spawn */
  tileCount: number; // 20-50

  /** Picture frame dimensions (grid layout) */
  frameWidth: number; // e.g., 10 tiles wide

  /** Picture frame height (grid layout) */
  frameHeight: number; // e.g., 5 tiles high

  /** Frame position in 3D space */
  framePosition: Vector3; // e.g., {x: 0, y: 10, z: 0}

  /** Complete picture image URL (revealed when all tiles placed) */
  completePictureUrl: string;
}

/**
 * Leaderboard entry - player ranking
 */
export interface LeaderboardEntry {
  sessionId: string;
  displayName: string;
  tilesPlaced: number;
  rank: number; // 1-based ranking
}

export type SharedMap<T> = Map<string, T> | MapSchema<any>;
export type SharedArray<T> = T[] | ArraySchema<any>;

/**
 * Slot fill state - tracks how many tiles have been placed in each slot
 * Each slot requires 2 tiles (phase 1 and phase 2) to be complete
 */
export enum SlotFillState {
  EMPTY = 0,    // No tiles placed
  HALF = 1,     // One tile placed (phase 1)
  COMPLETE = 2, // Both tiles placed (phase 1 and 2)
}

/**
 * Game room state - dynamic multiplayer state
 * This is the Colyseus Room State schema root
 *
 * NEW ARCHITECTURE:
 * - tiles: Available tiles on floor (Map: availableId → Tile) - consumable, removed when solved
 * - placedTiles: Tiles in frame (Map: frameSlotIndex → PlacedTile) - persistent
 *
 * BANDWIDTH OPTIMIZATION: Only active tiles are synced (not NOT_SPAWNED tiles)
 */
export interface GameRoomState {
  /** All connected players (Map: sessionId → Player) */
  players: SharedMap<Player>;

  /** Available tiles on floor (Map: availableId → Tile) - removed when solved */
  tiles: SharedMap<Tile>;

  /** Placed tiles in frame (Map: frameSlotIndex → PlacedTile) - persistent */
  placedTiles: SharedMap<PlacedTile>;

  /**
   * Picture frame slot states (array of tile indices as strings)
   * Empty slots use the EMPTY_FRAME_SLOT sentinel value
   */
  frameSlots: SharedArray<string>;

  /** Leaderboard (sorted by tilesPlaced descending) */
  leaderboard: SharedArray<LeaderboardEntry>;

  /** Room creation timestamp */
  createdAt: number;
}
