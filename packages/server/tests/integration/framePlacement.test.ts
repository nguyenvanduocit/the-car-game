import { test, expect, describe, beforeEach } from 'bun:test';
import { GameRoom } from '../../src/rooms/GameRoom';
import { PlayerState, TileState, isFrameSlotEmpty } from '@blockgame/shared';
import {
  MockClient,
  createTestRoom,
  joinPlayer,
  sendMessage,
  addTilesToRoom,
  assertPlayerState,
  assertTileState,
  assertPlayerHoldingTile,
  assertLeaderboardRank,
} from '../utils/testHelpers';

describe('Frame Placement Integration', () => {
  let room: GameRoom;
  let client: MockClient;

  beforeEach(async () => {
    room = await createTestRoom({ tileCount: 20 });
    client = new MockClient('player-1');
    await joinPlayer(room, client, { displayName: 'TestPlayer' });

    // Add tiles to room
    addTilesToRoom(room, 20);
  });

  describe('Successful Placement', () => {
    test('should place tile in correct slot', async () => {
      const tile = room.state.tiles.values().next().value!;
      const slotIndex = tile.frameSlotIndex;

      // Lock, solve, and hold tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      expect(tile.state).toBe(TileState.LOCKED);
      expect(isFrameSlotEmpty(room.state.frameSlots[slotIndex])).toBe(true);

      client.clearMessages();

      // Place tile
      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile.frameSlotIndex,
        slotIndex: slotIndex,
      });

      expect(tile.state).toBe(TileState.PLACED);
      expect(room.state.frameSlots[slotIndex]).toBe(tile.frameSlotIndex.toString());
    });

    test('should update player state to IDLE after placement', async () => {
      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;
      const slotIndex = tile.frameSlotIndex;

      // Get tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      // After puzzle success, tile is auto-placed and player returns to IDLE
      assertPlayerState(player!, PlayerState.IDLE);

      // Note: frame_place message is redundant after puzzle success (tile already auto-placed)
      // This test verifies the system handles redundant placement gracefully
      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile.frameSlotIndex,
        slotIndex: slotIndex,
      });

      assertPlayerState(player!, PlayerState.IDLE);
    });

    test('should increment player tilesPlaced counter', async () => {
      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;
      const slotIndex = tile.frameSlotIndex;

      expect(player?.tilesPlaced).toBe(0);

      // Get and place tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });
      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile.frameSlotIndex,
        slotIndex: slotIndex,
      });

      expect(player?.tilesPlaced).toBe(1);
    });

    test('should broadcast tile_placed message to all clients', async () => {
      const client2 = new MockClient('player-2');
      await joinPlayer(room, client2, { displayName: 'Player2' });

      const tile = room.state.tiles.values().next().value!;
      const slotIndex = tile.frameSlotIndex;

      // Get and place tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      // Mock broadcast for testing
      let broadcastCalled = false;
      let broadcastData: any;
      const originalBroadcast = (room as any).broadcast;
      (room as any).broadcast = (type: string, data: any) => {
        if (type === 'tile_placed') {
          broadcastCalled = true;
          broadcastData = data;
        }
      };

      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile.frameSlotIndex,
        slotIndex: slotIndex,
      });

      expect(broadcastCalled).toBe(true);
      expect(broadcastData.tileId).toBe(tile.frameSlotIndex);
      expect(broadcastData.slotIndex).toBe(slotIndex);
      expect(broadcastData.sessionId).toBe(client.sessionId);

      // Restore
      (room as any).broadcast = originalBroadcast;
    });

    test('should update leaderboard after placement', async () => {
      const tile = room.state.tiles.values().next().value!;
      const slotIndex = tile.frameSlotIndex;

      // Get and place tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });
      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile.frameSlotIndex,
        slotIndex: slotIndex,
      });

      assertLeaderboardRank(room, client.sessionId, 1);

      const leaderboardEntry = room.state.leaderboard[0];
      expect(leaderboardEntry.tilesPlaced).toBe(1);
    });
  });

  describe('Placement Validation', () => {
    test('should reject placement in wrong slot', async () => {
      const tile = room.state.tiles.values().next().value!;
      const correctSlot = tile.frameSlotIndex;
      const wrongSlot = (correctSlot + 1) % 20; // Different slot

      // Get tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      client.clearMessages();

      // Try to place in wrong slot
      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile.frameSlotIndex,
        slotIndex: wrongSlot,
      });

      // Placement should fail
      expect(tile.state).toBe(TileState.LOCKED); // Still held
      expect(isFrameSlotEmpty(room.state.frameSlots[wrongSlot])).toBe(true); // Slot still empty
      expect(client.wasMessageSent('placement_failed')).toBe(true);
    });

    test('should reject placement when player not holding tile', async () => {
      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;
      const slotIndex = tile.frameSlotIndex;


      client.clearMessages();

      // Try to place without holding
      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile.frameSlotIndex,
        slotIndex: slotIndex,
      });

      expect(client.wasMessageSent('placement_failed')).toBe(true);
      expect(isFrameSlotEmpty(room.state.frameSlots[slotIndex])).toBe(true);
    });

    test('should reject placement when slot already occupied', async () => {
      const tiles = Array.from(room.state.tiles.values());
      const tile1 = tiles[0];
      const tile2 = tiles[1];

      // Force both tiles to target same slot
      tile2.frameSlotIndex = tile1.frameSlotIndex;
      const slotIndex = tile1.frameSlotIndex;

      // Place first tile
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile1.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile1.frameSlotIndex,
        success: true,
      });
      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile1.frameSlotIndex,
        slotIndex: slotIndex,
      });

      expect(room.state.frameSlots[slotIndex]).toBe(tile1.frameSlotIndex.toString());

      // Try to place second tile in same slot
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile2.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile2.frameSlotIndex,
        success: true,
      });

      client.clearMessages();

      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile2.frameSlotIndex,
        slotIndex: slotIndex,
      });

      // Second placement should fail
      expect(client.wasMessageSent('placement_failed')).toBe(true);
      expect(room.state.frameSlots[slotIndex]).toBe(tile1.frameSlotIndex.toString()); // Still first tile
      expect(tile2.state).toBe(TileState.LOCKED); // Second tile still held
    });

    test('should reject placement of non-existent tile', async () => {
      client.clearMessages();

      sendMessage(room, 'frame_place', client as any, {
        tileIndex: 'non-existent-tile',
        slotIndex: 0,
      });

      expect(client.wasMessageSent('placement_failed')).toBe(true);
      expect(isFrameSlotEmpty(room.state.frameSlots[0])).toBe(true);
    });

    test('should reject placement from non-existent player', async () => {
      const fakeClient = new MockClient('non-existent-player');
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'frame_place', fakeClient as any, {
        tileIndex: tile.frameSlotIndex,
        slotIndex: tile.frameSlotIndex,
      });

      expect(isFrameSlotEmpty(room.state.frameSlots[tile.frameSlotIndex])).toBe(true);
    });

    test('should reject placement when player holding different tile', async () => {
      const tiles = Array.from(room.state.tiles.values());
      const tile1 = tiles[0];
      const tile2 = tiles[1];

      // Player holds tile1
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile1.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile1.frameSlotIndex,
        success: true,
      });

      const player = room.state.getPlayer(client.sessionId);

      client.clearMessages();

      // Try to place tile2 (not held)
      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile2.frameSlotIndex,
        slotIndex: tile2.frameSlotIndex,
      });

      expect(client.wasMessageSent('placement_failed')).toBe(true);
      expect(isFrameSlotEmpty(room.state.frameSlots[tile2.frameSlotIndex])).toBe(true);
    });
  });


  describe('Multiple Players Placing', () => {
    test('should handle multiple players placing different tiles', async () => {
      const client2 = new MockClient('player-2');
      await joinPlayer(room, client2, { displayName: 'Player2' });

      const tiles = Array.from(room.state.tiles.values());
      const tile1 = tiles[0];
      const tile2 = tiles[1];

      // Player 1 places tile 1
      sendMessage(room, 'tile_click', client as any, { tileIndex: tile1.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile1.frameSlotIndex,
        success: true,
      });
      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile1.frameSlotIndex,
        slotIndex: tile1.frameSlotIndex,
      });

      // Player 2 places tile 2
      sendMessage(room, 'tile_click', client2 as any, { tileIndex: tile2.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client2 as any, {
        tileIndex: tile2.frameSlotIndex,
        success: true,
      });
      sendMessage(room, 'frame_place', client2 as any, {
        tileIndex: tile2.frameSlotIndex,
        slotIndex: tile2.frameSlotIndex,
      });

      expect(room.state.frameSlots[tile1.frameSlotIndex]).toBe(tile1.frameSlotIndex.toString());
      expect(room.state.frameSlots[tile2.frameSlotIndex]).toBe(tile2.frameSlotIndex.toString());

      const player1 = room.state.getPlayer(client.sessionId);
      const player2 = room.state.getPlayer(client2.sessionId);

      expect(player1?.tilesPlaced).toBe(1);
      expect(player2?.tilesPlaced).toBe(1);
    });

    test('should rank players correctly in leaderboard', async () => {
      const client2 = new MockClient('player-2');
      const client3 = new MockClient('player-3');
      await joinPlayer(room, client2, { displayName: 'Player2' });
      await joinPlayer(room, client3, { displayName: 'Player3' });

      const tiles = Array.from(room.state.tiles.values());

      // Player 1 places 3 tiles
      for (let i = 0; i < 3; i++) {
        const tile = tiles[i];
        sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
        sendMessage(room, 'puzzle_submit', client as any, {
          tileIndex: tile.frameSlotIndex,
          success: true,
        });
        sendMessage(room, 'frame_place', client as any, {
          tileIndex: tile.frameSlotIndex,
          slotIndex: tile.frameSlotIndex,
        });
      }

      // Player 2 places 1 tile
      const tile2 = tiles[3];
      sendMessage(room, 'tile_click', client2 as any, { tileIndex: tile2.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client2 as any, {
        tileIndex: tile2.frameSlotIndex,
        success: true,
      });
      sendMessage(room, 'frame_place', client2 as any, {
        tileIndex: tile2.frameSlotIndex,
        slotIndex: tile2.frameSlotIndex,
      });

      // Player 3 places 2 tiles
      for (let i = 4; i < 6; i++) {
        const tile = tiles[i];
        sendMessage(room, 'tile_click', client3 as any, { tileIndex: tile.frameSlotIndex });
        sendMessage(room, 'puzzle_submit', client3 as any, {
          tileIndex: tile.frameSlotIndex,
          success: true,
        });
        sendMessage(room, 'frame_place', client3 as any, {
          tileIndex: tile.frameSlotIndex,
          slotIndex: tile.frameSlotIndex,
        });
      }

      // Check leaderboard rankings
      assertLeaderboardRank(room, client.sessionId, 1); // 3 tiles
      assertLeaderboardRank(room, client3.sessionId, 2); // 2 tiles
      assertLeaderboardRank(room, client2.sessionId, 3); // 1 tile
    });
  });

  describe('Edge Cases', () => {
    test('should handle placement with missing slotIndex', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      client.clearMessages();

      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile.frameSlotIndex,
        // missing slotIndex
      });

      expect(client.wasMessageSent('placement_failed')).toBe(true);
    });

    test('should handle negative slotIndex', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      client.clearMessages();

      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile.frameSlotIndex,
        slotIndex: -1,
      });

      expect(client.wasMessageSent('placement_failed')).toBe(true);
    });

    test('should handle out-of-bounds slotIndex', async () => {
      const tile = room.state.tiles.values().next().value!;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      client.clearMessages();

      sendMessage(room, 'frame_place', client as any, {
        tileIndex: tile.frameSlotIndex,
        slotIndex: 999, // Out of bounds
      });

      expect(client.wasMessageSent('placement_failed')).toBe(true);
    });

    test('should handle rapid placement attempts', async () => {
      const tile = room.state.tiles.values().next().value!;
      const slotIndex = tile.frameSlotIndex;

      sendMessage(room, 'tile_click', client as any, { tileIndex: tile.frameSlotIndex });
      sendMessage(room, 'puzzle_submit', client as any, {
        tileIndex: tile.frameSlotIndex,
        success: true,
      });

      // Place multiple times rapidly
      for (let i = 0; i < 5; i++) {
        sendMessage(room, 'frame_place', client as any, {
          tileIndex: tile.frameSlotIndex,
          slotIndex: slotIndex,
        });
      }

      // Should only process first placement
      expect(room.state.frameSlots[slotIndex]).toBe(tile.frameSlotIndex.toString());

      const player = room.state.getPlayer(client.sessionId);
      expect(player?.tilesPlaced).toBe(1); // Only counted once
    });
  });
});
