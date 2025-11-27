#!/usr/bin/env bun
/**
 * Remove all tiles from frame (reset to floor) for testing
 * Usage: bun scripts/remove-all-tiles.ts [roomId]
 */
import { Database } from 'bun:sqlite';
import { TileState, FLOOR_CONFIG, TILE_CONFIG } from '@blockgame/shared';
import type { PersistedTile } from '../packages/server/src/database/roomState';
import { loadRoomState, saveRoomState } from '../packages/server/src/database/roomState';

const ROOM_ID = process.argv[2] || 'firegroup';
const DB_PATH = './packages/server/game.db';

console.log(`🔧 [REMOVE ALL TILES] Starting...`);
console.log(`   Room ID: ${ROOM_ID}`);
console.log(`   Database: ${DB_PATH}`);

// Open database
const db = new Database(DB_PATH);

// Load current room state
const roomState = loadRoomState(db, ROOM_ID);

if (!roomState) {
  console.error(`❌ No room state found for room: ${ROOM_ID}`);
  console.log(`   Create a room first by starting the server`);
  process.exit(1);
}

console.log(`\n📊 Current state:`);
console.log(`   Total tiles: ${roomState.tiles.length}`);

// Remove all tiles from frame
const floorTiles: PersistedTile[] = [];
let removedCount = 0;

const floorWidth = FLOOR_CONFIG.width;
const floorLength = FLOOR_CONFIG.length;
const spawnPadding = TILE_CONFIG.spawnPadding;
const spawnHeight = TILE_CONFIG.spawnHeight;

roomState.tiles.forEach((tile) => {
  // Skip if already on floor
  if (tile.state === TileState.ON_FLOOR) {
    floorTiles.push(tile);
    return;
  }

  // Random position on floor
  const x = (Math.random() - 0.5) * floorWidth * spawnPadding;
  const y = spawnHeight;
  const z = (Math.random() - 0.5) * floorLength * spawnPadding;

  // Update tile
  floorTiles.push({
    ...tile,
    state: TileState.ON_FLOOR,
    ownedByName: null,
    positionX: x,
    positionY: y,
    positionZ: z,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    rotationW: 1,
  });

  removedCount++;
});

// Save updated state
saveRoomState(
  db,
  ROOM_ID,
  false, // Mark as incomplete
  floorTiles,
  roomState.players,
  roomState.blueGoalScore,
  roomState.redGoalScore
);

console.log(`\n✅ Done!`);
console.log(`   Removed ${removedCount} tiles from frame`);
console.log(`   Total on floor: ${floorTiles.length}`);
console.log(`   Game marked as incomplete`);

db.close();
