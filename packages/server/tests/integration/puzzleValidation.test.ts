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
  assertPlayerHoldingTile,
  assertTileOwnership,
} from '../utils/testHelpers';

describe('Puzzle Validation Integration', () => {
  let room: GameRoom;
  let client: MockClient;

  beforeEach(async () => {
    room = await createTestRoom({ tileCount: 20 });
    client = new MockClient('player-1');
    await joinPlayer(room, client, { displayName: 'TestPlayer' });

    // Add tiles to room
    addTilesToRoom(room, 20);
  });

  describe('Successful Puzzle Completion', () => {
    test('should mark tile as HELD when puzzle submitted successfully', async () => {
      const tile = room.state.tiles.values().next().value!;

      // Lock tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      expect(tile.state).toBe(TileState.LOCKED);

      client.clearMessages();

      // Submit successful puzzle
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      expect(tile.state).toBe(TileState.LOCKED);
    });

    test('should update player state to IDLE on success (tile auto-placed)', async () => {
      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;

      // Lock tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      assertPlayerState(player!, PlayerState.SOLVING_PUZZLE);

      // Submit successful puzzle (tile auto-placed, player returns to IDLE)
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      assertPlayerState(player!, PlayerState.IDLE);
    });

    test('should set tile to FLYING state on success', async () => {
      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;

      // Lock and solve
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      // Tile should be FLYING to frame
      expect(tile.state).toBe(TileState.FLYING);
      // Player should return to IDLE
      assertPlayerState(player!, PlayerState.IDLE);
    });

    test('should send puzzle_success message to client', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      client.clearMessages();

      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      expect(client.wasMessageSent('puzzle_success')).toBe(true);

      const successMsg = client.getMessagesByType('puzzle_success')[0];
      expect(successMsg.data.tileIndex).toBe(tile.frameSlotIndex);
    });

    test('should clear lockedAt timestamp on success', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      expect(tile.lockedAt).toBeGreaterThan(0);

      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      expect(tile.lockedAt).toBeNull();
    });

    test('should maintain tile ownership on success', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      expect(tile.ownedBy).toBe(client.sessionId);

      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      expect(tile.ownedBy).toBe(client.sessionId);
    });
  });

  describe('Failed Puzzle Completion', () => {
    test('should return tile to floor when puzzle fails', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      expect(tile.state).toBe(TileState.LOCKED);

      client.clearMessages();

      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: false,
      });

      assertTileState(tile, TileState.ON_FLOOR);
    });

    test('should return player to IDLE state on failure', async () => {
      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      assertPlayerState(player!, PlayerState.SOLVING_PUZZLE);

      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: false,
      });

      assertPlayerState(player!, PlayerState.IDLE);
    });

    test('should clear tile ownership on failure', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      expect(tile.ownedBy).toBe(client.sessionId);

      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: false,
      });

      assertTileOwnership(tile, null);
    });

    test('should send puzzle_failed message to client', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      client.clearMessages();

      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: false,
      });

      expect(client.wasMessageSent('puzzle_failed')).toBe(true);

      const failMsg = client.getMessagesByType('puzzle_failed')[0];
      expect(failMsg.data.tileIndex).toBe(tile.frameSlotIndex);
    });

    test('should clear lockedAt timestamp on failure', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      expect(tile.lockedAt).toBeGreaterThan(0);

      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: false,
      });

      expect(tile.lockedAt).toBeNull();
    });

    test('player should not be holding tile after failure', async () => {
      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: false,
      });

      assertPlayerHoldingTile(player!, null);
    });
  });

  describe('Validation Rules', () => {
    test('should reject submission from player who does not own tile', async () => {
      const client2 = new MockClient('player-2');
      await joinPlayer(room, client2, { displayName: 'Player2' });

      const tile = room.state.tiles.values().next().value!;

      // Player 1 locks tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      expect(tile.ownedBy).toBe(client.sessionId);

      // Player 2 tries to submit puzzle
      sendMessage(room, 'puzzle_submit', client2 as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      // Tile should still be locked to player 1
      expect(tile.state).toBe(TileState.LOCKED);
      expect(tile.ownedBy).toBe(client.sessionId);

      // Player 2 should not be holding the tile
      const player2 = room.state.getPlayer(client2.sessionId);
      assertPlayerHoldingTile(player2!, null);
    });

    test('should reject submission for non-existent tile', async () => {
      const player = room.state.getPlayer(client.sessionId);

      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: 'non-existent-tile',
        success: true,
      });

      // Player state should remain unchanged
      assertPlayerState(player!, PlayerState.IDLE);
    });

    test('should reject submission from non-existent player', async () => {
      const fakeClient = new MockClient('non-existent-player');
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      sendMessage(room, 'puzzle_submit', fakeClient as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      // Tile should still be locked to original player
      expect(tile.state).toBe(TileState.LOCKED);
      expect(tile.ownedBy).toBe(client.sessionId);
    });

    test('should handle missing success field in submission', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        // missing success field
      });

      // Should treat as failure (undefined != true)
      expect(tile.state).toBe(TileState.ON_FLOOR);
    });

    test('should handle missing tileId in submission', async () => {
      const player = room.state.getPlayer(client.sessionId);

      sendMessage(room, 'puzzle_submit', client as any, {
        success: true,
        // missing tileId
      });

      // Player state should remain unchanged
      assertPlayerState(player!, PlayerState.IDLE);
    });
  });

  describe('Multiple Puzzle Attempts', () => {
    test('should allow retry after failed puzzle', async () => {
      const tile = room.state.tiles.values().next().value!;

      // First attempt - fail
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: false,
      });

      expect(tile.state).toBe(TileState.ON_FLOOR);

      // Second attempt - lock again
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      expect(tile.state).toBe(TileState.LOCKED);
      expect(tile.ownedBy).toBe(client.sessionId);
    });

    test('should allow success after multiple failures', async () => {
      const tile = room.state.tiles.values().next().value!;

      // Fail twice
      for (let i = 0; i < 2; i++) {
        sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
        sendMessage(room, 'puzzle_submit', client as any, {
          tileIndex: tile.frameSlotIndex,
          success: false,
        });
      }

      // Succeed third time
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      expect(tile.state).toBe(TileState.LOCKED);
      const player = room.state.getPlayer(client.sessionId);
      assertPlayerHoldingTile(player!, tile.frameSlotIndex);
    });
  });

  describe('Concurrent Submissions', () => {
    test('should handle multiple players solving different puzzles', async () => {
      const client2 = new MockClient('player-2');
      await joinPlayer(room, client2, { displayName: 'Player2' });

      const tiles = Array.from(room.state.tiles.values());
      const tile1 = tiles[0];
      const tile2 = tiles[1];

      // Both players lock different tiles
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile1.frameSlotIndex });
      sendMessage(room, 'tile_click', client2 as any, { tileIndex: tile2.frameSlotIndex });

      // Both players submit successfully
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile1.frameSlotIndex,
        success: true,
      });
      sendMessage(room, 'puzzle_submit', client2 as any, {
        tileIndex: tile2.frameSlotIndex,
        success: true,
      });

      // Both should be holding their respective tiles
      const player1 = room.state.getPlayer(client.sessionId);
      const player2 = room.state.getPlayer(client2.sessionId);

      assertPlayerHoldingTile(player1!, tile1.frameSlotIndex);
      assertPlayerHoldingTile(player2!, tile2.frameSlotIndex);

      expect(tile1.state).toBe(TileState.LOCKED);
      expect(tile2.state).toBe(TileState.LOCKED);
    });

    test('should handle one success and one failure simultaneously', async () => {
      const client2 = new MockClient('player-2');
      await joinPlayer(room, client2, { displayName: 'Player2' });

      const tiles = Array.from(room.state.tiles.values());
      const tile1 = tiles[0];
      const tile2 = tiles[1];

      // Both lock tiles
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile1.frameSlotIndex });
      sendMessage(room, 'tile_click', client2 as any, { tileIndex: tile2.frameSlotIndex });

      // Player 1 succeeds, Player 2 fails
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile1.frameSlotIndex,
        success: true,
      });
      sendMessage(room, 'puzzle_submit', client2 as any, {
        tileIndex: tile2.frameSlotIndex,
        success: false,
      });

      expect(tile1.state).toBe(TileState.LOCKED);
      expect(tile2.state).toBe(TileState.ON_FLOOR);

      const player1 = room.state.getPlayer(client.sessionId);
      const player2 = room.state.getPlayer(client2.sessionId);

      assertPlayerState(player1!, PlayerState.IDLE); // Player1 returned to IDLE after tile auto-placed
      assertPlayerState(player2!, PlayerState.IDLE);
    });
  });

  describe('Edge Cases', () => {
    test('should handle rapid submission spam', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      // Submit multiple times rapidly
      for (let i = 0; i < 5; i++) {
        sendMessage(room, 'puzzle_submit', client as any, {
          tileIndex: tile.frameSlotIndex,
          success: true,
        });
      }

      // Should only process first submission (tile should be FLYING after success)
      expect(tile.state).toBe(TileState.FLYING);

      const player = room.state.getPlayer(client.sessionId);
      assertPlayerState(player!, PlayerState.IDLE);
    });

    test('should handle submission for tile in wrong state', async () => {
      const tile = room.state.tiles.values().next().value!;

      // Try to submit without locking first
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      // Tile should remain on floor
      expect(tile.state).toBe(TileState.ON_FLOOR);
    });

    test('should handle submission with extra fields', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });

      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
        extraField1: 'ignored',
        extraField2: 123,
      });

      // Should process normally, ignoring extra fields
      expect(tile.state).toBe(TileState.LOCKED);
    });

    test('should handle boolean-like values for success field', async () => {
      const tiles = Array.from(room.state.tiles.values());

      // Test with truthy value (number)
      const tile1 = tiles[0];
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile1.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile1.frameSlotIndex,
        success: 1, // truthy but not true
      });
      // Should fail (only true === true)
      expect(tile1.state).toBe(TileState.ON_FLOOR);

      // Test with false
      const tile2 = tiles[1];
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile2.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile2.frameSlotIndex,
        success: false,
      });
      expect(tile2.state).toBe(TileState.ON_FLOOR);

      // Test with true
      const tile3 = tiles[2];
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile3.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile3.frameSlotIndex,
        success: true,
      });
      expect(tile3.state).toBe(TileState.LOCKED);
    });
  });

  describe('State Consistency', () => {
    test('player and tile states should be consistent after success', async () => {
      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      expect(player?.state).toBe(PlayerState.IDLE);

      // Tile state check (after success, tile is FLYING to frame)
      expect(tile.state).toBe(TileState.FLYING);
      expect(tile.ownedBy).toBe(client.sessionId);
    });

    test('player and tile states should be consistent after failure', async () => {
      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: false,
      });

      // Player state check
      expect(player?.state).toBe(PlayerState.IDLE);

      // Tile state check
      expect(tile.state).toBe(TileState.ON_FLOOR);
      expect(tile.ownedBy).toBeNull();
    });
  });
});
