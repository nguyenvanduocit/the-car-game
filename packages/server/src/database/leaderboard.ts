import type { Database } from 'bun:sqlite';
import type { LeaderboardRow } from './init';

/**
 * Update player score in leaderboard
 */
export function updatePlayerScore(
  db: Database,
  playerName: string,
  tilesPlaced: number,
  timePlayed: number
): void {
  const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

  // Check if player exists
  const existing = db
    .query<LeaderboardRow, [string]>('SELECT * FROM leaderboard WHERE player_name = ?')
    .get(playerName);

  if (existing) {
    // Update existing player
    db.query(
      `UPDATE leaderboard
       SET tiles_placed = tiles_placed + ?,
           games_played = games_played + 1,
           total_time_played = total_time_played + ?,
           last_played_at = ?
       WHERE player_name = ?`
    ).run(tilesPlaced, timePlayed, now, playerName);
  } else {
    // Insert new player
    db.query(
      `INSERT INTO leaderboard (player_name, tiles_placed, games_played, total_time_played, last_played_at, created_at)
       VALUES (?, ?, 1, ?, ?, ?)`
    ).run(playerName, tilesPlaced, timePlayed, now, now);
  }
}

/**
 * Get top N players from leaderboard
 */
export function getTopPlayers(db: Database, limit: number = 10): LeaderboardRow[] {
  return db
    .query<LeaderboardRow, [number]>('SELECT * FROM leaderboard ORDER BY tiles_placed DESC LIMIT ?')
    .all(limit) as LeaderboardRow[];
}

/**
 * Get player stats by name
 */
export function getPlayerStats(db: Database, playerName: string): LeaderboardRow | null {
  return (
    (db
      .query<LeaderboardRow, [string]>('SELECT * FROM leaderboard WHERE player_name = ?')
      .get(playerName) as LeaderboardRow) || null
  );
}

/**
 * Reset leaderboard (for testing/admin)
 */
export function resetLeaderboard(db: Database): void {
  db.query('DELETE FROM leaderboard').run();
  console.log('Leaderboard reset');
}

/**
 * Record game session start
 */
export function recordGameStart(db: Database, playerCount: number, tileCount: number): number {
  const now = Math.floor(Date.now() / 1000);

  const result = db
    .query(
      `INSERT INTO game_sessions (started_at, player_count, tile_count)
       VALUES (?, ?, ?)`
    )
    .run(now, playerCount, tileCount);

  return result.lastInsertRowid as number;
}

/**
 * Record game session completion
 */
export function recordGameComplete(
  db: Database,
  sessionId: number,
  winnerName: string,
  winnerTilesPlaced: number
): void {
  const now = Math.floor(Date.now() / 1000);

  // Get session start time
  const session = db.query('SELECT started_at FROM game_sessions WHERE id = ?').get(sessionId) as {
    started_at: number;
  };

  if (!session) return;

  const durationSeconds = now - session.started_at;

  db.query(
    `UPDATE game_sessions
     SET completed_at = ?,
         duration_seconds = ?,
         winner_name = ?,
         winner_tiles_placed = ?
     WHERE id = ?`
  ).run(now, durationSeconds, winnerName, winnerTilesPlaced, sessionId);
}
