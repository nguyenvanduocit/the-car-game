import type { Database } from 'bun:sqlite';

/**
 * Persisted player data
 */
export interface PersistedPlayer {
  displayName: string;
  tilesPlaced: number;
}

/**
 * Room state row from database
 */
export interface RoomStateRow {
  room_id: string;
  tiles_state: string; // DEPRECATED: kept for backwards compatibility
  players_state: string; // JSON string
  slot_fill_counts: string | null; // JSON array of fill counts (0=empty, 1=half, 2=complete)
  slot_completed_by: string | null; // JSON array of player names who completed each slot
  blue_goal_score: number;
  red_goal_score: number;
  updated_at: number;
}

/**
 * Parsed room state
 */
export interface RoomState {
  roomId: string;
  players: PersistedPlayer[];
  slotFillCounts: number[]; // 0=empty, 1=half, 2=complete (400 slots)
  slotCompletedBy: string[]; // Player names who completed each slot (400 slots)
  blueGoalScore: number;
  redGoalScore: number;
  updatedAt: number;
}

/**
 * Save current room state to database
 */
export function saveRoomState(
  db: Database,
  roomId: string,
  players: PersistedPlayer[],
  slotFillCounts: number[],
  slotCompletedBy: string[],
  blueGoalScore: number,
  redGoalScore: number
): void {
  const now = Math.floor(Date.now() / 1000);
  const playersJson = JSON.stringify(players);
  const slotFillCountsJson = JSON.stringify(slotFillCounts);
  const slotCompletedByJson = JSON.stringify(slotCompletedBy);

  // Upsert (insert or replace)
  db.query(
    `INSERT OR REPLACE INTO room_state (room_id, tiles_state, players_state, slot_fill_counts, slot_completed_by, blue_goal_score, red_goal_score, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(roomId, '[]', playersJson, slotFillCountsJson, slotCompletedByJson, blueGoalScore, redGoalScore, now);

  const halfCount = slotFillCounts.filter(c => c === 1).length;
  const completeCount = slotFillCounts.filter(c => c === 2).length;
  console.log(`✅ Room state saved: ${roomId} (${players.length} players, slots: ${halfCount} half/${completeCount} complete, goals: ${blueGoalScore}-${redGoalScore})`);
}

/**
 * Load room state from database
 */
export function loadRoomState(db: Database, roomId: string): RoomState | null {
  const row = db
    .query<RoomStateRow, [string]>('SELECT * FROM room_state WHERE room_id = ?')
    .get(roomId) as RoomStateRow | undefined;

  if (!row) {
    console.log(`No saved state found for room: ${roomId}`);
    return null;
  }

  try {
    const players = JSON.parse(row.players_state) as PersistedPlayer[];

    // Parse slotFillCounts (may be null for legacy data)
    const slotFillCounts = row.slot_fill_counts
      ? (JSON.parse(row.slot_fill_counts) as number[])
      : []; // Empty array for legacy data

    // Parse slotCompletedBy (may be null for legacy data)
    const slotCompletedBy = row.slot_completed_by
      ? (JSON.parse(row.slot_completed_by) as string[])
      : []; // Empty array for legacy data

    const halfCount = slotFillCounts.filter(c => c === 1).length;
    const completeCount = slotFillCounts.filter(c => c === 2).length;
    console.log(`✅ Room state loaded: ${roomId} (${players.length} players, slots: ${halfCount} half/${completeCount} complete, goals: ${row.blue_goal_score}-${row.red_goal_score})`);

    return {
      roomId: row.room_id,
      players,
      slotFillCounts,
      slotCompletedBy,
      blueGoalScore: row.blue_goal_score || 0,
      redGoalScore: row.red_goal_score || 0,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    console.error(`Failed to parse room state for ${roomId}:`, error);
    return null;
  }
}

/**
 * Clear room state (for new game or reset)
 */
export function clearRoomState(db: Database, roomId: string): void {
  db.query('DELETE FROM room_state WHERE room_id = ?').run(roomId);
  console.log(`✅ Room state cleared: ${roomId}`);
}
