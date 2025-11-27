import type { Vector3, Quaternion } from './Physics';

/**
 * Player state enum - determines what the player is doing
 */
export enum PlayerState {
  /** Moving around the room freely */
  IDLE = 'idle',

  /** Actively solving a puzzle (tile locked to them) */
  SOLVING_PUZZLE = 'solving_puzzle',

  /** Disconnected but state persists for 30s (grace period) */
  DISCONNECTED = 'disconnected',
}

/**
 * Player entity - represents a connected game participant
 * Synchronized across all clients via Colyseus Room State
 */
export interface Player {
  /** Unique session ID from Colyseus (assigned on connection) */
  sessionId: string;

  /** Display name entered by player (no uniqueness constraint) */
  displayName: string;

  /** 3D world position in BabylonJS coordinates */
  position: Vector3;

  /** Y-axis rotation in radians (first-person camera direction) */
  rotation: number;

  /** 3D rotation of player sphere for rolling physics (quaternion) */
  bodyRotation: Quaternion;

  /** Current movement velocity in units/second */
  velocity: Vector3;

  /** Timestamp when player joined the game (Unix ms) */
  joinedAt: number;

  /** Number of tiles successfully placed in frame (leaderboard metric) */
  tilesPlaced: number;

  /** Player state for UI rendering */
  state: PlayerState;

  /** Current health (0-maxHealth) */
  health: number;

  /** Whether player is currently dead (waiting to respawn) */
  isDead: boolean;
}
