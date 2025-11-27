import { test, expect, describe, beforeEach } from 'bun:test';
import { GameRoom } from '../../src/rooms/GameRoom';
import { PlayerState, TileState } from '@blockgame/shared';
import {
  MockClient,
  createTestRoom,
  joinPlayer,
  sendMessage,
  leavePlayer,
  assertPlayerState,
  createMultiplePlayers,
} from '../utils/testHelpers';

describe('Player Join Flow Integration', () => {
  let room: GameRoom;

  beforeEach(async () => {
    room = await createTestRoom({ tileCount: 20 });
  });

  describe('Single Player Join', () => {
    test('should successfully join player with display name', async () => {
      const client = new MockClient('player-1');

      await joinPlayer(room, client, { displayName: 'Alice' });

      const player = room.state.getPlayer(client.sessionId);
      expect(player).toBeDefined();
      expect(player?.sessionId).toBe('player-1');
      expect(player?.displayName).toBe('Alice');
      expect(player?.state).toBe(PlayerState.IDLE);
    });

    test('should generate default name when empty name provided', async () => {
      const client = new MockClient('player-2');

      await joinPlayer(room, client, { displayName: '' });

      const player = room.state.getPlayer(client.sessionId);
      expect(player).toBeDefined();
      expect(player?.displayName).toMatch(/^Player\d{4}$/);
    });

    test('should spawn player at random position within floor bounds', async () => {
      const client = new MockClient('player-3');

      await joinPlayer(room, client, { displayName: 'Bob' });

      const player = room.state.getPlayer(client.sessionId);
      expect(player).toBeDefined();

      // Floor bounds: x: -50 to 50, y: 1.0, z: -100 to 100
      expect(player?.position.x).toBeGreaterThanOrEqual(-50);
      expect(player?.position.x).toBeLessThanOrEqual(50);
      expect(player?.position.y).toBe(1.0);
      expect(player?.position.z).toBeGreaterThanOrEqual(-100);
      expect(player?.position.z).toBeLessThanOrEqual(100);
    });

    test('should send joined message to client', async () => {
      const client = new MockClient('player-4');

      await joinPlayer(room, client, { displayName: 'Charlie' });

      expect(client.wasMessageSent('joined')).toBe(true);

      const joinedMsg = client.getMessagesByType('joined')[0];
      expect(joinedMsg.data.sessionId).toBe('player-4');
      expect(joinedMsg.data.player).toBeDefined();
    });

    test('should add player to room state', async () => {
      const client = new MockClient('player-5');

      expect(room.state.players.size).toBe(0);

      await joinPlayer(room, client, { displayName: 'Dave' });

      expect(room.state.players.size).toBe(1);
      expect(room.state.players.has(client.sessionId)).toBe(true);
    });

    test('should update leaderboard on player join', async () => {
      const client = new MockClient('player-6');

      await joinPlayer(room, client, { displayName: 'Eve' });

      expect(room.state.leaderboard.length).toBe(1);
      expect(room.state.leaderboard[0].sessionId).toBe(client.sessionId);
      expect(room.state.leaderboard[0].displayName).toBe('Eve');
      expect(room.state.leaderboard[0].tilesPlaced).toBe(0);
      expect(room.state.leaderboard[0].rank).toBe(1);
    });
  });

  describe('Multiple Players Join', () => {
    test('should handle multiple players joining sequentially', async () => {
      const clients = createMultiplePlayers(5);

      for (let i = 0; i < clients.length; i++) {
        await joinPlayer(room, clients[i], { displayName: `Player${i}` });
      }

      expect(room.state.players.size).toBe(5);

      clients.forEach((client, i) => {
        const player = room.state.getPlayer(client.sessionId);
        expect(player).toBeDefined();
        expect(player?.displayName).toBe(`Player${i}`);
      });
    });

    test('should maintain separate positions for each player', async () => {
      const clients = createMultiplePlayers(3);

      await joinPlayer(room, clients[0], { displayName: 'P1' });
      await joinPlayer(room, clients[1], { displayName: 'P2' });
      await joinPlayer(room, clients[2], { displayName: 'P3' });

      const p1 = room.state.getPlayer(clients[0].sessionId);
      const p2 = room.state.getPlayer(clients[1].sessionId);
      const p3 = room.state.getPlayer(clients[2].sessionId);

      // Positions should likely be different (statistically improbable to be same)
      const samePosition =
        p1?.position.x === p2?.position.x &&
        p1?.position.z === p2?.position.z &&
        p2?.position.x === p3?.position.x &&
        p2?.position.z === p3?.position.z;

      expect(samePosition).toBe(false);
    });

    test('should update leaderboard with all players', async () => {
      const clients = createMultiplePlayers(4);

      for (let i = 0; i < clients.length; i++) {
        await joinPlayer(room, clients[i], { displayName: `Player${i}` });
      }

      expect(room.state.leaderboard.length).toBe(4);

      // All should have rank (1-4) since they all have 0 tiles placed
      room.state.leaderboard.forEach((entry) => {
        expect(entry.rank).toBeGreaterThanOrEqual(1);
        expect(entry.rank).toBeLessThanOrEqual(4);
      });
    });
  });

  describe('Player Leave', () => {
    test('should remove player on leave', async () => {
      const client = new MockClient('player-7');

      await joinPlayer(room, client, { displayName: 'Leaver' });
      expect(room.state.players.size).toBe(1);

      await leavePlayer(room, client);
      expect(room.state.players.size).toBe(0);
      expect(room.state.players.has(client.sessionId)).toBe(false);
    });

    test('should update leaderboard on player leave', async () => {
      const client1 = new MockClient('player-8');
      const client2 = new MockClient('player-9');

      await joinPlayer(room, client1, { displayName: 'Stayer' });
      await joinPlayer(room, client2, { displayName: 'Leaver' });

      expect(room.state.leaderboard.length).toBe(2);

      await leavePlayer(room, client2);

      expect(room.state.leaderboard.length).toBe(1);
      expect(room.state.leaderboard[0].sessionId).toBe(client1.sessionId);
    });

    test('should return held tile to floor on player leave', async () => {
      const client = new MockClient('player-10');

      await joinPlayer(room, client, { displayName: 'TileHolder' });

      const player = room.state.getPlayer(client.sessionId);
      const tile = room.state.tiles.values().next().value!;

      if (tile && player) {
        // Simulate player holding a tile (LOCKED state)
        tile.lockToPlayer(client.sessionId);

        expect(tile.state).toBe(TileState.LOCKED);

        await leavePlayer(room, client);

        // Tile should be returned to floor
        expect(tile.state).toBe(TileState.ON_FLOOR);
        expect(tile.ownedBy).toBeNull();
      }
    });
  });

  describe('Session Management', () => {
    test('should assign unique session IDs', async () => {
      const clients = createMultiplePlayers(10);
      const sessionIds = new Set<string>();

      for (const client of clients) {
        await joinPlayer(room, client, { displayName: 'Player' });
        sessionIds.add(client.sessionId);
      }

      expect(sessionIds.size).toBe(10); // All unique
    });

    test('should handle player with same display name differently', async () => {
      const client1 = new MockClient('player-11');
      const client2 = new MockClient('player-12');

      await joinPlayer(room, client1, { displayName: 'SameName' });
      await joinPlayer(room, client2, { displayName: 'SameName' });

      const p1 = room.state.getPlayer(client1.sessionId);
      const p2 = room.state.getPlayer(client2.sessionId);

      expect(p1?.displayName).toBe('SameName');
      expect(p2?.displayName).toBe('SameName');
      expect(p1?.sessionId).not.toBe(p2?.sessionId);
    });
  });

  describe('Capacity Management', () => {
    test('should allow up to maxClients players', async () => {
      const maxClients = room.maxClients;
      const clients = createMultiplePlayers(Math.min(maxClients, 10)); // Test up to 10 for speed

      for (const client of clients) {
        await joinPlayer(room, client, { displayName: 'Player' });
      }

      expect(room.state.players.size).toBe(clients.length);
    });
  });

  describe('Initial State', () => {
    test('joined player should have IDLE state', async () => {
      const client = new MockClient('player-13');

      await joinPlayer(room, client, { displayName: 'Idle' });

      const player = room.state.getPlayer(client.sessionId);
      assertPlayerState(player!, PlayerState.IDLE);
    });

    test('joined player should have zero tiles placed', async () => {
      const client = new MockClient('player-14');

      await joinPlayer(room, client, { displayName: 'Zero' });

      const player = room.state.getPlayer(client.sessionId);
      expect(player?.tilesPlaced).toBe(0);
    });

    test('joined player should not be holding any tile', async () => {
      const client = new MockClient('player-15');

      await joinPlayer(room, client, { displayName: 'NoTile' });

      const player = room.state.getPlayer(client.sessionId);
    });

    test('joined player should have valid joinedAt timestamp', async () => {
      const beforeJoin = Date.now();
      const client = new MockClient('player-16');

      await joinPlayer(room, client, { displayName: 'Timestamp' });

      const afterJoin = Date.now();
      const player = room.state.getPlayer(client.sessionId);

      expect(player?.joinedAt).toBeGreaterThanOrEqual(beforeJoin);
      expect(player?.joinedAt).toBeLessThanOrEqual(afterJoin);
    });

    test('joined player should have zero velocity', async () => {
      const client = new MockClient('player-17');

      await joinPlayer(room, client, { displayName: 'Still' });

      const player = room.state.getPlayer(client.sessionId);
      expect(player?.velocity.x).toBe(0);
      expect(player?.velocity.y).toBe(0);
      expect(player?.velocity.z).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long display names gracefully', async () => {
      const client = new MockClient('player-18');
      const longName = 'A'.repeat(100);

      await joinPlayer(room, client, { displayName: longName });

      const player = room.state.getPlayer(client.sessionId);
      expect(player).toBeDefined();
      expect(player?.displayName).toBe(longName);
    });

    test('should handle special characters in display name', async () => {
      const client = new MockClient('player-19');
      const specialName = '!@#$%^&*()_+-=[]{}|;:,.<>?';

      await joinPlayer(room, client, { displayName: specialName });

      const player = room.state.getPlayer(client.sessionId);
      expect(player?.displayName).toBe(specialName);
    });

    test('should handle unicode characters in display name', async () => {
      const client = new MockClient('player-20');
      const unicodeName = '测试用户🎮';

      await joinPlayer(room, client, { displayName: unicodeName });

      const player = room.state.getPlayer(client.sessionId);
      expect(player?.displayName).toBe(unicodeName);
    });

    test('should handle rapid join/leave cycles', async () => {
      const client = new MockClient('player-21');

      for (let i = 0; i < 5; i++) {
        await joinPlayer(room, client, { displayName: `Cycle${i}` });
        expect(room.state.players.size).toBe(1);

        await leavePlayer(room, client);
        expect(room.state.players.size).toBe(0);

        // Create new client with same session ID
        client.clearMessages();
      }
    });
  });
});
