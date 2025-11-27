/**
 * Physics constants for the game world
 * All physics values extracted here for easy tuning and iteration
 */

export const PhysicsConstants = {
  // Environment
  GRAVITY: -20.0,

  // Server tick rates (PERFORMANCE OPTIMIZATION)
  // Physics simulation runs at 30Hz (33.33ms per step) - halved from 60Hz
  // This gives ~33ms budget per physics step instead of ~16ms
  // Client interpolation handles visual smoothness at 60fps
  PHYSICS_SIMULATION_RATE: 30, // Hz - physics engine step rate
  STATE_PATCH_RATE: 30, // Hz - Colyseus state sync rate (matches physics)

  // Legacy constant for backward compatibility
  SERVER_PHYSICS_RATE: 30, // Hz - deprecated, use PHYSICS_SIMULATION_RATE

  // DeltaTime clamping (prevents physics instability)
  // Adjusted for 30Hz: max delta is now 66ms (15 FPS minimum)
  MIN_DELTA_TIME: 0.001, // 1ms (1000 FPS)
  MAX_DELTA_TIME: 0.066, // 66ms (15 FPS) - increased for 30Hz rate

  // Velocity sync thresholds (BANDWIDTH OPTIMIZATION)
  // Only sync velocity when change exceeds threshold
  // This reduces unnecessary network updates for near-stationary objects
  VELOCITY_SYNC_THRESHOLD: 0.3, // units/sec - sync if changed by more than this
  ANGULAR_VELOCITY_SYNC_THRESHOLD: 0.2, // rad/sec - sync if changed by more than this

  // Player properties
  PLAYER_MASS: 20.0,
  PLAYER_MOVEMENT_FORCE: 1000.0,
  PLAYER_MAX_SPEED: 25.0,
  PLAYER_LINEAR_DAMPING: 0.5,
  // STABILITY FIX: Increased from 0.3 to 2.0 to prevent accumulated rotation drift
  // Higher angular damping quickly stops pitch/roll oscillations that cause tipping
  PLAYER_ANGULAR_DAMPING: 2.0,
  PLAYER_FRICTION: 0.9,
  PLAYER_RESTITUTION: 0.1,
  PLAYER_STEERING_FORCE: 100.0,
  PLAYER_STEERING_SPEED: 2.0, // Radians per second (speed of steering wheel turn)
  PLAYER_MAX_STEERING_ANGLE: 1.5, // Max turn rate (radians/sec) - reduced from implicit ~3.0

  // Tile properties
  TILE_MASS: 12.0,
  TILE_FRICTION: 0.3,
  TILE_RESTITUTION: 0.15,
  TILE_LINEAR_DAMPING: 0.4,
  TILE_ANGULAR_DAMPING: 0.45,

  // Shooting mechanics
  IMPULSE_BASE: 10,
  IMPULSE_MAX: 3000,
  BACKFORCE_BASE: 9,
  BACKFORCE_MAX: 1000,

  // Combat: Minimum tile velocity to cause damage
  // This threshold distinguishes "shot" tiles from "bumped" tiles
  // - Car bumps typically impart 5-18 units/s to tiles
  // - Meaningful shots (strength >30) give >22 units/s
  // Set to 20 to exclude bumps, include real shots
  MIN_SHOT_VELOCITY_FOR_DAMAGE: 20.0,

  // Material properties for environment
  GROUND_FRICTION: 0.9,
  GROUND_RESTITUTION: 0.1, // Low bounce for realistic floor
  WALL_FRICTION: 0.2,
  WALL_RESTITUTION: 0.5,
  RAMP_FRICTION: 0.1,
  RAMP_RESTITUTION: 0.8,
  ARCH_FRICTION: 0.3,
  ARCH_RESTITUTION: 0.9,
} as const;

/**
 * Physics formula helpers
 */
export const PhysicsFormulas = {
  /**
   * Calculate moment of inertia for a sphere
   * Formula: I = (2/5) * m * r²
   */
  sphereInertia(mass: number, radius: number): number {
    return (2 / 5) * mass * radius * radius;
  },

  /**
   * Calculate moment of inertia for a box
   * Returns { x, y, z } inertia components
   */
  boxInertia(mass: number, width: number, height: number, depth: number): { x: number; y: number; z: number } {
    return {
      x: (mass * (height * height + depth * depth)) / 12,
      y: (mass * (width * width + depth * depth)) / 12,
      z: (mass * (width * width + height * height)) / 12,
    };
  },

  /**
   * Calculate angular velocity from linear velocity (rolling without slipping)
   * Formula: ω = v / r
   */
  rollingAngularVelocity(linearVelocity: number, radius: number): number {
    return linearVelocity / radius;
  },

  /**
   * Quadratic strength mapping for better feel
   * Maps linear input (0-1) to quadratic output curve
   * This gives more power at mid-high range while keeping low values weak
   */
  quadraticStrength(t: number): number {
    return t * t;
  },

  /**
   * Clamp a value between min and max
   */
  clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  },
};
