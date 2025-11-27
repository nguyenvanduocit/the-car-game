import { Schema, type } from '@colyseus/schema';
import { Vector3Schema } from './Vector3Schema';
import { QuaternionSchema } from './QuaternionSchema';
import { getFrameSlotPosition } from '@blockgame/shared';

/**
 * Placed tile schema - tile that has been placed in the picture frame
 * These are persistent and always visible in the frame
 *
 * fillCount: 1 = half-filled (0.5 scale), 2 = complete (1.0 scale)
 */
export class PlacedTileSchema extends Schema {
  @type('number') frameSlotIndex: number = 0;
  @type('uint8') fillCount: number = 0; // 1 = half, 2 = complete
  @type('string') completedBy: string = ''; // Display name of player(s) who solved
  @type(Vector3Schema) position = new Vector3Schema();
  @type(QuaternionSchema) rotation = new QuaternionSchema();

  constructor(frameSlotIndex: number = 0, totalSlots: number = 400) {
    super();
    this.frameSlotIndex = frameSlotIndex;
    this.fillCount = 1; // Created when first puzzle solved

    // Calculate position in frame
    const slotPosition = getFrameSlotPosition(frameSlotIndex, totalSlots);
    this.position.set(slotPosition.x, slotPosition.y, slotPosition.z);

    // Calculate rotation: 90° around X + 90° around Z (same as before)
    const angleX = Math.PI / 2;
    const angleZ = Math.PI / 2;
    const qx = { x: Math.sin(angleX / 2), y: 0, z: 0, w: Math.cos(angleX / 2) };
    const qz = { x: 0, y: 0, z: Math.sin(angleZ / 2), w: Math.cos(angleZ / 2) };
    const targetRotation = {
      x: qz.w * qx.x + qz.x * qx.w + qz.y * qx.z - qz.z * qx.y,
      y: qz.w * qx.y - qz.x * qx.z + qz.y * qx.w + qz.z * qx.x,
      z: qz.w * qx.z + qz.x * qx.y - qz.y * qx.x + qz.z * qx.w,
      w: qz.w * qx.w - qz.x * qx.x - qz.y * qx.y - qz.z * qx.z,
    };
    this.rotation.set(targetRotation.x, targetRotation.y, targetRotation.z, targetRotation.w);
  }

  /**
   * Complete the tile (second puzzle solved)
   */
  complete(playerName: string): void {
    this.fillCount = 2;
    // Append second player name if different
    if (this.completedBy && !this.completedBy.includes(playerName)) {
      this.completedBy = `${this.completedBy}, ${playerName}`;
    } else if (!this.completedBy) {
      this.completedBy = playerName;
    }
  }
}
