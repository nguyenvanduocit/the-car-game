#!/usr/bin/env bun
/**
 * Reset room state to recreate with default tile count
 * Usage: bun scripts/reset-room.ts [roomId]
 */
import { Database } from 'bun:sqlite';
import { clearRoomState } from '../packages/server/src/database/roomState';

const ROOM_ID = process.argv[2] || 'firegroup';
const DB_PATH = './packages/server/game.db';

console.log(`🔧 [RESET ROOM] Starting...`);
console.log(`   Room ID: ${ROOM_ID}`);
console.log(`   Database: ${DB_PATH}`);

// Open database
const db = new Database(DB_PATH);

// Clear room state
clearRoomState(db, ROOM_ID);

console.log(`\n✅ Done!`);
console.log(`   Room state cleared for: ${ROOM_ID}`);
console.log(`   Restart the server to recreate with default 400 tiles`);

db.close();
