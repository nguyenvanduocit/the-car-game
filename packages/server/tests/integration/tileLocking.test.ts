import { test, expect, describe, beforeEach } from 'bun:test';
import { GameRoom } from '../../src/rooms/GameRoom';
import { PlayerState, TileState } from '@blockgame/shared';
import {
  MockClient,
  createTestRoom,
  joinPlayer,
  sendMessage,
  addTilesToRoom,
  assertPlayerState,
  assertTileState,
  assertTileOwnership,
} from '../utils/testHelpers';

describe('Tile Locking Integration', () => {
  let room: GameRoom;
  let client: MockClient;

  beforeEach(async () => {
    room = await createTestRoom({ tileCount: 20 });
    client = new MockClient('player-1');
    await joinPlayer(room, client, { displayName: 'TestPlayer' });

    // Add tiles to room
    addTilesToRoom(room, 20);
  });

  describe('Tile Click and Lock', () => {
    test('should lock tile when player clicks on it', async () => {
      const tile = room.state.tiles.values().next().value!;

      expect(tile.state).toBe(TileState.ON_FLOOR);
      expect(tile.ownedBy).toBeNull();

      // Simulate tile click
      const handlers = (room as any).onMessage.bind(room);
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      expect(tile.state).toBe(TileState.LOCKED);
      expect(tile.ownedBy).toBe(client.sessionId);
      expect(tile.lockedAt).toBeGreaterThan(0);
    });

    test('should update player state to SOLVING_PUZZLE when tile locked', async () => {
      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;

      assertPlayerState(player!, PlayerState.IDLE);

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      assertPlayerState(player!, PlayerState.SOLVING_PUZZLE);
    });

    test('should send show_puzzle message to client', async () => {
      const tile = room.state.tiles.values().next().value!;

      client.clearMessages();

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      expect(client.wasMessageSent('show_puzzle')).toBe(true);

      const puzzleMsg = client.getMessagesByType('show_puzzle')[0];
      expect(puzzleMsg.data.tileIndex).toBe(tile.frameSlotIndex);
      expect(puzzleMsg.data.puzzle).toBeDefined();
    });

    test('should prevent locking already locked tile', async () => {
      const tile = room.state.tiles.values().next().value!;
      const client2 = new MockClient('player-2');
      await joinPlayer(room, client2, { displayName: 'Player2' });

      // First player locks tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      expect(tile.ownedBy).toBe(client.sessionId);

      // Second player tries to lock same tile
      sendMessage(room, 'tile_click', client2 as any, { tileIndex: tile.frameSlotIndex });

      // Tile should still belong to first player
      expect(tile.ownedBy).toBe(client.sessionId);
      expect(tile.state).toBe(TileState.LOCKED);
    });

    test('should prevent locking tile that is held', async () => {
      const tile = room.state.tiles.values().next().value!;

      // Set tile to locked state
      tile.lockToPlayer(client.sessionId);

      const client2 = new MockClient('player-2');
      await joinPlayer(room, client2, { displayName: 'Player2' });

      // Try to lock already-locked tile
      sendMessage(room, 'tile_click', client2 as any, { tileIndex: tile.frameSlotIndex });

      // Tile should still be locked by original player
      expect(tile.state).toBe(TileState.LOCKED);
      expect(tile.ownedBy).toBe(client.sessionId);
    });

    test('should prevent locking tile that is placed', async () => {
      const tile = room.state.tiles.values().next().value!;

      // Set tile to placed state directly (placeInFrame removed - tiles are removed when placed)
      tile.state = TileState.PLACED;

      const client2 = new MockClient('player-2');
      await joinPlayer(room, client2, { displayName: 'Player2' });

      // Try to lock placed tile
      sendMessage(room, 'tile_click', client2 as any, { tileIndex: tile.frameSlotIndex });

      // Tile should still be placed
      expect(tile.state).toBe(TileState.PLACED);
    });
  });

  describe('Multiple Tiles', () => {
    test('should allow player to lock different tile after completing puzzle', async () => {
      const tiles = Array.from(room.state.tiles.values());
      const tile1 = tiles[0];
      const tile2 = tiles[1];

      // Lock first tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile1.frameSlotIndex });
      expect(tile1.state).toBe(TileState.LOCKED);

      // Complete puzzle (simulate success) - tile auto-placed
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile1.frameSlotIndex,
        success: true,
      });
      // After success, tile is FLYING to frame
      expect(tile1.state).toBe(TileState.FLYING);

      const player = room.state.getPlayer(client.sessionId);

      // Lock second tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile2.frameSlotIndex });
      expect(tile2.state).toBe(TileState.LOCKED);
      expect(tile2.ownedBy).toBe(client.sessionId);
    });

    test('should allow different players to lock different tiles simultaneously', async () => {
      const client2 = new MockClient('player-2');
      await joinPlayer(room, client2, { displayName: 'Player2' });

      const tiles = Array.from(room.state.tiles.values());
      const tile1 = tiles[0];
      const tile2 = tiles[1];

      // Player 1 locks tile 1
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile1.frameSlotIndex });

      // Player 2 locks tile 2
      sendMessage(room, 'tile_click', client2 as any, { tileIndex: tile2.frameSlotIndex });

      expect(tile1.state).toBe(TileState.LOCKED);
      expect(tile1.ownedBy).toBe(client.sessionId);

      expect(tile2.state).toBe(TileState.LOCKED);
      expect(tile2.ownedBy).toBe(client2.sessionId);
    });
  });

  describe('Lock Timestamp', () => {
    test('should set lockedAt timestamp when locking tile', async () => {
      const tile = room.state.tiles.values().next().value!;
      const beforeLock = Date.now();

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      expect(tile.lockedAt).toBeGreaterThanOrEqual(beforeLock);
      expect(tile.lockedAt).toBeLessThanOrEqual(Date.now());
    });

    test('lockedAt should be null for unlocked tiles', async () => {
      const tile = room.state.tiles.values().next().value!;

      expect(tile.lockedAt).toBeNull();
    });
  });

  describe('Invalid Scenarios', () => {
    test('should handle click on non-existent tile gracefully', async () => {
      const player = room.state.getPlayer(client.sessionId);

      sendMessage(room, 'tile_click', client as any, { tileIndex: 'invalid-tile-id' });

      // Player state should remain IDLE
      assertPlayerState(player!, PlayerState.IDLE);
    });

    test('should handle click from non-existent player gracefully', async () => {
      const fakeClient = new MockClient('non-existent-player');
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', fakeClient as any, { tileIndex: tile.frameSlotIndex });

      // Tile should remain on floor (not locked)
      assertTileState(tile, TileState.ON_FLOOR);
      assertTileOwnership(tile, null);
    });

    test('should handle missing tileId in message', async () => {
      const player = room.state.getPlayer(client.sessionId);

      sendMessage(room, 'tile_click', client as any, {});

      // Player should remain in IDLE state
      assertPlayerState(player!, PlayerState.IDLE);
    });
  });

  describe('Concurrent Locking', () => {
    test('should handle race condition when two players click same tile', async () => {
      const client2 = new MockClient('player-2');
      await joinPlayer(room, client2, { displayName: 'Player2' });

      const tile = room.state.tiles.values().next().value!;

      // Both players click at "same time" (sequential in test)
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'tile_click', client2 as any, { tileIndex: tile.frameSlotIndex });

      // Only first player should own the tile
      expect(tile.state).toBe(TileState.LOCKED);
      expect(tile.ownedBy).toBe(client.sessionId);

      // Second player should not have locked the tile
      const player2 = room.state.getPlayer(client2.sessionId);
      expect(player2?.state).toBe(PlayerState.IDLE);
    });
  });

  describe('Tile State Consistency', () => {
    test('tile state should match ownership', async () => {
      const tile = room.state.tiles.values().next().value!;

      // ON_FLOOR state should have no owner
      expect(tile.state).toBe(TileState.ON_FLOOR);
      expect(tile.ownedBy).toBeNull();

      // Lock tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      // LOCKED state should have owner
      expect(tile.state).toBe(TileState.LOCKED);
      expect(tile.ownedBy).toBe(client.sessionId);
    });

    test('lockedAt should be null when tile is on floor', async () => {
      const tile = room.state.tiles.values().next().value!;

      expect(tile.state).toBe(TileState.ON_FLOOR);
      expect(tile.lockedAt).toBeNull();
    });

    test('lockedAt should be set when tile is locked', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      expect(tile.state).toBe(TileState.LOCKED);
      expect(tile.lockedAt).not.toBeNull();
    });
  });

  describe('Player State Consistency', () => {
    test('player should be in SOLVING_PUZZLE state after locking tile', async () => {
      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;

      expect(player?.state).toBe(PlayerState.IDLE);

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      expect(player?.state).toBe(PlayerState.SOLVING_PUZZLE);
    });

    test('player should not hold tile immediately after locking', async () => {
      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      expect(tile.state).toBe(TileState.LOCKED);
    });
  });

  describe('Edge Cases', () => {
    test('should handle player clicking multiple tiles rapidly', async () => {
      const tiles = Array.from(room.state.tiles.values()).slice(0, 3);

      // Click three tiles rapidly
      sendMessage(room, 'tile_click', client as any, { tileIndex: tiles[0].frameSlotIndex });
      sendMessage(room, 'tile_click', client as any, { tileIndex: tiles[1].frameSlotIndex });
      sendMessage(room, 'tile_click', client as any, { tileIndex: tiles[2].frameSlotIndex });

      // Only first tile should be locked
      expect(tiles[0].state).toBe(TileState.LOCKED);
      expect(tiles[0].ownedBy).toBe(client.sessionId);

      // Other tiles should not be locked (player already solving puzzle)
      expect(tiles[1].state).toBe(TileState.ON_FLOOR);
      expect(tiles[2].state).toBe(TileState.ON_FLOOR);
    });
  });
});
