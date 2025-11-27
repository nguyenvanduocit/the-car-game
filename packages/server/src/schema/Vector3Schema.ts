import { Schema, type } from '@colyseus/schema';
import type { Vector3 } from '@blockgame/shared';

/**
 * Vector3 schema - 3D vector for positions and velocities
 * Implements Vector3 interface from @blockgame/shared
 */
export class Vector3Schema extends Schema implements Vector3 {
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') z: number = 0;

  constructor(x: number = 0, y: number = 0, z: number = 0) {
    super();
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * Set all components at once
   */
  set(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * Copy from another Vector3
   */
  copy(other: Vector3Schema | Vector3): void {
    this.x = other.x;
    this.y = other.y;
    this.z = other.z;
  }

  /**
   * Get vector magnitude (length)
   */
  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  /**
   * Normalize vector (make length = 1)
   */
  normalize(): void {
    const mag = this.magnitude();
    if (mag > 0) {
      this.x /= mag;
      this.y /= mag;
      this.z /= mag;
    }
  }
}
