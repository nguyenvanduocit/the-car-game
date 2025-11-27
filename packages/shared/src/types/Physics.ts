/**
 * Vector3 type - matches BabylonJS Vector3 interface
 * Serialized as {x, y, z} for Colyseus transmission
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Quaternion type - 3D rotation representation
 * More efficient than Euler angles for physics
 */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Physics constants - network timing and state sync optimization
 * Gameplay physics (force, speed) are server-local for fast iteration
 */
export const PhysicsConstants = {
  // ============================================================================
  // Server tick rates (PERFORMANCE OPTIMIZATION)
  // ============================================================================

  /**
   * Physics simulation rate on server (Hz)
   * Reduced from 60Hz to 30Hz - gives ~33ms budget per step instead of ~16ms
   * Client-side interpolation maintains visual smoothness at 60fps
   */
  PHYSICS_SIMULATION_RATE: 30,

  /**
   * Colyseus state patch rate (Hz)
   * Matches physics rate since state only changes when physics updates
   * Reducing this halves network bandwidth
   */
  STATE_PATCH_RATE: 30,

  /**
   * Legacy constant for backward compatibility
   * @deprecated Use PHYSICS_SIMULATION_RATE instead
   */
  SERVER_PHYSICS_RATE: 30,

  /**
   * Network send rate from client (Hz)
   * Should match server physics rate for best results
   */
  CLIENT_SEND_RATE: 30,

  // ============================================================================
  // Velocity sync thresholds (BANDWIDTH OPTIMIZATION)
  // Only sync velocity when change exceeds threshold
  // This reduces unnecessary network updates for near-stationary objects
  // ============================================================================

  /**
   * Linear velocity sync threshold (units/sec)
   * Only sync if changed by more than this amount
   */
  VELOCITY_SYNC_THRESHOLD: 0.3,

  /**
   * Angular velocity sync threshold (rad/sec)
   * Only sync if changed by more than this amount
   */
  ANGULAR_VELOCITY_SYNC_THRESHOLD: 0.2,

  /**
   * Rotation sync threshold (quaternion component)
   * ~0.01 corresponds to ~0.5 degrees
   * Reduces unnecessary rotation updates from minor jitter
   */
  ROTATION_SYNC_THRESHOLD: 0.01,

  /**
   * Position sync threshold (units)
   * Only sync if moved more than this amount
   * Reduces continuous traffic from stationary objects
   *
   * 0.05 units (5cm) is imperceptible with client interpolation at 30fps
   * This provides 60-70% bandwidth reduction vs 0.01 threshold
   */
  POSITION_SYNC_THRESHOLD: 0.05,

  // ============================================================================
  // Tile sleep thresholds (PHYSICS OPTIMIZATION)
  // Tiles below these velocity thresholds are considered "sleeping"
  // Sleeping tiles skip expensive sync operations
  // ============================================================================

  /**
   * Linear velocity threshold for tile sleep (squared, units/sec)
   * Actual threshold: 0.05 units/sec (sqrt of this value)
   */
  TILE_LINEAR_SLEEP_THRESHOLD_SQ: 0.05 * 0.05,

  /**
   * Angular velocity threshold for tile sleep (squared, rad/sec)
   * Actual threshold: 0.08 rad/sec (sqrt of this value)
   */
  TILE_ANGULAR_SLEEP_THRESHOLD_SQ: 0.08 * 0.08,
} as const;
