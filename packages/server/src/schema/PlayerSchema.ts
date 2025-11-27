import { Schema, type } from '@colyseus/schema';
import { Vector3Schema } from './Vector3Schema';
import { QuaternionSchema } from './QuaternionSchema';
import type { Player } from '@blockgame/shared';
import { PlayerState, PLAYER_CONFIG } from '@blockgame/shared';

/**
 * Player schema - synchronized player entity
 * Implements Player interface from @blockgame/shared
 */
export class PlayerSchema extends Schema implements Player {
  // === SYNCED FIELDS (sent to clients) ===
  @type('string') sessionId: string = '';
  @type('string') displayName: string = '';
  @type(Vector3Schema) position = new Vector3Schema();
  @type('number') rotation: number = 0; // Camera/facing direction (Y-axis)
  @type(QuaternionSchema) bodyRotation = new QuaternionSchema(); // Ball rolling rotation (full 3D)
  // SERVER-ONLY: velocity not synced (client calculates from position deltas)
  velocity = new Vector3Schema();
  @type('number') tilesPlaced: number = 0;
  @type('string') state: PlayerState = PlayerState.IDLE;
  @type('number') steering: number = 0; // -1 (left) to 1 (right)
  @type('number') health: number = PLAYER_CONFIG.maxHealth;
  @type('boolean') isDead: boolean = false;

  // === SERVER-ONLY FIELDS (not synced - bandwidth optimization) ===
  joinedAt: number = 0; // Timestamp when player joined (internal use)

  /**
   * Initialize player with session ID and display name
   */
  constructor(sessionId: string, displayName: string) {
    super();
    this.sessionId = sessionId;
    this.displayName = displayName || this.generateDefaultName();
    this.joinedAt = Date.now();
    this.spawnAtRandomPosition();
  }

  /**
   * Generate default name if player didn't provide one
   */
  private generateDefaultName(): string {
    const randomNum = Math.floor(Math.random() * 9000) + 1000;
    return `Player${randomNum}`;
  }

  /**
   * Spawn player at random position within floor bounds
   * Floor: 100x200 units (x: -50 to 50, z: -100 to 100)
   * Players spawn in the sky and drop down due to gravity
   */
  private spawnAtRandomPosition(): void {
    this.position.x = Math.random() * 100 - 50; // -50 to 50
    this.position.y = PLAYER_CONFIG.spawnHeight; // Drop from the sky!
    this.position.z = Math.random() * 200 - 100; // -100 to 100
    this.rotation = Math.random() * Math.PI * 2; // Random facing direction
  }

  /**
   * Update player position from velocity (UNUSED - physics handles movement)
   * This is a legacy fallback method, not called in production.
   * Physics engine directly sets position via syncFromPhysics in GameRoom.
   */
  updatePosition(deltaTime: number): void {
    this.position.x += this.velocity.x * deltaTime;
    this.position.z += this.velocity.z * deltaTime;
  }

  /**
   * Place tile in frame (increment counter, return to IDLE)
   * Called when tile starts flying to frame after puzzle success
   */
  placeTile(): void {
    this.tilesPlaced += 1;
    this.state = PlayerState.IDLE;
  }

  /**
   * Start solving puzzle (lock tile to player)
   */
  startPuzzle(): void {
    this.state = PlayerState.SOLVING_PUZZLE;
  }

  /**
   * Cancel puzzle (return to idle)
   */
  cancelPuzzle(): void {
    this.state = PlayerState.IDLE;
  }
}
