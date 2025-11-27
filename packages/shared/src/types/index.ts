// Physics types
export type { Vector3, Quaternion } from './Physics';
export { PhysicsConstants } from './Physics';

// Player types
export { PlayerState } from './Player';
export type { Player } from './Player';

// Tile types
export { TileState } from './Tile';
export type { Tile, PlacedTile } from './Tile';

// Puzzle types
export { PuzzleType } from './Puzzle';
export type {
  PuzzleConfig,
  PuzzleResult,
  MultipleChoiceData,
  PatternMatchData,
  SlidingTileData,
  MemoryCardData,
  PuzzleDataPayload,
  PuzzleDataSerialized,
} from './Puzzle';

// Game room types
export { SlotFillState } from './GameRoom';
export type { GameRoomConfig, GameRoomState, LeaderboardEntry, SharedMap, SharedArray } from './GameRoom';
