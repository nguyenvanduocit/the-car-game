import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';
import { PlayerSchema } from './PlayerSchema';
import { TileSchema } from './TileSchema';
import { PlacedTileSchema } from './PlacedTileSchema';
import { LeaderboardEntrySchema, AllTimeLeaderboardEntrySchema } from './LeaderboardSchema';
import {
  EMPTY_FRAME_SLOT,
  getFrameSlotPosition,
  type GameRoomState,
} from '@blockgame/shared';

/**
 * Game room schema - root Colyseus state
 * Implements GameRoomState interface from @blockgame/shared
 *
 * NEW ARCHITECTURE:
 * - tiles: Available tiles on floor (Map: availableId → TileSchema) - removed when solved
 * - placedTiles: Tiles in frame (Map: frameSlotIndex → PlacedTileSchema) - persistent
 */
export class GameRoomSchema extends Schema implements GameRoomState {
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ map: TileSchema }) tiles = new MapSchema<TileSchema>();
  @type({ map: PlacedTileSchema }) placedTiles = new MapSchema<PlacedTileSchema>();
  @type(['string']) frameSlots = new ArraySchema<string>();
  @type([LeaderboardEntrySchema]) leaderboard = new ArraySchema<LeaderboardEntrySchema>();
  @type([AllTimeLeaderboardEntrySchema]) allTimeLeaderboard = new ArraySchema<AllTimeLeaderboardEntrySchema>();
  @type('number') createdAt: number = 0;
  @type('number') blueGoalScore: number = 0;
  @type('number') redGoalScore: number = 0;

  constructor() {
    super();
    this.createdAt = Date.now();
  }

  /**
   * Initialize frame slots (all empty initially)
   */
  initializeFrameSlots(tileCount: number): void {
    this.frameSlots.clear();
    for (let i = 0; i < tileCount; i++) {
      this.frameSlots.push(EMPTY_FRAME_SLOT);
    }
  }

  /**
   * Get available tile by availableId
   */
  getTile(availableId: number): TileSchema | undefined {
    return this.tiles.get(String(availableId));
  }

  /**
   * Get placed tile by frameSlotIndex
   */
  getPlacedTile(frameSlotIndex: number): PlacedTileSchema | undefined {
    return this.placedTiles.get(String(frameSlotIndex));
  }

  /**
   * Add player to room
   */
  addPlayer(sessionId: string, displayName: string): PlayerSchema {
    const player = new PlayerSchema(sessionId, displayName);
    this.players.set(sessionId, player);
    this.updateLeaderboard();
    return player;
  }

  /**
   * Remove player from room
   */
  removePlayer(sessionId: string): void {
    const player = this.players.get(sessionId);
    if (!player) return;

    // Return any tiles owned by this player back to floor
    this.tiles.forEach((tile) => {
      if (tile.ownedBy === sessionId) {
        tile.returnToFloor();
      }
    });

    this.players.delete(sessionId);
    this.updateLeaderboard();
  }

  /**
   * Place tile in frame slot (NEW ARCHITECTURE)
   *
   * When an available tile is solved:
   * 1. Remove it from tiles map (consumed forever)
   * 2. Create/update a PlacedTileSchema in placedTiles map
   *
   * @param availableId - The available tile's ID (0-799)
   * @param sessionId - The player's session ID
   * Returns { success, isComplete, frameSlotIndex }
   */
  placeTileInFrame(availableId: number, sessionId: string): { success: boolean; isComplete: boolean; frameSlotIndex: number } {
    const tile = this.tiles.get(String(availableId));
    const player = this.players.get(sessionId);

    if (!tile || !player) return { success: false, isComplete: false, frameSlotIndex: -1 };

    const frameSlotIndex = tile.frameSlotIndex;
    if (frameSlotIndex < 0 || frameSlotIndex >= this.frameSlots.length) {
      return { success: false, isComplete: false, frameSlotIndex: -1 };
    }

    // Check if placed tile already exists for this slot
    let placedTile = this.placedTiles.get(String(frameSlotIndex));

    if (placedTile) {
      // Second puzzle solved - complete the tile
      placedTile.complete(player.displayName);
    } else {
      // First puzzle solved - create new placed tile
      placedTile = new PlacedTileSchema(frameSlotIndex, this.frameSlots.length);
      placedTile.completedBy = player.displayName;
      this.placedTiles.set(String(frameSlotIndex), placedTile);
    }

    const isComplete = placedTile.fillCount === 2;

    // Mark frameSlots when complete
    if (isComplete) {
      this.frameSlots[frameSlotIndex] = String(frameSlotIndex);
    }

    // Remove the available tile (consumed forever)
    this.tiles.delete(String(availableId));

    player.placeTile();
    this.updateLeaderboard();

    console.log(`[PLACEMENT] Tile ${availableId} (slot ${frameSlotIndex}) solved. fillCount: ${placedTile.fillCount}. Complete: ${isComplete}`);

    return { success: true, isComplete, frameSlotIndex };
  }

  /**
   * Update leaderboard (sort by tiles placed descending)
   * Groups by displayName to handle reconnections and duplicate names
   */
  updateLeaderboard(): void {
    // Step 1: Aggregate scores by displayName
    // This handles reconnections (same name, different sessionId) and duplicate sessions
    const scoreMap = new Map<string, { sessionId: string; tilesPlaced: number }>();

    this.players.forEach((player, sessionId) => {
      const existing = scoreMap.get(player.displayName);
      if (existing) {
        // Same displayName exists (reconnection or duplicate session)
        // Sum tiles placed and keep first sessionId as representative
        existing.tilesPlaced += player.tilesPlaced;
      } else {
        // New displayName
        scoreMap.set(player.displayName, {
          sessionId: sessionId,
          tilesPlaced: player.tilesPlaced,
        });
      }
    });

    // Step 2: Convert to leaderboard entries
    const entries: LeaderboardEntrySchema[] = [];
    scoreMap.forEach((data, displayName) => {
      const entry = new LeaderboardEntrySchema();
      entry.sessionId = data.sessionId; // Representative sessionId (for GUI keys)
      entry.displayName = displayName;
      entry.tilesPlaced = data.tilesPlaced;
      entries.push(entry);
    });

    // Step 3: Sort by tiles placed descending
    entries.sort((a, b) => b.tilesPlaced - a.tilesPlaced);

    // Step 4: Assign ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    // Step 5: Update schema array
    this.leaderboard.clear();
    entries.forEach((entry) => this.leaderboard.push(entry));
  }

  /**
   * Load all-time leaderboard from database rows
   * Called by GameRoom with pre-fetched database data
   */
  loadAllTimeLeaderboard(rows: Array<{ player_name: string; tiles_placed: number; games_played: number }>): void {
    this.allTimeLeaderboard.clear();

    rows.forEach((row, index) => {
      const entry = new AllTimeLeaderboardEntrySchema();
      entry.displayName = row.player_name;
      entry.tilesPlaced = row.tiles_placed;
      entry.gamesPlayed = row.games_played;
      entry.rank = index + 1;
      this.allTimeLeaderboard.push(entry);
    });

    console.log(`[LEADERBOARD] Loaded ${rows.length} all-time entries from database`);
  }

  /**
   * Get player by session ID (helper)
   */
  getPlayer(sessionId: string): PlayerSchema | undefined {
    return this.players.get(sessionId);
  }

  /**
   * Increment blue goal score
   */
  incrementBlueGoalScore(): void {
    this.blueGoalScore++;
    console.log(`[GOAL] Blue goal scored! Total: ${this.blueGoalScore}`);
  }

  /**
   * Increment red goal score
   */
  incrementRedGoalScore(): void {
    this.redGoalScore++;
    console.log(`[GOAL] Red goal scored! Total: ${this.redGoalScore}`);
  }
}
