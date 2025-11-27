/**
 * Player Visual & Physics Metrics
 *
 * CRITICAL: Visual and physics MUST be perfectly aligned!
 * - Physics box is centered at TransformNode (cannot offset)
 * - Visual meshes are positioned relative to physics center
 * - When player on ground, leg bottoms touch y=0
 *
 * All measurements are in BabylonJS units (1 unit = 1 meter in real world scale)
 * Coordinate system: Y-up, origin at physics body center
 */

import { PLAYER_CONFIG } from './world';

/**
 * Base size from player config
 * This is the fundamental unit - everything else scales from this
 */
export const BASE_SIZE = PLAYER_CONFIG.radius * 2; // 2.0 units

/**
 * Leg dimensions (defined first - they determine ground level)
 * Two thin boxes, legs TOUCH the ground when player on ground
 */
export const LEG_METRICS = {
  width: BASE_SIZE * 0.25,    // 0.5 units (25% of body)
  height: BASE_SIZE * 0.8,    // 1.6 units (80% of body)
  depth: BASE_SIZE * 0.25,    // 0.5 units (25% of body)
  // Horizontal offset from center
  spacing: BASE_SIZE * 0.2,   // 0.4 units (20% of body) - distance from center
} as const;

/**
 * Body (torso) dimensions
 * The main cube representing the player's torso, DIRECTLY ON TOP of legs
 */
export const BODY_METRICS = {
  width: BASE_SIZE,           // 2.0
  height: BASE_SIZE,          // 2.0
  depth: BASE_SIZE,           // 2.0
} as const;

/**
 * Car-like body sections
 * Cabin (main body), Hood (front), Trunk (back)
 */
export const CAR_METRICS = {
  // Cabin (main passenger area) - centered on body
  cabin: {
    width: BASE_SIZE,              // 2.0
    height: BASE_SIZE * 0.8,       // 1.6
    depth: BASE_SIZE * 0.5,        // 1.0
    centerY: 0.4,                  // Same as body center
    centerZ: 0,                    // Centered
  },

  // Hood (front section)
  hood: {
    width: BASE_SIZE * 0.9,        // 1.8 (slightly narrower)
    height: BASE_SIZE * 0.5,       // 1.0 (lower than cabin)
    depth: BASE_SIZE * 0.4,        // 0.8
    centerY: 0.15,                 // Lower than cabin
    centerZ: 0.7,                  // Forward (cabin.depth/2 + hood.depth/2)
  },

  // Trunk (back section)
  trunk: {
    width: BASE_SIZE * 0.9,        // 1.8 (slightly narrower)
    height: BASE_SIZE * 0.5,       // 1.0 (lower than cabin)
    depth: BASE_SIZE * 0.4,        // 0.8
    centerY: 0.15,                 // Lower than cabin
    centerZ: -0.7,                 // Backward (-(cabin.depth/2 + trunk.depth/2))
  },

  // Windshield (on top of cabin front)
  windshield: {
    width: BASE_SIZE * 0.8,        // 1.6
    height: BASE_SIZE * 0.4,       // 0.8
    depth: BASE_SIZE * 0.15,       // 0.3 (thin)
    centerY: 1.0,                  // On top of cabin
    centerZ: 0.15,                 // Slightly forward
  },
} as const;

/**
 * Head dimensions
 * Small cube DIRECTLY ON TOP of body
 */
export const HEAD_METRICS = {
  size: BASE_SIZE * 0.4,      // 0.8 units (40% of body)
} as const;

/**
 * Arm dimensions
 * Two-segment arms (upper + lower) on each side
 */
export const ARM_METRICS = {
  thickness: 0.25,                    // 0.25 units - thin cylinders
  upperLength: 1.4,                   // 1.4 units
  lowerLength: 1.8,                   // 1.8 units
  shoulderOffset: BASE_SIZE * 0.4,    // 0.8 units (40% of body) - distance from center
  // Shoulder attachment point (near top-front of body)
  shoulderY: 0.2,                     // 0.2 units above body center
  shoulderZ: -0.6,                    // 0.6 units forward (front of body)
  // Rotation angles
  upperRotation: Math.PI / 2.5,       // ~72 degrees down
} as const;

