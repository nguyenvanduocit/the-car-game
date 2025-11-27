import { Schema, type } from '@colyseus/schema';
import { Vector3Schema } from './Vector3Schema';
import { QuaternionSchema } from './QuaternionSchema';
import { PuzzleConfigSchema } from './PuzzleConfigSchema';
import type { Tile } from '@blockgame/shared';
import { TileState } from '@blockgame/shared';

/**
 * Available tile schema - physics-enabled collectible on the floor
 *
 * NEW ARCHITECTURE:
 * - availableId: 0-799 (unique identifier)
 * - frameSlotIndex: 0-399 (which frame slot this tile fills)
 * - phase: 1 or 2 (first half or second half of the slot)
 *
 * When solved, this tile is REMOVED and a PlacedTileSchema is created/updated
 */
export class TileSchema extends Schema implements Tile {
  // === SYNCED FIELDS (sent to clients) ===
  @type('string') state: TileState = TileState.ON_FLOOR;
  @type(Vector3Schema) position = new Vector3Schema();
  @type(QuaternionSchema) rotation = new QuaternionSchema();
  @type('string') ownedBy: string | null = null;
  @type('number') availableId: number = 0;      // 0-799 unique ID
  @type('number') frameSlotIndex: number = 0;   // 0-399 target slot
  @type('uint8') phase: number = 1;             // 1 = first half, 2 = second half

  // === SERVER-ONLY FIELDS (not synced - bandwidth optimization) ===
  velocity = new Vector3Schema();
  angularVelocity = new Vector3Schema();
  isSleeping: boolean = false;
  lockedAt: number | null = null;
  chargingStartTime: number | null = null;
  puzzle = new PuzzleConfigSchema();
  lastUpdateAt: number = 0;

  constructor(availableId: number) {
    super();
    this.availableId = availableId;
    // Calculate frameSlotIndex and phase from availableId
    // IDs 0-399 = first half (phase 1), IDs 400-799 = second half (phase 2)
    this.frameSlotIndex = availableId % 400;
    this.phase = availableId < 400 ? 1 : 2;
    this.lastUpdateAt = Date.now();
  }

  /**
   * Lock tile to player for puzzle solving
   */
  lockToPlayer(sessionId: string): void {
    this.state = TileState.LOCKED;
    this.ownedBy = sessionId;
    this.lockedAt = Date.now();
  }

  /**
   * Start charging tile for shooting
   */
  startCharging(sessionId: string): void {
    this.state = TileState.CHARGING;
    this.ownedBy = sessionId;
    this.chargingStartTime = Date.now();
  }

  /**
   * Stop charging and return to floor
   */
  stopCharging(): void {
    this.state = TileState.ON_FLOOR;
    this.ownedBy = null;
    this.chargingStartTime = null;
  }

  /**
   * Return tile to floor (puzzle failed/abandoned)
   */
  returnToFloor(): void {
    this.state = TileState.ON_FLOOR;
    this.ownedBy = null;
    this.lockedAt = null;
    this.chargingStartTime = null;
    this.isSleeping = false;
  }

  updatePhysics(): void {
    this.lastUpdateAt = Date.now();
  }
}
