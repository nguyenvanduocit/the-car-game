/**
 * Monster Truck Vehicle Metrics
 *
 * SIMPLIFIED PHYSICS: Box-based physics with visual wheels
 * - Physics: Single box body (no constraints, no wheel physics)
 * - Visual: Chassis + 4 animated wheels + 2 forks
 * - Wheels rotate based on velocity (visual only)
 *
 * All measurements in BabylonJS units (1 unit = 1 meter)
 * Coordinate system: Y-up (ground at y=0)
 */

import { PLAYER_CONFIG } from './world';

/**
 * Base size for proportions
 */
export const BASE_SIZE = PLAYER_CONFIG.radius * 2; // 2.0 units (for reference)

/**
 * Wheel dimensions and positioning
 * 4 wheels positioned at corners of chassis
 */
export const WHEEL_METRICS = {
  radius: 0.45,       // 0.45 units - slightly larger wheel radius
  width: 0.35,        // 0.35 units - slightly wider wheel thickness

  // Wheel positions relative to chassis center (4 corners)
  offsetX: 0.7,       // 0.7 units from center (left/right) - slightly wider stance
  offsetZ: 1.6,       // 1.6 units from center (front/back) - longer wheelbase for longer car
  offsetY: -0.6,      // -0.6 units down from chassis center (wheel axle height)
} as const;

/**
 * Chassis (main body) dimensions
 * Lower, wider, longer than old humanoid player
 */
export const CHASSIS_METRICS = {
  width: 1.5,         // 1.5 units (X) - wide
  height: 1.0,        // 1.0 units (Y) - reference height
  depth: 4.0,         // 4.0 units (Z) - car length reference
} as const;

/**
 * Car body dimensions - 2-block design for cleaner visual
 * Uses ABSOLUTE values (not multipliers) for clarity
 * - Base body: Long flat block from front to back
 * - Cabin: Sits on top of base body
 */
export const CAR_BODY_DIMENSIONS = {
  // Block 1: Base body - main body spanning vehicle length
  base: {
    width: 1.35,      // 0.9 * 1.5
    height: 0.6,      // 0.6 * 1.0
    depth: 3.92,      // 0.98 * 4.0 - main body length
    offsetY: -0.2,    // Lowered position
    offsetZ: 0.0,     // Centered
  },
  // Block 2: Cabin - passenger compartment on top
  cabin: {
    width: 1.275,     // 0.85 * 1.5
    height: 0.8,      // 0.8 * 1.0
    depth: 1.4,       // 0.35 * 4.0
    offsetZ: 0.5,     // Towards front
  },
} as const;

/**
 * Fork dimensions (two prongs for holding tiles)
 * Extend forward from front of chassis
 */
export const FORK_METRICS = {
  length: 1.2,        // 1.2 units - longer prong length
  width: 0.2,         // 0.2 units - prong width
  height: 0.15,       // 0.15 units - prong thickness

  spacing: 1.0,       // 1.0 units - horizontal gap between forks (increased for wider spacing)

  // Fork positions relative to chassis center
  offsetY: -0.3,      // -0.3 units - slightly below chassis bottom
  offsetZ: 2.7,       // 2.7 units - extend from front of chassis
} as const;

/**
 * Vehicle layout - all positions relative to physics body center
 *
 * When vehicle on ground (wheels touching y=0):
 * - Physics center at y = 1.0
 * - Wheel centers at y = 0.4 (radius 0.4, bottoms at y = 0)
 * - Chassis sits ON TOP of wheels
 * - Chassis bottom at y = 0.8 (wheel top)
 * - Chassis center at y = 1.3
 * - Forks below chassis, above ground
 *
 * Layout relative to physics center (y=0):
 * - Wheel bottom: -1.0
 * - Wheel center: -0.6
 * - Wheel top: -0.2
 * - Chassis bottom: -0.2 (sits on wheel top)
 * - Chassis center: +0.3
 * - Chassis top: +0.8
 */
