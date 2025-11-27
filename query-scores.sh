#!/bin/bash
# Query all player scores from game2.db

DB_PATH="${1:-/Volumes/Data/firegroup/rnd/blockgame/game2.db}"

sqlite3 -header -column "$DB_PATH" "
SELECT
  player_name,
  tiles_placed,
  games_played,
  total_time_played,
  datetime(last_played_at, 'unixepoch', 'localtime') as last_played
FROM leaderboard
ORDER BY tiles_placed DESC
"
