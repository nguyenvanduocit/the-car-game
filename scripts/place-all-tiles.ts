#!/usr/bin/env bun
/**
 * Place all tiles on frame for testing
 * Usage: bun scripts/place-all-tiles.ts [roomId]
 */
import { Database } from 'bun:sqlite';
import { TileState, getFrameSlotPosition, TILE_CONFIG } from '@blockgame/shared';
import type { PersistedTile } from '../packages/server/src/database/roomState';
import { loadRoomState, saveRoomState } from '../packages/server/src/database/roomState';

const ROOM_ID = process.argv[2] || 'firegroup';
const DB_PATH = './packages/server/game.db';

console.log(`🔧 [PLACE ALL TILES] Starting...`);
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

// Get tile count from current tiles or default
const tileCount = roomState.tiles.length || TILE_CONFIG.defaultCount;

// Place all tiles on frame
const placedTiles: PersistedTile[] = [];
let newPlacedCount = 0;

// Reassign all tiles to sequential slots 0-(tileCount-1)
for (let slotIndex = 0; slotIndex < tileCount; slotIndex++) {
  const tile = roomState.tiles[slotIndex];

  if (!tile) {
    console.warn(`⚠️  No tile at index ${slotIndex}, skipping`);
    continue;
  }

  // Skip if already placed at correct slot
  if (tile.state === TileState.PLACED && tile.frameSlotIndex === slotIndex) {
    placedTiles.push(tile);
    continue;
  }

  // Calculate frame slot position
  const slotPosition = getFrameSlotPosition(slotIndex, tileCount);

  // Calculate frame rotation (90 degrees X + 180 degrees Z)
  const angleX = Math.PI / 2;
  const angleZ = -Math.PI;

  // X-axis rotation quaternion
  const qx = {
    x: Math.sin(angleX / 2),
    y: 0,
    z: 0,
    w: Math.cos(angleX / 2),
  };

  // Z-axis rotation quaternion
  const qz = {
    x: 0,
    y: 0,
    z: Math.sin(angleZ / 2),
    w: Math.cos(angleZ / 2),
  };

  // Combine rotations: qFinal = qz * qx
  const qFinal = {
    x: qz.w * qx.x + qz.x * qx.w + qz.y * qx.z - qz.z * qx.y,
    y: qz.w * qx.y - qz.x * qx.z + qz.y * qx.w + qz.z * qx.x,
    z: qz.w * qx.z + qz.x * qx.y - qz.y * qx.x + qz.z * qx.w,
    w: qz.w * qx.w - qz.x * qx.x - qz.y * qx.y - qz.z * qx.z,
  };

  // Update tile (reassign frameSlotIndex to match position)
  placedTiles.push({
    ...tile,
    frameSlotIndex: slotIndex, // Fix frameSlotIndex to match actual slot
    state: TileState.PLACED,
    ownedByName: null,
    positionX: slotPosition.x,
    positionY: slotPosition.y,
    positionZ: slotPosition.z,
    rotationX: qFinal.x,
    rotationY: qFinal.y,
    rotationZ: qFinal.z,
    rotationW: qFinal.w,
  });

  newPlacedCount++;
}

// Save updated state
saveRoomState(
  db,
  ROOM_ID,
  true, // Mark as complete
  placedTiles,
  roomState.players,
  roomState.blueGoalScore,
  roomState.redGoalScore
);

console.log(`\n✅ Done!`);
console.log(`   Placed ${newPlacedCount} new tiles`);
console.log(`   Total placed: ${placedTiles.length}/${tileCount}`);
console.log(`   Game marked as complete`);

db.close();
