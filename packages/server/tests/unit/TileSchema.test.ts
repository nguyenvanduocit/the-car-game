import { test, expect, describe } from 'bun:test';
import { TileSchema } from '../../src/schema/TileSchema';
import { TileState, PuzzleType } from '@blockgame/shared';

describe('TileSchema', () => {
  describe('Constructor', () => {
    test('should create tile with availableId and derive frameSlotIndex/phase', () => {
      // Phase 1 tile (availableId 0-399)
      const tile1 = new TileSchema(5);
      expect(tile1.availableId).toBe(5);
      expect(tile1.frameSlotIndex).toBe(5);
      expect(tile1.phase).toBe(1);
      expect(tile1.state).toBe(TileState.ON_FLOOR);
      expect(tile1.ownedBy).toBeNull();

      // Phase 2 tile (availableId 400-799)
      const tile2 = new TileSchema(405);
      expect(tile2.availableId).toBe(405);
      expect(tile2.frameSlotIndex).toBe(5); // 405 % 400 = 5
      expect(tile2.phase).toBe(2);
    });

    test('should initialize with default position and rotation', () => {
      const tile = new TileSchema(0);

      expect(tile.position.x).toBe(0);
      expect(tile.position.y).toBe(0);
      expect(tile.position.z).toBe(0);

      expect(tile.rotation.x).toBe(0);
      expect(tile.rotation.y).toBe(0);
      expect(tile.rotation.z).toBe(0);
      expect(tile.rotation.w).toBe(1); // Identity quaternion
    });

    test('should initialize with zero velocity', () => {
      const tile = new TileSchema(0);

      expect(tile.velocity.x).toBe(0);
      expect(tile.velocity.y).toBe(0);
      expect(tile.velocity.z).toBe(0);

      expect(tile.angularVelocity.x).toBe(0);
      expect(tile.angularVelocity.y).toBe(0);
      expect(tile.angularVelocity.z).toBe(0);
    });

    test('should set lastUpdateAt timestamp', () => {
      const beforeCreate = Date.now();
      const tile = new TileSchema(0);
      const afterCreate = Date.now();

      expect(tile.lastUpdateAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(tile.lastUpdateAt).toBeLessThanOrEqual(afterCreate);
    });
  });

  describe('Phase Mapping', () => {
    test('phase 1 tiles should have availableId 0-399', () => {
      for (let i = 0; i < 400; i += 50) {
        const tile = new TileSchema(i);
        expect(tile.phase).toBe(1);
        expect(tile.frameSlotIndex).toBe(i);
      }
    });

    test('phase 2 tiles should have availableId 400-799', () => {
      for (let i = 400; i < 800; i += 50) {
        const tile = new TileSchema(i);
        expect(tile.phase).toBe(2);
        expect(tile.frameSlotIndex).toBe(i - 400);
      }
    });

    test('phase 1 and phase 2 tiles should map to same frameSlotIndex', () => {
      for (let slot = 0; slot < 400; slot += 50) {
        const phase1 = new TileSchema(slot);
        const phase2 = new TileSchema(slot + 400);
        expect(phase1.frameSlotIndex).toBe(phase2.frameSlotIndex);
        expect(phase1.phase).toBe(1);
        expect(phase2.phase).toBe(2);
      }
    });
  });

  describe('State Transitions', () => {
    test('ON_FLOOR → LOCKED transition', () => {
      const tile = new TileSchema(0);

      expect(tile.state).toBe(TileState.ON_FLOOR);
      expect(tile.ownedBy).toBeNull();
      expect(tile.lockedAt).toBeNull();

      tile.lockToPlayer('player-123');

      expect(tile.state).toBe(TileState.LOCKED);
      expect(tile.ownedBy).toBe('player-123');
      expect(tile.lockedAt).toBeGreaterThan(0);
    });

    test('LOCKED → ON_FLOOR transition (puzzle failed)', () => {
      const tile = new TileSchema(0);
      tile.lockToPlayer('player-789');

      expect(tile.state).toBe(TileState.LOCKED);
      expect(tile.ownedBy).toBe('player-789');

      tile.returnToFloor();

      expect(tile.state).toBe(TileState.ON_FLOOR);
      expect(tile.ownedBy).toBeNull();
      expect(tile.lockedAt).toBeNull();
    });

    test('LOCKED → ON_FLOOR transition (player disconnect)', () => {
      const tile = new TileSchema(0);
      tile.lockToPlayer('player-xyz');

      expect(tile.state).toBe(TileState.LOCKED);

      tile.returnToFloor();

      expect(tile.state).toBe(TileState.ON_FLOOR);
      expect(tile.ownedBy).toBeNull();
      expect(tile.lockedAt).toBeNull();
    });

    test('ON_FLOOR → CHARGING transition', () => {
      const tile = new TileSchema(0);

      tile.startCharging('player-abc');

      expect(tile.state).toBe(TileState.CHARGING);
      expect(tile.ownedBy).toBe('player-abc');
      expect(tile.chargingStartTime).toBeGreaterThan(0);
    });

    test('CHARGING → ON_FLOOR transition (stop charging)', () => {
      const tile = new TileSchema(0);
      tile.startCharging('player-def');

      expect(tile.state).toBe(TileState.CHARGING);

      tile.stopCharging();

      expect(tile.state).toBe(TileState.ON_FLOOR);
      expect(tile.ownedBy).toBeNull();
      expect(tile.chargingStartTime).toBeNull();
    });
  });

  describe('Physics Updates', () => {
    test('should update lastUpdateAt timestamp', () => {
      const tile = new TileSchema(0);
      const initialTimestamp = tile.lastUpdateAt;

      // Wait a bit
      const wait = () => new Promise(resolve => setTimeout(resolve, 10));
      wait().then(() => {
        tile.updatePhysics();
        expect(tile.lastUpdateAt).toBeGreaterThan(initialTimestamp);
      });
    });

    test('updatePhysics should be called independently of state', () => {
      const tile = new TileSchema(0);

      tile.updatePhysics();
      const timestamp1 = tile.lastUpdateAt;

      tile.lockToPlayer('player-1');
      tile.updatePhysics();
      const timestamp2 = tile.lastUpdateAt;

      expect(timestamp2).toBeGreaterThanOrEqual(timestamp1);
    });
  });

  describe('Ownership Management', () => {
    test('should track ownership correctly through state transitions', () => {
      const tile = new TileSchema(0);

      expect(tile.ownedBy).toBeNull();

      tile.lockToPlayer('player-alpha');
      expect(tile.ownedBy).toBe('player-alpha');

      tile.returnToFloor();
      expect(tile.ownedBy).toBeNull();
    });

    test('should clear ownership when returning to floor from locked state', () => {
      const tile = new TileSchema(0);

      tile.lockToPlayer('player-beta');
      expect(tile.ownedBy).toBe('player-beta');

      tile.returnToFloor();
      expect(tile.ownedBy).toBeNull();
    });

    test('lockedAt timestamp should be set when locking', () => {
      const tile = new TileSchema(0);
      const beforeLock = Date.now();

      tile.lockToPlayer('player-gamma');

      expect(tile.lockedAt).toBeGreaterThanOrEqual(beforeLock);
      expect(tile.lockedAt).toBeLessThanOrEqual(Date.now());
    });

    test('lockedAt should be cleared when returning to floor', () => {
      const tile = new TileSchema(0);

      tile.lockToPlayer('player-delta');
      expect(tile.lockedAt).toBeGreaterThan(0);

      tile.returnToFloor();
      expect(tile.lockedAt).toBeNull();
    });
  });

  describe('Frame Slot Assignment', () => {
    test('should maintain frameSlotIndex through state transitions', () => {
      const tile = new TileSchema(42);

      expect(tile.frameSlotIndex).toBe(42);

      tile.lockToPlayer('player-1');
      expect(tile.frameSlotIndex).toBe(42);

      tile.returnToFloor();
      expect(tile.frameSlotIndex).toBe(42);
    });

    test('should support all valid frame slot indices', () => {
      for (let i = 0; i < 50; i++) {
        const tile = new TileSchema(i);
        expect(tile.frameSlotIndex).toBe(i);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle rapid state transitions', () => {
      const tile = new TileSchema(0);

      tile.lockToPlayer('player-1');
      tile.returnToFloor();
      tile.lockToPlayer('player-2');
      tile.returnToFloor();
      tile.lockToPlayer('player-3');
      tile.returnToFloor();

      expect(tile.state).toBe(TileState.ON_FLOOR);
      expect(tile.ownedBy).toBeNull();
    });

    test('returnToFloor should work from any state', () => {
      const tile1 = new TileSchema(0);
      tile1.returnToFloor();
      expect(tile1.state).toBe(TileState.ON_FLOOR);

      const tile2 = new TileSchema(1);
      tile2.lockToPlayer('p1');
      tile2.returnToFloor();
      expect(tile2.state).toBe(TileState.ON_FLOOR);

      const tile3 = new TileSchema(2);
      tile3.startCharging('p2');
      tile3.returnToFloor();
      expect(tile3.state).toBe(TileState.ON_FLOOR);
    });
  });

  describe('Validation', () => {
    test('frameSlotIndex should be non-negative', () => {
      const tile = new TileSchema(0);
      expect(tile.frameSlotIndex).toBeGreaterThanOrEqual(0);
    });

    test('state should always be a valid TileState', () => {
      const tile = new TileSchema(0);
      const validStates = Object.values(TileState);

      expect(validStates).toContain(tile.state);

      tile.lockToPlayer('p1');
      expect(validStates).toContain(tile.state);

      tile.returnToFloor();
      expect(validStates).toContain(tile.state);

      tile.startCharging('p2');
      expect(validStates).toContain(tile.state);
    });
  });

});
