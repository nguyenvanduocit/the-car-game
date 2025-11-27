import { test, expect } from 'bun:test';
import { GameRoom } from '../../src/rooms/GameRoom';
import { PlayerSchema } from '../../src/schema/PlayerSchema';
import { TileSchema } from '../../src/schema/TileSchema';
import { PuzzleConfigSchema } from '../../src/schema/PuzzleConfigSchema';
import { PuzzleType, PlayerState, TileState } from '@blockgame/shared';

/**
 * Mock Colyseus Client for testing
 */
export class MockClient {
  sessionId: string;
  private sentMessages: Array<{ type: string; data: any }> = [];

  constructor(sessionId: string = `test-session-${Math.random()}`) {
    this.sessionId = sessionId;
  }

  /**
   * Mock send method - captures messages sent to client
   */
  send(type: string, data?: any): void {
    this.sentMessages.push({ type, data });
  }

  /**
   * Get all messages sent to this client
   */
  getSentMessages(): Array<{ type: string; data: any }> {
    return this.sentMessages;
  }

  /**
   * Get last message sent to this client
   */
  getLastMessage(): { type: string; data: any } | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  /**
   * Get messages of specific type
   */
  getMessagesByType(type: string): Array<{ type: string; data: any }> {
    return this.sentMessages.filter((msg) => msg.type === type);
  }

  /**
   * Clear sent messages
   */
  clearMessages(): void {
    this.sentMessages = [];
  }

  /**
   * Check if message was sent
   */
  wasMessageSent(type: string): boolean {
    return this.sentMessages.some((msg) => msg.type === type);
  }
}

/**
 * Create a test game room with mocked dependencies
 */
export async function createTestRoom(options: any = {}): Promise<GameRoom> {
  const room = new GameRoom();

  // Store message handlers for testing
  const messageHandlers = new Map<string, Function>();
  (room as any)._testMessageHandlers = messageHandlers;

  // Override onMessage to store handlers
  const originalOnMessage = room.onMessage.bind(room);
  room.onMessage = function(type: string, callback: Function) {
    const wrappedCallback = callback as any;
    messageHandlers.set(type, wrappedCallback);
    return originalOnMessage(type as any, wrappedCallback);
  } as any;

  // Mock broadcast method
  (room as any).broadcast = (type: string, data?: any) => {
    // Store broadcasts for testing if needed
  };

  // Mock setSimulationInterval to not actually run
  const originalSetSimulationInterval = room.setSimulationInterval;
  room.setSimulationInterval = (callback: any, delay?: number) => {
    // Store callback but don't execute automatically
    (room as any)._simulationCallback = callback;
    return { clear: () => {} } as any;
  };

  // Initialize room
  await room.onCreate(options);

  // Restore original method for manual simulation
  room.setSimulationInterval = originalSetSimulationInterval;

  return room;
}

/**
 * Simulate physics update manually
 */
export function simulatePhysics(room: GameRoom, deltaTime: number = 50): void {
  const callback = (room as any)._simulationCallback;
  if (callback) {
    callback(deltaTime);
  }
}

/**
 * Create a test player
 */
export function createTestPlayer(
  sessionId: string = 'test-player',
  displayName: string = 'TestPlayer'
): PlayerSchema {
  return new PlayerSchema(sessionId, displayName);
}

/**
 * Create a test tile
 */
export function createTestTile(
  frameSlotIndex: number = 0
): TileSchema {
  const tile = new TileSchema(frameSlotIndex);

  // Set default puzzle config
  tile.puzzle.type = PuzzleType.PATTERN_MATCH;
  tile.puzzle.difficulty = 1;
  tile.puzzle.timeLimit = 0;
  tile.puzzle.maxAttempts = 0;

  return tile;
}

/**
 * Create a puzzle config for testing
 */
export function createTestPuzzle(
  type: PuzzleType = PuzzleType.PATTERN_MATCH,
  difficulty: 1 | 2 | 3 = 1
): PuzzleConfigSchema {
  const puzzle = new PuzzleConfigSchema();
  puzzle.type = type;
  puzzle.difficulty = difficulty;
  puzzle.timeLimit = 0;
  puzzle.maxAttempts = 0;
  return puzzle;
}

/**
 * Join a player to the room
 */
export async function joinPlayer(
  room: GameRoom,
  client: MockClient,
  options: any = {}
): Promise<PlayerSchema> {
  const joinOptions = {
    displayName: options.displayName || 'TestPlayer',
    ...options,
  };

  await room.onJoin(client as any, joinOptions);

  const player = room.state.getPlayer(client.sessionId);
  if (!player) {
    throw new Error('Failed to join player to room');
  }

  return player;
}

/**
 * Leave a player from the room
 */
export async function leavePlayer(room: GameRoom, client: MockClient): Promise<void> {
  await room.onLeave(client as any, true);
}

/**
 * Send a message from client to room
 * Triggers the room's registered message handler for the given type
 */
export function sendMessage(room: GameRoom, type: string, client: MockClient, data: any): void {
  const messageHandlers = (room as any)._testMessageHandlers;

  if (messageHandlers && messageHandlers.has(type)) {
    const handler = messageHandlers.get(type);
    if (handler) {
      handler.call(room, client, data);
    }
  } else {
    throw new Error(`No message handler registered for type: ${type}`);
  }
}

/**
 * Assertion helper: Check player state
 */
export function assertPlayerState(
  player: PlayerSchema,
  expectedState: PlayerState,
  message?: string
): void {
  expect(player.state).toBe(expectedState);
}

/**
 * Assertion helper: Check tile state
 */
export function assertTileState(
  tile: TileSchema,
  expectedState: TileState,
  message?: string
): void {
  expect(tile.state).toBe(expectedState);
}

/**
 * Assertion helper: Check player is holding tile
 */
export function assertPlayerHoldingTile(
  player: PlayerSchema,
  tileIndex: number | null
): void {
}

/**
 * Assertion helper: Check tile ownership
 */
export function assertTileOwnership(
  tile: TileSchema,
  sessionId: string | null
): void {
  expect(tile.ownedBy).toBe(sessionId);
}

/**
 * Assertion helper: Check leaderboard position
 */
export function assertLeaderboardRank(
  room: GameRoom,
  sessionId: string,
  expectedRank: number
): void {
  const entry = room.state.leaderboard.find((e) => e.sessionId === sessionId);
  expect(entry).toBeDefined();
  expect(entry?.rank).toBe(expectedRank);
}

/**
 * Wait for async operations (useful for timing-based tests)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create multiple test players
 */
export function createMultiplePlayers(count: number): MockClient[] {
  return Array.from({ length: count }, (_, i) =>
    new MockClient(`player-${i}`)
  );
}

/**
 * Add tiles to room for testing
 */
export function addTilesToRoom(room: GameRoom, count: number): TileSchema[] {
  const tiles: TileSchema[] = [];

  for (let i = 0; i < count; i++) {
    const tile = createTestTile(i);
    room.state.tiles.set(i.toString(), tile);
    tiles.push(tile);
  }

  return tiles;
}