export const VEHICLE_LAYOUT = {
  // Chassis position (relative to physics center) - RAISED to sit on wheels
  chassis: {
    centerY: 0.3,       // +0.3 (above physics center, sits on wheels)
    topY: 0.8,          // Chassis top
    bottomY: -0.2,      // Chassis bottom (sits on wheel top)
  },

  // Wheel positions (relative to physics center)
  wheel: {
    centerY: -0.6,      // Wheel center
    bottomY: -1.0,      // Wheel bottom (touches ground)
    topY: -0.2,         // Wheel top (chassis sits here)
  },

  // Fork positions (relative to physics center) - below chassis, forward
  fork: {
    centerY: -0.15,     // Slightly below chassis bottom, above ground
    bottomY: -0.225,    // Fork bottom
    topY: -0.075,       // Fork top
  },

  // Overall bounds
  totalHeight: 2.0,    // Physics box height
  minY: -1.0,          // Wheel bottom
  maxY: 0.8,           // Chassis top
} as const;

/**
 * Physics box configuration (HITBOX)
 * Covers body only - does NOT include forks
 * Simple box centered at TransformNode
 */
export const PHYSICS_BOX = {
  // Use base body dimensions for hitbox (widest part)
  width: CAR_BODY_DIMENSIONS.base.width,     // 1.35
  height: VEHICLE_LAYOUT.totalHeight,        // 2.0
  depth: CAR_BODY_DIMENSIONS.base.depth,     // 3.92 (body only, no forks)
  halfHeight: VEHICLE_LAYOUT.totalHeight / 2,  // 1.0
} as const;

/**
 * Tile attachment point (on forks)
 * Where tile should be positioned when held
 */
export const TILE_ATTACH_POINT = {
  // Relative to vehicle center
  x: 0,                           // Center between forks
  y: FORK_METRICS.offsetY + 0.5,  // 0.2 - raised above forks to avoid overlap
  z: FORK_METRICS.offsetZ + FORK_METRICS.length / 2,  // 3.3 - middle of forks (avoids player-tile collision)
} as const;

/**
 * Helper: Calculate world Y position where vehicle wheels touch ground
 * @param physicsBodyY The Y position of physics body (TransformNode.position.y)
 * @returns The Y position where wheel bottoms touch
 */
export function getWheelGroundContactY(physicsBodyY: number): number {
  return physicsBodyY + VEHICLE_LAYOUT.wheel.bottomY;
}

/**
 * Helper: Calculate physics body Y position to place wheels at ground level
 * @param groundY The desired ground contact Y position (where wheels touch)
 * @returns The Y position for the physics body TransformNode
 *
 * Example: groundY=0 → physicsBodyY=1.0 → wheel bottoms at 1.0+(-1.0)=0 ✓
 */
export function getPhysicsBodyYForGround(groundY: number): number {
  return groundY - VEHICLE_LAYOUT.wheel.bottomY;  // groundY - (-1.0) = groundY + 1.0
}

/**
 * Helper: Calculate wheel rotation angle based on distance traveled
 * @param distance Distance traveled (in units)
 * @returns Rotation angle in radians
 */
export function getWheelRotationFromDistance(distance: number): number {
  // Wheel circumference = 2 * PI * radius
  const circumference = 2 * Math.PI * WHEEL_METRICS.radius;
  // Rotations = distance / circumference
  // Angle = rotations * 2 * PI
  return (distance / circumference) * (2 * Math.PI);
}

/**
 * Debug info: Print all vehicle metrics
 */
export function debugPrintMetrics(): void {
  console.log('=== VEHICLE METRICS ===');
  console.log('BASE_SIZE:', BASE_SIZE);
  console.log('\nCHASSIS:', CHASSIS_METRICS);
  console.log('\nWHEELS:', WHEEL_METRICS);
  console.log('\nFORKS:', FORK_METRICS);
  console.log('\nLAYOUT:', VEHICLE_LAYOUT);
  console.log('\nPHYSICS_BOX:', PHYSICS_BOX);
  console.log('\nTILE_ATTACH_POINT:', TILE_ATTACH_POINT);
  console.log('\n=== VERIFICATION ===');
  console.log('Physics body at y=1.0 → Wheel bottom at y=', getWheelGroundContactY(1.0));
  console.log('Ground at y=0 → Physics body should be at y=', getPhysicsBodyYForGround(0));
  console.log('Total height matches?', PHYSICS_BOX.height === VEHICLE_LAYOUT.totalHeight);
  console.log('Visual fits in physics box?',
    VEHICLE_LAYOUT.minY === -PHYSICS_BOX.halfHeight &&
    VEHICLE_LAYOUT.maxY <= PHYSICS_BOX.halfHeight
  );
}
