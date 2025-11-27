import { Schema, type } from '@colyseus/schema';
import type { LeaderboardEntry } from '@blockgame/shared';

/**
 * Leaderboard entry schema (session-based)
 * Implements LeaderboardEntry interface from @blockgame/shared
 */
export class LeaderboardEntrySchema extends Schema implements LeaderboardEntry {
  @type('string') sessionId: string = '';
  @type('string') displayName: string = '';
  @type('number') tilesPlaced: number = 0;
  @type('number') rank: number = 0;

  constructor() {
    super();
  }
}

/**
 * All-time leaderboard entry schema (persistent across sessions)
 * Loaded from database, shows historical best players
 */
export class AllTimeLeaderboardEntrySchema extends Schema {
  @type('string') displayName: string = '';
  @type('number') tilesPlaced: number = 0;
  @type('number') gamesPlayed: number = 0;
  @type('number') rank: number = 0;

  constructor() {
    super();
  }
}
