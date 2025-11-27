import { test, expect, describe } from 'bun:test';
import { PlayerSchema } from '../../src/schema/PlayerSchema';
import { PlayerState } from '@blockgame/shared';

describe('PlayerSchema', () => {
  describe('Constructor', () => {
    test('should create player with provided session ID and display name', () => {
      const player = new PlayerSchema('session-123', 'TestPlayer');

      expect(player.sessionId).toBe('session-123');
      expect(player.displayName).toBe('TestPlayer');
      expect(player.state).toBe(PlayerState.IDLE);
      expect(player.tilesPlaced).toBe(0);
      expect(player.joinedAt).toBeGreaterThan(0);
    });

    test('should generate default name when empty name provided', () => {
      const player = new PlayerSchema('session-456', '');

      expect(player.sessionId).toBe('session-456');
      expect(player.displayName).toMatch(/^Player\d{4}$/);
    });

    test('should spawn at random position within floor bounds', () => {
      const player = new PlayerSchema('session-789', 'Player');

      // Floor bounds: x: -50 to 50, y: 1.0, z: -100 to 100
      expect(player.position.x).toBeGreaterThanOrEqual(-50);
      expect(player.position.x).toBeLessThanOrEqual(50);
      expect(player.position.y).toBe(1.0);
      expect(player.position.z).toBeGreaterThanOrEqual(-100);
      expect(player.position.z).toBeLessThanOrEqual(100);
    });

    test('should have random rotation between 0 and 2π', () => {
      const player = new PlayerSchema('session-abc', 'Player');

      expect(player.rotation).toBeGreaterThanOrEqual(0);
      expect(player.rotation).toBeLessThanOrEqual(Math.PI * 2);
    });
  });

  describe('State Transitions', () => {
    test('IDLE → SOLVING_PUZZLE transition', () => {
      const player = new PlayerSchema('session-1', 'Player');

      expect(player.state).toBe(PlayerState.IDLE);

      player.startPuzzle();

      expect(player.state).toBe(PlayerState.SOLVING_PUZZLE);
    });

    test('SOLVING_PUZZLE → IDLE transition (puzzle failed)', () => {
      const player = new PlayerSchema('session-3', 'Player');
      player.startPuzzle();

      expect(player.state).toBe(PlayerState.SOLVING_PUZZLE);

      player.cancelPuzzle();

      expect(player.state).toBe(PlayerState.IDLE);
    });

    test('placeTile should increment counter and return to IDLE', () => {
      const player = new PlayerSchema('session-4', 'Player');

      expect(player.tilesPlaced).toBe(0);

      player.placeTile();

      expect(player.state).toBe(PlayerState.IDLE);
      expect(player.tilesPlaced).toBe(1);
    });

    test('Multiple tile placements should increment counter', () => {
      const player = new PlayerSchema('session-5', 'Player');

      player.placeTile();
      expect(player.tilesPlaced).toBe(1);

      player.placeTile();
      expect(player.tilesPlaced).toBe(2);

      player.placeTile();
      expect(player.tilesPlaced).toBe(3);
    });
  });

  describe('Position Updates', () => {
    test('should update position based on velocity', () => {
      const player = new PlayerSchema('session-6', 'Player');
      const initialX = player.position.x;
      const initialZ = player.position.z;

      // Set velocity (5 units/sec to the right)
      player.velocity.x = 5.0;
      player.velocity.z = 0.0;

      // Update position with 1 second delta
      player.updatePosition(1.0);

      expect(player.position.x).toBe(initialX + 5.0);
      expect(player.position.z).toBe(initialZ);
    });

    test('should NOT clamp position (boundaries handled by Havok physics walls)', () => {
      const player = new PlayerSchema('session-7', 'Player');

      // Note: Boundary clamping was removed - Havok physics walls handle collisions
      // This test verifies that updatePosition applies velocity without clamping

      player.position.x = 48;
      player.velocity.x = 10.0;
      player.updatePosition(1.0);

      // Position should update based on velocity (no clamping)
      expect(player.position.x).toBe(58);

      player.position.z = 98;
      player.velocity.z = 10.0;
      player.updatePosition(1.0);

      // Position should update based on velocity (no clamping)
      expect(player.position.z).toBe(108);
    });

    test('should handle diagonal movement correctly', () => {
      const player = new PlayerSchema('session-9', 'Player');
      player.position.x = 0;
      player.position.z = 0;

      // Move diagonally
      player.velocity.x = 3.0;
      player.velocity.z = 4.0;
      player.updatePosition(1.0);

      expect(player.position.x).toBe(3.0);
      expect(player.position.z).toBe(4.0);
    });

    test('should maintain y position at 1.0', () => {
      const player = new PlayerSchema('session-10', 'Player');

      player.velocity.x = 5.0;
      player.velocity.y = 10.0; // Try to move vertically
      player.velocity.z = 5.0;

      player.updatePosition(1.0);

      // Y should remain at 1.0 (ground level)
      expect(player.position.y).toBe(1.0);
    });
  });

  describe('Validation', () => {
    test('display name should be between 1-20 characters when provided', () => {
      const player1 = new PlayerSchema('s1', 'A');
      expect(player1.displayName).toBe('A');

      const player2 = new PlayerSchema('s2', 'A'.repeat(20));
      expect(player2.displayName.length).toBe(20);
    });

    test('tilesPlaced should never be negative', () => {
      const player = new PlayerSchema('session-11', 'Player');

      expect(player.tilesPlaced).toBe(0);

      player.placeTile();

      expect(player.tilesPlaced).toBeGreaterThanOrEqual(0);
    });

    test('joinedAt should be a valid timestamp', () => {
      const beforeCreate = Date.now();
      const player = new PlayerSchema('session-12', 'Player');
      const afterCreate = Date.now();

      expect(player.joinedAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(player.joinedAt).toBeLessThanOrEqual(afterCreate);
    });
  });

  describe('Edge Cases', () => {
    test('should handle multiple state transitions correctly', () => {
      const player = new PlayerSchema('session-13', 'Player');

      // IDLE → SOLVING_PUZZLE → IDLE → SOLVING_PUZZLE → IDLE (via placeTile)
      expect(player.state).toBe(PlayerState.IDLE);

      player.startPuzzle();
      expect(player.state).toBe(PlayerState.SOLVING_PUZZLE);

      player.cancelPuzzle();
      expect(player.state).toBe(PlayerState.IDLE);

      player.startPuzzle();
      expect(player.state).toBe(PlayerState.SOLVING_PUZZLE);

      player.placeTile();
      expect(player.state).toBe(PlayerState.IDLE);
    });

    test('should handle zero velocity correctly', () => {
      const player = new PlayerSchema('session-14', 'Player');
      const initialX = player.position.x;
      const initialZ = player.position.z;

      player.velocity.x = 0;
      player.velocity.z = 0;

      player.updatePosition(1.0);

      expect(player.position.x).toBe(initialX);
      expect(player.position.z).toBe(initialZ);
    });

    test('should handle very small deltaTime correctly', () => {
      const player = new PlayerSchema('session-15', 'Player');
      const initialX = player.position.x;

      player.velocity.x = 5.0;

      // 0.001 second (1ms)
      player.updatePosition(0.001);

      expect(player.position.x).toBeCloseTo(initialX + 0.005, 3);
    });

    test('should handle negative velocity correctly', () => {
      const player = new PlayerSchema('session-16', 'Player');
      player.position.x = 10;
      player.position.z = 10;

      player.velocity.x = -3.0;
      player.velocity.z = -4.0;

      player.updatePosition(1.0);

      expect(player.position.x).toBe(7.0);
      expect(player.position.z).toBe(6.0);
    });
  });
});
