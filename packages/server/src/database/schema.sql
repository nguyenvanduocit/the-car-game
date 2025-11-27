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
  tiles_state TEXT NOT NULL DEFAULT '[]', -- JSON array of placed tiles
  players_state TEXT NOT NULL DEFAULT '[]', -- JSON array of player scores
  blue_goal_score INTEGER NOT NULL DEFAULT 0, -- Blue goal score (tiles through goal)
  red_goal_score INTEGER NOT NULL DEFAULT 0, -- Red goal score (tiles through goal)
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
