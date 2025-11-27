import { Database } from 'bun:sqlite';

// Database schema - inlined to avoid file I/O issues in production builds
const SCHEMA_SQL = `
-- Leaderboard table - tracks all-time player statistics
CREATE TABLE IF NOT EXISTS leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL,
  tiles_placed INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  total_time_played INTEGER NOT NULL DEFAULT 0, -- seconds
  last_played_at INTEGER NOT NULL, -- Unix timestamp
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_tiles ON leaderboard(tiles_placed DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_last_played ON leaderboard(last_played_at DESC);

-- Game sessions table - historical game records
CREATE TABLE IF NOT EXISTS game_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  player_count INTEGER NOT NULL,
  tile_count INTEGER NOT NULL,
  duration_seconds INTEGER, -- null if not completed
  winner_name TEXT,
  winner_tiles_placed INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_started ON game_sessions(started_at DESC);

-- Room state table - persists current game state for recovery after server restart
CREATE TABLE IF NOT EXISTS room_state (
  room_id TEXT PRIMARY KEY,
  tiles_state TEXT NOT NULL DEFAULT '[]', -- DEPRECATED: kept for backwards compatibility
  players_state TEXT NOT NULL DEFAULT '[]', -- JSON array of player scores
  slot_fill_counts TEXT, -- JSON array of slot fill counts (0=empty, 1=half, 2=complete)
  slot_completed_by TEXT, -- JSON array of player names who completed each slot
  blue_goal_score INTEGER NOT NULL DEFAULT 0, -- Blue goal score (tiles through goal)
  red_goal_score INTEGER NOT NULL DEFAULT 0, -- Red goal score (tiles through goal)
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
`;

// Migration SQL - add new columns to existing tables
// Each migration is run separately and errors are caught
const MIGRATIONS = [
  // Migration 1: Add slot_fill_counts column
  `ALTER TABLE room_state ADD COLUMN slot_fill_counts TEXT;`,
  // Migration 2: Add slot_completed_by column
  `ALTER TABLE room_state ADD COLUMN slot_completed_by TEXT;`,
];

/**
 * Initialize database with schema
 */
export function initDatabase(dbPath: string = './game.db'): Database {
  console.log('Initializing database at:', dbPath);

  // Open database (creates if doesn't exist)
  const db = new Database(dbPath, { create: true });

  // Execute schema (create tables and indexes)
  db.exec(SCHEMA_SQL);

  // Run migrations (add new columns to existing tables)
  // Each migration is safe to run multiple times - SQLite will error if column exists, we catch it
  for (let i = 0; i < MIGRATIONS.length; i++) {
    try {
      db.exec(MIGRATIONS[i]);
      console.log(`✅ Database migration ${i + 1} applied`);
    } catch (error: any) {
      // SQLite throws "duplicate column name" if column already exists - that's OK
      if (!error.message?.includes('duplicate column')) {
        console.warn(`Database migration ${i + 1} warning:`, error.message);
      }
    }
  }

  console.log('✅ Database initialized successfully');

  return db;
}

/**
 * Database row types
 */
export interface LeaderboardRow {
  id: number;
  player_name: string;
  tiles_placed: number;
  games_played: number;
  total_time_played: number;
  last_played_at: number;
  created_at: number;
}

export interface GameSessionRow {
  id: number;
  started_at: number;
  completed_at: number | null;
  player_count: number;
  tile_count: number;
  duration_seconds: number | null;
  winner_name: string | null;
  winner_tiles_placed: number | null;
}
