import { Schema, type } from '@colyseus/schema';
import type { Quaternion } from '@blockgame/shared';

/**
 * Quaternion schema - 3D rotation representation
 * Implements Quaternion interface from @blockgame/shared
 */
export class QuaternionSchema extends Schema implements Quaternion {
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') z: number = 0;
  @type('number') w: number = 1; // Identity quaternion

  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) {
    super();
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /**
   * Set all components at once
   */
  set(x: number, y: number, z: number, w: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /**
   * Copy from another Quaternion
   */
  copy(other: QuaternionSchema | Quaternion): void {
    this.x = other.x;
    this.y = other.y;
    this.z = other.z;
    this.w = other.w;
  }

  /**
   * Set to identity quaternion (no rotation)
   */
  identity(): void {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 1;
  }
}