/**
 * CALCULATED: Vertical positioning (Y-axis)
 * Built from bottom-up: legs → body → head
 *
 * CRITICAL ALIGNMENT: Visual must fit within physics box!
 * - Physics box: 4.4 units tall, extends from -2.2 to +2.2 relative to center
 * - Visual must fit within this range (no parts sticking out)
 * - Applied +0.4 unit vertical shift to align visual with physics box bounds
 *
 * Layout (relative to physics center):
 * - Leg bottom:    y = -2.2 (matches physics box bottom)
 * - Leg center:    y = -1.4
 * - Leg top:       y = -0.6
 * - Body bottom:   y = -0.6 (legs touch body)
 * - Body center:   y = 0.4
 * - Body top:      y = 1.4
 * - Head bottom:   y = 1.4 (head touches body)
 * - Head center:   y = 1.8
 * - Head top:      y = 2.2 (matches physics box top)
 */
export const PLAYER_LAYOUT = {
  // Leg positions (relative to physics center)
  leg: {
    centerY: -1.4,  // Shifted from -1.8
    topY: -0.6,     // Shifted from -1.0
    bottomY: -2.2,  // Shifted from -2.6 (now matches physics box bottom!)
  },

  // Body positions (relative to physics center)
  body: {
    centerY: 0.4,   // Shifted from 0
    topY: 1.4,      // Shifted from 1.0
    bottomY: -0.6,  // Shifted from -1.0 (touches leg top)
  },

  // Head positions (relative to physics center)
  head: {
    centerY: 1.8,   // Shifted from 1.4
    topY: 2.2,      // Shifted from 1.8 (now matches physics box top!)
    bottomY: 1.4,   // Shifted from 1.0 (touches body top)
  },

  // Overall bounds
  totalHeight: LEG_METRICS.height + BODY_METRICS.height + HEAD_METRICS.size,  // 4.4
  minY: -2.2,     // Matches physics box bottom (was -2.6)
  maxY: 2.2,      // Matches physics box top (was 1.8)
} as const;

/**
 * Physics box configuration
 * Centered at TransformNode, encompasses entire player
 */
export const PHYSICS_BOX = {
  width: BODY_METRICS.width,           // 2.0
  height: PLAYER_LAYOUT.totalHeight,   // 4.4
  depth: BODY_METRICS.depth,           // 2.0
  halfHeight: PLAYER_LAYOUT.totalHeight / 2,  // 2.2
} as const;

/**
 * Helper: Calculate world Y position where player's legs touch the ground
 * @param physicsBodyY The Y position of the physics body (TransformNode.position.y)
 * @returns The Y position where leg bottoms touch (physics box bottom + leg extension)
 */
export function getLegGroundContactY(physicsBodyY: number): number {
  return physicsBodyY + PLAYER_LAYOUT.leg.bottomY;
}

/**
 * Helper: Calculate physics body Y position to place leg bottoms at specific ground height
 * @param groundY The desired ground contact Y position (where legs touch)
 * @returns The Y position for the physics body TransformNode
 *
 * Example: groundY=0 → physicsBodyY=2.2 → leg bottoms at 2.2+(-2.2)=0 ✓
 */
export function getPhysicsBodyYForGround(groundY: number): number {
  return groundY - PLAYER_LAYOUT.leg.bottomY;  // groundY - (-2.2) = groundY + 2.2
}

/**
 * Debug info: Print all metrics with verification
 */
export function debugPrintMetrics(): void {
  console.log('=== PLAYER METRICS ===');
  console.log('BASE_SIZE:', BASE_SIZE);
  console.log('\nBODY:', BODY_METRICS);
  console.log('\nHEAD:', HEAD_METRICS);
  console.log('\nLEGS:', LEG_METRICS);
  console.log('\nARMS:', ARM_METRICS);
  console.log('\nLAYOUT:', PLAYER_LAYOUT);
  console.log('\nPHYSICS_BOX:', PHYSICS_BOX);
  console.log('\n=== VERIFICATION ===');
  console.log('Physics body at y=2.2 → Leg bottom at y=', getLegGroundContactY(2.2));
  console.log('Ground at y=0 → Physics body should be at y=', getPhysicsBodyYForGround(0));
  console.log('Total height matches?', PHYSICS_BOX.height === PLAYER_LAYOUT.totalHeight);
  console.log('Visual fits in physics box?', PLAYER_LAYOUT.minY === -PHYSICS_BOX.halfHeight && PLAYER_LAYOUT.maxY === PHYSICS_BOX.halfHeight);
}
