import HavokPhysics, { HavokPhysicsWithBindings } from '@babylonjs/havok';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsShape } from '@babylonjs/core/Physics/v2/physicsShape';
import { PhysicsMotionType, PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  GROUND_PLANE_DESCRIPTOR,
  WORLD_BOUNDARY_SEGMENTS,
  TILE_CONFIG,
  PLAYER_CONFIG,
  RAMP_DESCRIPTORS,
  ARCH_DESCRIPTORS,
  GOAL_TRIGGER_DESCRIPTORS,
  PHYSICS_BOX, // OLD player metrics (deprecated)
  VEHICLE_PHYSICS_BOX, // NEW vehicle metrics
} from '@blockgame/shared';
import { PhysicsConstants, PhysicsFormulas } from './PhysicsConstants';

// Import physics engine component to extend Scene with enablePhysics
import '@babylonjs/core/Physics/v2/physicsEngineComponent';

/**
 * Physics world for server-side physics simulation
 * Uses NullEngine (headless BabylonJS) with Havok physics at 60Hz
 */
/**
 * Goal trigger collision event data
 */
export interface GoalTriggerEvent {
  goalName: string;
  tileIndex: number;
}

/**
 * Goal trigger collision callback type
 */
export type GoalTriggerCallback = (event: GoalTriggerEvent) => void;

/**
 * Tile-player collision event data
 */
export interface TilePlayerCollisionEvent {
  tileIndex: number;
  playerSessionId: string;
  impactVelocity: number; // Magnitude of tile velocity at collision
}

/**
 * Tile-player collision callback type
 */
export type TilePlayerCollisionCallback = (event: TilePlayerCollisionEvent) => void;

export class PhysicsWorld {
  private havok: HavokPhysicsWithBindings | null = null;
  private engine: NullEngine | null = null;
  private scene: Scene | null = null;
  private havokPlugin: HavokPlugin | null = null;
  private initialized: boolean = false;

  // Tracked physics bodies
  private playerBodies: Map<string, {
    node: TransformNode;
    body: PhysicsBody;
    currentSteering: number;
    targetSteering: number;
    throttle: number;
  }> = new Map();
  private boundaryBodies: PhysicsBody[] = [];
  private groundBody: PhysicsBody | null = null;
  private tileBodies: Map<number, { node: TransformNode; body: PhysicsBody; shape: PhysicsShape }> = new Map();
  private rampBodies: PhysicsBody[] = [];
  private archBodies: PhysicsBody[] = [];
  private goalTriggerBodies: Map<string, PhysicsBody> = new Map(); // goalName -> trigger body

  // Goal trigger collision callback
  private onGoalTriggerCallback: GoalTriggerCallback | null = null;

  // Tile-player collision callback
  private onTilePlayerCollisionCallback: TilePlayerCollisionCallback | null = null;

  // Performance monitoring
  private frameCount: number = 0;
  private lastMetricsLog: number = 0;
  private physicsStepTimes: number[] = [];

  // Reusable Vector3 instances to avoid GC pressure (created once, reused every frame)
  // These are used in hot paths that run 30+ times per second
  private readonly _tempForce = new Vector3();
  private readonly _tempVelocity = new Vector3();
  private readonly _tempAngularVelocity = new Vector3();
  private readonly _zeroVector = Vector3.Zero();

  /**
   * Initialize Havok physics engine with NullEngine
   * Must be called async before using physics
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('PhysicsWorld already initialized');
      return;
    }

    try {
      console.log('[PHYSICS] Initializing server-side Havok physics with NullEngine...');

      // Check WebAssembly support
      if (typeof WebAssembly === 'undefined') {
        throw new Error('WebAssembly not supported. Ensure Bun/Node.js supports WASM.');
      }

      // Load Havok WASM from local physics folder
      // Note: HavokPhysics.wasm is copied from @babylonjs/havok package
      // If missing, run: cp node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm packages/server/src/physics/
      const wasmPath = join(__dirname, 'HavokPhysics.wasm');
      console.log(`[PHYSICS] Loading WASM from: ${wasmPath}`);
      const wasmBuffer = readFileSync(wasmPath);

      // Convert Buffer to ArrayBuffer
      const wasmBinary = wasmBuffer.buffer.slice(
        wasmBuffer.byteOffset,
        wasmBuffer.byteOffset + wasmBuffer.byteLength
      ) as ArrayBuffer;

      this.havok = await HavokPhysics({ wasmBinary });

      if (!this.havok) {
        throw new Error('Failed to load Havok WASM module');
      }

      console.log('[PHYSICS] Havok WASM loaded, creating NullEngine...');

      // Create headless engine (no rendering)
      this.engine = new NullEngine({
        renderWidth: 512,
        renderHeight: 512,
        textureSize: 512,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      });

      // Create scene
      this.scene = new Scene(this.engine);

      // Initialize Havok physics plugin
      // First parameter: useDeltaForWorldStep (boolean)
      //   - true: Use variable time step (delta passed to step method) - default and recommended
      //   - false: Use fixed time step (requires setTimeStep())
      // Second parameter: Havok WASM instance
      this.havokPlugin = new HavokPlugin(true, this.havok);

      // Enable physics in scene with gravity
      this.scene.enablePhysics(
        new Vector3(0, PhysicsConstants.GRAVITY, 0),
        this.havokPlugin
      );

      console.log('[PHYSICS] Physics enabled, creating boundary walls...');

      // Create physical boundaries
      this.createBoundaryWalls();

      // Create ramps for jumping
      this.createRamps();

      // Create goal arches for soccer gameplay
      this.createArches();

      // Create goal trigger planes for collision detection
      this.createGoalTriggers();

      // Setup trigger collision detection for goals
      this.setupGoalTriggerDetection();

      // Setup tile-player collision detection
      this.setupTilePlayerCollisionDetection();

      this.initialized = true;
      console.log('[PHYSICS] Server-side Havok physics initialized successfully');
    } catch (error) {
      console.error('[PHYSICS] Failed to initialize server physics:', error);

      if (error instanceof Error) {
        console.error('[PHYSICS] Error details:', error.message);
        console.error('[PHYSICS] Stack:', error.stack);
      }

      this.initialized = false;
      throw new Error(`Server physics initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create invisible boundary walls at world edges and ground plane
   * These will contain players within the world boundaries
   */
  private createBoundaryWalls(): void {
    if (!this.scene) {
      throw new Error('Scene not initialized');
    }

    // Create ground plane first (floor at y=0)
    this.createGroundPlane();

    for (const wall of WORLD_BOUNDARY_SEGMENTS) {
      // Create transform node for wall
      const wallNode = new TransformNode(`boundary_wall_${wall.name}`, this.scene);
      wallNode.position = new Vector3(wall.position.x, wall.position.y, wall.position.z);

      // Create static physics body (mass = 0)
      const wallBody = new PhysicsBody(
        wallNode,
        PhysicsMotionType.STATIC,
        false,
        this.scene
      );

      // Create box shape with high restitution (bounciness)
      const wallShape = new PhysicsShape(
        {
          type: PhysicsShapeType.BOX,
          parameters: {
            extents: new Vector3(wall.size.width, wall.size.height, wall.size.depth),
          },
        },
        this.scene
      );

      wallBody.shape = wallShape;
      wallBody.setMassProperties({ mass: 0 }); // Static

      // Set material properties for bouncing
      const material = {
        friction: PhysicsConstants.WALL_FRICTION,
        restitution: PhysicsConstants.WALL_RESTITUTION,
      };

      if (wallShape.material) {
        wallShape.material.friction = material.friction;
        wallShape.material.restitution = material.restitution;
      }

      this.boundaryBodies.push(wallBody);
    }

    console.log(`[PHYSICS] Created ${WORLD_BOUNDARY_SEGMENTS.length} boundary walls with bounce physics`);
  }

  /**
   * Create static ground plane at y=0
   * Prevents players from falling through the floor
   */
  private createGroundPlane(): void {
    if (!this.scene) {
      throw new Error('Scene not initialized');
    }

    const groundPosition = GROUND_PLANE_DESCRIPTOR.position;
    const groundSize = GROUND_PLANE_DESCRIPTOR.size;

    // Create transform node for ground (top surface at y=0)
    const groundNode = new TransformNode('ground_plane', this.scene);
    groundNode.position = new Vector3(groundPosition.x, groundPosition.y, groundPosition.z);

    // Create static physics body (mass = 0)
    const groundBody = new PhysicsBody(
      groundNode,
      PhysicsMotionType.STATIC,
      false,
      this.scene
    );

    // Create box shape for ground plane (matches floor dimensions)
    const groundShape = new PhysicsShape(
      {
        type: PhysicsShapeType.BOX,
        parameters: {
          extents: new Vector3(groundSize.width, groundSize.height, groundSize.depth),
        },
      },
      this.scene
    );

    groundBody.shape = groundShape;
    groundBody.setMassProperties({ mass: 0 }); // Static

    // Ground material: medium friction for rolling, low restitution for realistic floor
    const material = {
      friction: PhysicsConstants.GROUND_FRICTION,
      restitution: PhysicsConstants.GROUND_RESTITUTION,
    };

    if (groundShape.material) {
      groundShape.material.friction = material.friction;
      groundShape.material.restitution = material.restitution;
    }

    this.groundBody = groundBody;
    console.log('[PHYSICS] Created ground plane (100x200 units, top surface at y=0)');
  }

  /**
   * Create ramps for jumping/launching
   * Ramps are static angled boxes that players and tiles can use to launch into the air
   */
  private createRamps(): void {
    if (!this.scene) {
      throw new Error('Scene not initialized');
    }

    for (const ramp of RAMP_DESCRIPTORS) {
      // Create transform node for ramp
      const rampNode = new TransformNode(`ramp_${ramp.name}`, this.scene);
      rampNode.position = new Vector3(ramp.position.x, ramp.position.y, ramp.position.z);

      // Rotate around X axis to create slope
      rampNode.rotationQuaternion = Quaternion.RotationAxis(
        new Vector3(1, 0, 0), // X axis
        ramp.rotationX
      );

      // Create static physics body
      const rampBody = new PhysicsBody(
        rampNode,
        PhysicsMotionType.STATIC,
        false,
        this.scene
      );

      // Create box shape for ramp
      const rampShape = new PhysicsShape(
        {
          type: PhysicsShapeType.BOX,
          parameters: {
            extents: new Vector3(ramp.size.width, ramp.size.height, ramp.size.depth),
          },
        },
        this.scene
      );

      rampBody.shape = rampShape;
      rampBody.setMassProperties({ mass: 0 }); // Static

      // Low friction for smooth sliding, high restitution for bouncing
      const material = {
        friction: PhysicsConstants.RAMP_FRICTION,
        restitution: PhysicsConstants.RAMP_RESTITUTION,
      };

      if (rampShape.material) {
        rampShape.material.friction = material.friction;
        rampShape.material.restitution = material.restitution;
      }

      this.rampBodies.push(rampBody);
    }

    console.log(`[PHYSICS] Created ${RAMP_DESCRIPTORS.length} ramps for jumping`);
  }

  /**
   * Create goal arches for soccer-style gameplay
   * Each arch consists of two posts and a crossbar
   */
  private createArches(): void {
    if (!this.scene) {
      throw new Error('Scene not initialized');
    }

    for (const arch of ARCH_DESCRIPTORS) {
      // Left post
      const leftPostNode = new TransformNode(`${arch.name}_left_post`, this.scene);
      leftPostNode.position = new Vector3(
        arch.position.x - arch.width / 2, // Left side
        arch.position.y + arch.height / 2, // Center vertically
        arch.position.z
      );

      const leftPostBody = new PhysicsBody(
        leftPostNode,
        PhysicsMotionType.STATIC,
        false,
        this.scene
      );

      const leftPostShape = new PhysicsShape(
        {
          type: PhysicsShapeType.CYLINDER,
          parameters: {
            radius: arch.postRadius,
            pointA: new Vector3(0, -arch.height / 2, 0), // Bottom of cylinder
            pointB: new Vector3(0, arch.height / 2, 0),  // Top of cylinder
          },
        },
        this.scene
      );

      leftPostBody.shape = leftPostShape;
      leftPostBody.setMassProperties({ mass: 0 });

      // Right post
      const rightPostNode = new TransformNode(`${arch.name}_right_post`, this.scene);
      rightPostNode.position = new Vector3(
        arch.position.x + arch.width / 2, // Right side
        arch.position.y + arch.height / 2,
        arch.position.z
      );

      const rightPostBody = new PhysicsBody(
        rightPostNode,
        PhysicsMotionType.STATIC,
        false,
        this.scene
      );

      const rightPostShape = new PhysicsShape(
        {
          type: PhysicsShapeType.CYLINDER,
          parameters: {
            radius: arch.postRadius,
            pointA: new Vector3(0, -arch.height / 2, 0), // Bottom of cylinder
            pointB: new Vector3(0, arch.height / 2, 0),  // Top of cylinder
          },
        },
        this.scene
      );

      rightPostBody.shape = rightPostShape;
      rightPostBody.setMassProperties({ mass: 0 });

      // Crossbar
      const crossbarNode = new TransformNode(`${arch.name}_crossbar`, this.scene);
      crossbarNode.position = new Vector3(
        arch.position.x,
        arch.position.y + arch.height, // Top
        arch.position.z
      );

      // Rotate crossbar 90 degrees around Z axis to make it horizontal
      crossbarNode.rotationQuaternion = Quaternion.RotationAxis(
        new Vector3(0, 0, 1), // Z axis
        Math.PI / 2
      );

      const crossbarBody = new PhysicsBody(
        crossbarNode,
        PhysicsMotionType.STATIC,
        false,
        this.scene
      );

      const crossbarShape = new PhysicsShape(
        {
          type: PhysicsShapeType.CYLINDER,
          parameters: {
            radius: arch.crossbarRadius,
            pointA: new Vector3(0, -arch.width / 2, 0), // Left end (rotated to horizontal)
            pointB: new Vector3(0, arch.width / 2, 0),  // Right end (rotated to horizontal)
          },
        },
        this.scene
      );

      crossbarBody.shape = crossbarShape;
      crossbarBody.setMassProperties({ mass: 0 });

      // High restitution for bouncing
      const material = {
        friction: PhysicsConstants.ARCH_FRICTION,
        restitution: PhysicsConstants.ARCH_RESTITUTION,
      };

      if (leftPostShape.material) {
        leftPostShape.material.friction = material.friction;
        leftPostShape.material.restitution = material.restitution;
      }
      if (rightPostShape.material) {
        rightPostShape.material.friction = material.friction;
        rightPostShape.material.restitution = material.restitution;
      }
      if (crossbarShape.material) {
        crossbarShape.material.friction = material.friction;
        crossbarShape.material.restitution = material.restitution;
      }

      this.archBodies.push(leftPostBody, rightPostBody, crossbarBody);
    }

    console.log(`[PHYSICS] Created ${ARCH_DESCRIPTORS.length} goal arches for soccer gameplay`);
  }

  /**
   * Create invisible trigger planes at goal positions for collision detection
   * These trigger collision events when tiles pass through goals
   */
  private createGoalTriggers(): void {
    if (!this.scene) {
      throw new Error('Scene not initialized');
    }

    for (const trigger of GOAL_TRIGGER_DESCRIPTORS) {
      // Create transform node for trigger plane
      const triggerNode = new TransformNode(trigger.name, this.scene);
      triggerNode.position = new Vector3(
        trigger.position.x,
        trigger.position.y,
        trigger.position.z
      );

      // Create static physics body (triggers don't move)
      const triggerBody = new PhysicsBody(
        triggerNode,
        PhysicsMotionType.STATIC,
        false,
        this.scene
      );

      // Create thin box shape (plane) matching trigger descriptor dimensions
      const triggerShape = new PhysicsShape(
        {
          type: PhysicsShapeType.BOX,
          parameters: {
            extents: new Vector3(
              trigger.size.width / 2,
              trigger.size.height / 2,
              trigger.size.depth / 2
            ),
          },
        },
        this.scene
      );

      // Mark as trigger (no physical collision, only events)
      triggerShape.isTrigger = true;
      triggerBody.shape = triggerShape;
      triggerBody.setMassProperties({ mass: 0 }); // Static

      // Enable collision callbacks for this trigger body
      // This ensures the Havok plugin will notify us of trigger collisions
      if (this.havokPlugin) {
        this.havokPlugin.setCollisionCallbackEnabled(triggerBody, true);
      }

      this.goalTriggerBodies.set(trigger.name, triggerBody);

      console.log(`[PHYSICS] Created goal trigger: ${trigger.name} at (${trigger.position.x.toFixed(2)}, ${trigger.position.y.toFixed(2)}, ${trigger.position.z.toFixed(2)})`);
    }

    console.log(`[PHYSICS] Created ${GOAL_TRIGGER_DESCRIPTORS.length} goal trigger planes for collision detection`);
  }

  /**
   * Setup goal trigger collision detection
   * Listens for trigger collision events and emits goal events when tiles enter goals
   */
  private setupGoalTriggerDetection(): void {
    if (!this.havokPlugin) {
      throw new Error('Havok plugin not initialized');
    }

    // Subscribe to trigger collision observable
    // NOTE: Removed debug console.log - they cause memory pressure when called 100s of times/sec
    this.havokPlugin.onTriggerCollisionObservable.add((collisionEvent) => {
      const { collider, collidedAgainst } = collisionEvent;

      // Determine which body is the goal trigger and which is potentially a tile
      const goalNameFromCollider = this.getGoalNameFromBody(collider);
      const goalNameFromCollidedAgainst = this.getGoalNameFromBody(collidedAgainst);

      let goalName: string | null = null;
      let tileBody: PhysicsBody | null = null;

      if (goalNameFromCollider) {
        goalName = goalNameFromCollider;
        tileBody = collidedAgainst;
      } else if (goalNameFromCollidedAgainst) {
        goalName = goalNameFromCollidedAgainst;
        tileBody = collider;
      }

      // If we found a goal and a valid tile body, check if it's a tile
      if (goalName && tileBody) {
        const tileIndex = this.getTileIndexFromBody(tileBody);
        if (tileIndex !== null && this.onGoalTriggerCallback) {
          this.onGoalTriggerCallback({ goalName, tileIndex });
        }
      }
    });

    console.log('[PHYSICS] Goal trigger collision detection enabled');
  }

  /**
   * Get goal name from a physics body (if it's a goal trigger)
   */
  private getGoalNameFromBody(body: PhysicsBody): string | null {
    for (const [goalName, triggerBody] of this.goalTriggerBodies.entries()) {
      if (triggerBody === body) {
        return goalName;
      }
    }
    return null;
  }

  /**
   * Get tile index from a physics body (if it's a tile)
   */
  private getTileIndexFromBody(body: PhysicsBody): number | null {
    for (const [tileIndex, tileData] of this.tileBodies.entries()) {
      if (tileData.body === body) {
        return tileIndex;
      }
    }
    return null;
  }

  /**
   * Get player sessionId from a physics body (if it's a player)
   */
  private getPlayerSessionIdFromBody(body: PhysicsBody): string | null {
    for (const [sessionId, playerData] of this.playerBodies.entries()) {
      if (playerData.body === body) {
        return sessionId;
      }
    }
    return null;
  }

  /**
   * Setup tile-player collision detection
   * Listens for collision events and emits damage events when tiles hit players
   */
  private setupTilePlayerCollisionDetection(): void {
    if (!this.havokPlugin) {
      throw new Error('Havok plugin not initialized');
    }

    // Subscribe to collision observable (not trigger)
    this.havokPlugin.onCollisionObservable.add((collisionEvent) => {
      const { collider, collidedAgainst } = collisionEvent;

      // Check if collision involves a tile and a player
      const tileIndex1 = this.getTileIndexFromBody(collider);
      const tileIndex2 = this.getTileIndexFromBody(collidedAgainst);
      const playerId1 = this.getPlayerSessionIdFromBody(collider);
      const playerId2 = this.getPlayerSessionIdFromBody(collidedAgainst);

      let tileIndex: number | null = null;
      let playerSessionId: string | null = null;
      let tileBody: PhysicsBody | null = null;

      // Determine which body is tile and which is player
      if (tileIndex1 !== null && playerId2 !== null) {
        tileIndex = tileIndex1;
        playerSessionId = playerId2;
        tileBody = collider;
      } else if (tileIndex2 !== null && playerId1 !== null) {
        tileIndex = tileIndex2;
        playerSessionId = playerId1;
        tileBody = collidedAgainst;
      }

      // If we found a tile-player collision
      if (tileIndex !== null && playerSessionId !== null && tileBody) {
        // Get tile velocity magnitude for damage calculation
        const velocity = tileBody.getLinearVelocity();
        const impactVelocity = Math.sqrt(
          velocity.x * velocity.x +
          velocity.y * velocity.y +
          velocity.z * velocity.z
        );

        // Only trigger damage if tile was "shot" (high velocity), not just "bumped" (low velocity)
        // This distinguishes intentional shots from accidental car-tile collisions
        if (impactVelocity > PhysicsConstants.MIN_SHOT_VELOCITY_FOR_DAMAGE && this.onTilePlayerCollisionCallback) {
          console.log(`[PHYSICS] Tile ${tileIndex} SHOT player ${playerSessionId} at velocity ${impactVelocity.toFixed(2)} (threshold: ${PhysicsConstants.MIN_SHOT_VELOCITY_FOR_DAMAGE})`);
          this.onTilePlayerCollisionCallback({
            tileIndex,
            playerSessionId,
            impactVelocity,
          });
        }
      }
    });

    console.log('[PHYSICS] Tile-player collision detection enabled');
  }

  /**
   * Set callback for goal trigger collisions
   * @param callback Function to call when a tile enters a goal trigger
   */
  setGoalTriggerCallback(callback: GoalTriggerCallback | null): void {
    this.onGoalTriggerCallback = callback;
    console.log(`[PHYSICS] Goal trigger callback ${callback ? 'set' : 'cleared'}`);
  }

  /**
   * Set callback for tile-player collisions
   * @param callback Function to call when a tile hits a player
   */
  setTilePlayerCollisionCallback(callback: TilePlayerCollisionCallback | null): void {
    this.onTilePlayerCollisionCallback = callback;
    console.log(`[PHYSICS] Tile-player collision callback ${callback ? 'set' : 'cleared'}`);
  }

  /**
   * Manually check if any tiles are inside goal trigger zones
   * This is needed because ANIMATED (kinematic) bodies don't trigger collision events
   * Call this every physics step to detect goal scoring
   */
  checkGoalTriggers(): void {
    if (!this.onGoalTriggerCallback) return;

    // Check each tile against each goal trigger
    for (const [tileIndex, tileData] of this.tileBodies.entries()) {
      const tilePos = tileData.node.position;

      for (const [goalName, goalTrigger] of this.goalTriggerBodies.entries()) {
        const goalNode = goalTrigger.transformNode;
        if (!goalNode) continue;

        const goalPos = goalNode.position;

        // Get goal trigger dimensions from GOAL_TRIGGER_DESCRIPTORS
        const triggerDesc = GOAL_TRIGGER_DESCRIPTORS.find(t => t.name === goalName);
        if (!triggerDesc) continue;

        const halfWidth = triggerDesc.size.width / 2;
        const halfHeight = triggerDesc.size.height / 2;
        const halfDepth = triggerDesc.size.depth / 2;

        // Check if tile center is inside the trigger box (AABB collision)
        const insideX = Math.abs(tilePos.x - goalPos.x) < halfWidth;
        const insideY = Math.abs(tilePos.y - goalPos.y) < halfHeight;
        const insideZ = Math.abs(tilePos.z - goalPos.z) < halfDepth;

        if (insideX && insideY && insideZ) {
          console.log(`[PHYSICS] Manual trigger check: tile ${tileIndex} → ${goalName}`);
          this.onGoalTriggerCallback({ goalName, tileIndex });
          // Note: This will fire every frame while tile is in trigger
          // The callback handler should implement debouncing if needed
        }
      }
    }
  }

  /**
   * Create physics body for a player
   */
  createPlayerBody(sessionId: string, position: { x: number; y: number; z: number }): void {
    if (!this.scene) {
      throw new Error('Scene not initialized');
    }

    // Create transform node for player
    const playerNode = new TransformNode(`player_${sessionId}`, this.scene);
    playerNode.position = new Vector3(position.x, position.y, position.z);

    // Initialize rotation quaternion (required for physics rotation tracking)
    if (!playerNode.rotationQuaternion) {
      playerNode.rotationQuaternion = Quaternion.Identity();
    }

    // Create dynamic physics body (affected by forces)
    const playerBody = new PhysicsBody(
      playerNode,
      PhysicsMotionType.DYNAMIC,
      false,
      this.scene
    );

    // Create box shape (vehicle - monster truck chassis)
    // Use metrics from vehicleMetrics.ts (1.5×2×2.5 - wider, lower than old humanoid)
    const playerShape = new PhysicsShape(
      {
        type: PhysicsShapeType.BOX,
        parameters: {
          extents: new Vector3(
            VEHICLE_PHYSICS_BOX.width,    // 1.5
            VEHICLE_PHYSICS_BOX.height,   // 2.0
            VEHICLE_PHYSICS_BOX.depth     // 2.5
          ),
        },
      },
      this.scene
    );

    playerBody.shape = playerShape;

    // Lighter mass for more responsive movement
    const mass = PhysicsConstants.PLAYER_MASS;
    const inertia = PhysicsFormulas.boxInertia(
      mass,
      VEHICLE_PHYSICS_BOX.width,
      VEHICLE_PHYSICS_BOX.height,
      VEHICLE_PHYSICS_BOX.depth
    );

    // Center of mass tuned for stability:
    // - Low Y: prevents wheelies/tipping backward
    // - Slight rear Z: maintains steering feel without excessive tipping
    const centerOfMassOffset = new Vector3(
      0,                                    // No X offset (centered)
      -VEHICLE_PHYSICS_BOX.height * 0.3,   // Lower center of mass (30% down from center)
      -VEHICLE_PHYSICS_BOX.depth * 0.15    // Slight rear offset (15% back, reduced from 35%)
    );

    playerBody.setMassProperties({
      mass: mass,
      inertia: new Vector3(inertia.x, inertia.y, inertia.z),
      centerOfMass: centerOfMassOffset,
    });

    // Very high friction for quick stopping
    const material = {
      friction: PhysicsConstants.PLAYER_FRICTION,
      restitution: PhysicsConstants.PLAYER_RESTITUTION,
    };

    if (playerShape.material) {
      playerShape.material.friction = material.friction;
      playerShape.material.restitution = material.restitution;
    }

    // Much higher damping for quick deceleration
    playerBody.setLinearDamping(PhysicsConstants.PLAYER_LINEAR_DAMPING);
    playerBody.setAngularDamping(PhysicsConstants.PLAYER_ANGULAR_DAMPING);

    // Enable collision callbacks for tile-player collision detection
    if (this.havokPlugin) {
      this.havokPlugin.setCollisionCallbackEnabled(playerBody, true);
    }

    this.playerBodies.set(sessionId, {
      node: playerNode,
      body: playerBody,
      currentSteering: 0,
      targetSteering: 0,
      throttle: 0
    });
    console.log(`[PHYSICS] Created physics body for player ${sessionId}`);
  }

  /**
   * Remove player physics body
   */
  removePlayerBody(sessionId: string): void {
    const playerData = this.playerBodies.get(sessionId);
    if (playerData) {
      playerData.body.dispose();
      playerData.node.dispose();
      this.playerBodies.delete(sessionId);
      console.log(`[PHYSICS] Removed physics body for player ${sessionId}`);
    }
  }

  /**
   * Apply force to player physics body for momentum-based movement
   * Holding keys continuously applies force → speed builds up over time
   * NOTE: Uses reusable Vector3 instances to avoid GC pressure
   */
  applyPlayerVelocity(sessionId: string, inputDirection: { x: number; y: number; z: number }): void {
    const playerData = this.playerBodies.get(sessionId);
    if (!playerData) return;

    const currentVel = playerData.body.getLinearVelocity();
    const isControlling = Math.abs(inputDirection.x) > 0.01 || Math.abs(inputDirection.z) > 0.01;

    if (isControlling) {
      // Apply force (builds momentum when holding keys)
      const movementForce = PhysicsConstants.PLAYER_MOVEMENT_FORCE;
      // Reuse _tempForce instead of new Vector3()
      this._tempForce.set(
        inputDirection.x * movementForce,
        0,
        inputDirection.z * movementForce
      );

      playerData.body.applyForce(this._tempForce, playerData.node.position);

      // Cap max speed to prevent infinite acceleration
      const currentSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.z * currentVel.z);
      const maxSpeed = PhysicsConstants.PLAYER_MAX_SPEED;

      if (currentSpeed > maxSpeed) {
        const scale = maxSpeed / currentSpeed;
        // Reuse _tempVelocity instead of new Vector3()
        this._tempVelocity.set(
          currentVel.x * scale,
          currentVel.y,
          currentVel.z * scale
        );
        playerData.body.setLinearVelocity(this._tempVelocity);
      }
    }

    // Box physics: No rolling, player slides instead
    // Zero angular velocity to prevent rotation (reuse _zeroVector)
    playerData.body.setAngularVelocity(this._zeroVector);
  }

  /**
   * Apply car-like controls (racing game style)
   * - Throttle: Forward/backward force in car's facing direction
   * - Steering: Angular velocity for turning
   * Car direction is determined by physics rotation, not camera
   */
  applyCarControls(sessionId: string, throttle: number, steering: number): void {
    const playerData = this.playerBodies.get(sessionId);
    if (!playerData) return;

    // Just update state - physics loop handles the rest
    playerData.throttle = throttle;
    playerData.targetSteering = steering;
  }

  /**
   * Update player controls (steering momentum + throttle)
   * Called every physics step
   * NOTE: Uses reusable Vector3 instances (_tempForce, _tempAngularVelocity, _tempVelocity)
   * to avoid GC pressure from allocating 240+ objects/second with 2 players
   */
  private updatePlayerControls(deltaTime: number): void {
    this.playerBodies.forEach((data) => {
      // 1. Update Steering Momentum
      // Move currentSteering towards targetSteering
      const target = data.targetSteering;
      const current = data.currentSteering;
      const speed = PhysicsConstants.PLAYER_STEERING_SPEED;

      let newSteering = current;

      if (target > current) {
        newSteering += speed * deltaTime;
        if (newSteering > target) newSteering = target;
      } else if (target < current) {
        newSteering -= speed * deltaTime;
        if (newSteering < target) newSteering = target;
      }

      data.currentSteering = newSteering;

      // 2. Apply Steering (Angular Velocity)
      // Map normalized steering (-1 to 1) to max angle
      const turnRate = PhysicsConstants.PLAYER_MAX_STEERING_ANGLE;

      // Preserve X/Z angular velocity from physics (pitch/roll from ramps)
      // Only override Y-axis for steering
      const currentAngular = data.body.getAngularVelocity();
      this._tempAngularVelocity.set(
        currentAngular.x,                                         // Preserve pitch from physics
        Math.abs(newSteering) > 0.001 ? newSteering * turnRate : 0, // Steering rotation
        currentAngular.z                                          // Preserve roll from physics
      );
      data.body.setAngularVelocity(this._tempAngularVelocity);

      // 3. Apply Throttle (Force)
      const throttle = data.throttle;
      if (Math.abs(throttle) > 0.01) {
        // Get car's current rotation to determine forward direction
        const rotation = data.node.rotationQuaternion;
        if (!rotation) return;

        // Convert quaternion to yaw
        const yaw = Math.atan2(
          2 * (rotation.w * rotation.y + rotation.x * rotation.z),
          1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z)
        );

        const forwardX = Math.sin(yaw);
        const forwardZ = Math.cos(yaw);

        const movementForce = PhysicsConstants.PLAYER_MOVEMENT_FORCE;
        // Reuse _tempForce instead of new Vector3()
        this._tempForce.set(
          forwardX * throttle * movementForce,
          0,
          forwardZ * throttle * movementForce
        );

        data.body.applyForce(this._tempForce, data.node.position);

        // Cap max speed
        const currentVel = data.body.getLinearVelocity();
        const currentSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.z * currentVel.z);
        const maxSpeed = PhysicsConstants.PLAYER_MAX_SPEED;

        if (currentSpeed > maxSpeed) {
          const scale = maxSpeed / currentSpeed;
          // Reuse _tempVelocity instead of new Vector3()
          this._tempVelocity.set(
            currentVel.x * scale,
            currentVel.y,
            currentVel.z * scale
          );
          data.body.setLinearVelocity(this._tempVelocity);
        }
      }
    });
  }

  /**
   * Get player position from physics body
   */
  getPlayerPosition(sessionId: string): { x: number; y: number; z: number } | null {
    const playerData = this.playerBodies.get(sessionId);
    if (playerData) {
      const pos = playerData.node.position;
      return { x: pos.x, y: pos.y, z: pos.z };
    }
    return null;
  }

  /**
   * Get player steering value (interpolated)
   */
  getPlayerSteering(sessionId: string): number {
    const playerData = this.playerBodies.get(sessionId);
    return playerData ? playerData.currentSteering : 0;
  }

  /**
   * Get player rotation quaternion from physics body
   */
  getPlayerRotation(sessionId: string): { x: number; y: number; z: number; w: number } | null {
    const playerData = this.playerBodies.get(sessionId);
    if (playerData) {
      const quat = playerData.node.rotationQuaternion;
      if (quat) {
        return { x: quat.x, y: quat.y, z: quat.z, w: quat.w };
      }
    }
    return null;
  }

  /**
   * Set player Y-axis rotation (for body facing direction)
   * This updates the physics body rotation to match camera/look direction
   * @param sessionId Player session ID
   * @param yRotation Y-axis rotation in radians (camera alpha)
   */
  setPlayerYRotation(sessionId: string, yRotation: number): void {
    const playerData = this.playerBodies.get(sessionId);
    if (!playerData) return;

    // ⏺ COORDINATE KNOWLEDGE: Camera-to-Body Rotation Mapping
    //
    // Changed offset from -PI/2 → +PI/2 to make body face FORWARD (camera behind back)
    //
    // Formula:
    //   playerFacingAngle = -yRotation + Math.PI / 2
    //
    // Explanation:
    //   - Camera alpha=0 (at +X position)
    //   - Body rotY = +PI/2 → faces -X direction
    //   - → Body faces AWAY from camera (camera behind back) ✓
    //   - -yRotation → camera rotates left, body rotates left (same direction) ✓
    //
    // Verified behavior:
    //   - Camera positioned behind player's back ✓
    //   - Rotate camera left → body rotates left ✓
    //   - Move forward → moves in correct direction ✓
    const playerFacingAngle = -yRotation + Math.PI / 2;

    // Create quaternion for Y-axis rotation
    const yawQuat = Quaternion.RotationAxis(
      new Vector3(0, 1, 0), // Y-axis
      playerFacingAngle
    );

    // Update node rotation ONLY (don't use setTargetTransform - it locks physics)
    // Physics body will read from node rotation automatically
    if (!playerData.node.rotationQuaternion) {
      playerData.node.rotationQuaternion = Quaternion.Identity();
    }
    playerData.node.rotationQuaternion.copyFrom(yawQuat);
  }

  /**
   * Update physics simulation (called at 60Hz)
   *
   * IMPLEMENTATION NOTE: Using private API physicsEngine._step()
   *
   * BabylonJS Physics v2 doesn't provide a public API for manual physics stepping.
   * The physics engine is designed to be stepped automatically during scene.render().
   * However, in headless/server environments with NullEngine:
   *
   * - scene.render() would trigger the full render pipeline (unnecessary overhead)
   * - We only need physics simulation, not rendering
   * - The private _step() method directly advances physics without rendering
   *
   * Alternative approaches considered:
   * 1. scene.render() - Works but includes unnecessary rendering overhead
   * 2. scene._advancePhysicsEngineStep() - Also private API
   * 3. Deterministic lockstep with render() - Overkill for headless physics
   *
   * The _step() method is the most direct and efficient approach for server-side
   * physics in a headless environment. This is a common pattern in BabylonJS
   * multiplayer games using NullEngine.
   *
   * If BabylonJS adds a public API in the future (e.g., physicsEngine.step()),
   * this should be updated.
   *
   * @param deltaTime Time elapsed since last physics update (in seconds)
   */
  step(deltaTime: number): void {
    if (!this.initialized || !this.scene) return;

    const stepStartTime = performance.now();

    // Clamp deltaTime to prevent physics instability
    // Values outside this range can cause tunneling, jitter, or explosion
    const clampedDelta = PhysicsFormulas.clamp(
      deltaTime,
      PhysicsConstants.MIN_DELTA_TIME,
      PhysicsConstants.MAX_DELTA_TIME
    );

    if (deltaTime !== clampedDelta) {
      console.warn(`[PHYSICS] DeltaTime clamped: ${deltaTime.toFixed(4)}s → ${clampedDelta.toFixed(4)}s`);
    }

    // Update player controls (momentum steering)
    this.updatePlayerControls(clampedDelta);

    // Step physics simulation without rendering (headless)
    const physicsEngine = this.scene.getPhysicsEngine();
    if (physicsEngine) {
      const physicsStart = performance.now();
      // Using private API - see implementation note above for justification
      physicsEngine._step(clampedDelta);
      const physicsTime = performance.now() - physicsStart;

      // Track physics step time for metrics
      this.physicsStepTimes.push(physicsTime);
      if (this.physicsStepTimes.length > 60) {
        this.physicsStepTimes.shift(); // Keep last 60 samples (~2 seconds @ 30Hz)
      }
    }

    const totalStepTime = performance.now() - stepStartTime;

    // Track frame count for metrics (verbose logging removed - use PM2 monitoring instead)
    this.frameCount++;
  }

  /**
   * Log performance metrics for debugging
   */
  private logPerformanceMetrics(currentStepTime: number): void {
    const activePlayers = this.playerBodies.size;
    const activeTiles = this.tileBodies.size;
    const totalBodies = activePlayers + activeTiles + this.boundaryBodies.length + this.rampBodies.length + this.archBodies.length + 1; // +1 for ground

    // Calculate average physics step time
    const avgPhysicsTime = this.physicsStepTimes.length > 0
      ? this.physicsStepTimes.reduce((sum, t) => sum + t, 0) / this.physicsStepTimes.length
      : 0;

    const maxPhysicsTime = this.physicsStepTimes.length > 0
      ? Math.max(...this.physicsStepTimes)
      : 0;

    console.log(`[PHYSICS METRICS] Frame: ${this.frameCount} | Players: ${activePlayers} | Tiles: ${activeTiles} | Total Bodies: ${totalBodies}`);
    console.log(`[PHYSICS METRICS] Avg Physics Step: ${avgPhysicsTime.toFixed(2)}ms | Max: ${maxPhysicsTime.toFixed(2)}ms | Current: ${currentStepTime.toFixed(2)}ms`);
  }

  /**
   * Check if physics is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get Havok instance
   */
  getHavok(): HavokPhysicsWithBindings {
    if (!this.initialized || !this.havok) {
      throw new Error('PhysicsWorld not initialized. Call initialize() first.');
    }
    return this.havok;
  }

  /**
   * Get HavokPlugin instance for collision observables
   */
  getHavokPlugin(): HavokPlugin {
    if (!this.initialized || !this.havokPlugin) {
      throw new Error('PhysicsWorld not initialized. Call initialize() first.');
    }
    return this.havokPlugin;
  }

  /**
   * Ensure a tile physics body exists for the given tile ID
   * Creates a new dynamic box body if none is present
   */
  ensureTileBody(
    tileIndex: number,
    position: { x: number; y: number; z: number },
    rotation?: { x: number; y: number; z: number; w: number }
  ): void {
    if (this.tileBodies.has(tileIndex)) {
      return;
    }

    if (!this.scene) {
      throw new Error('Scene not initialized');
    }

    const node = new TransformNode(`tile_${tileIndex}`, this.scene);
    node.position.set(position.x, position.y, position.z);
    node.rotationQuaternion = node.rotationQuaternion ?? Quaternion.Identity();
    node.rotationQuaternion.set(
      rotation?.x ?? 0,
      rotation?.y ?? 0,
      rotation?.z ?? 0,
      rotation?.w ?? 1
    );

    const body = new PhysicsBody(
      node,
      PhysicsMotionType.DYNAMIC,
      false,
      this.scene
    );

    const extents = new Vector3(
      TILE_CONFIG.meshSize.width,
      TILE_CONFIG.meshSize.height,
      TILE_CONFIG.meshSize.depth
    );

    const shape = new PhysicsShape(
      {
        type: PhysicsShapeType.BOX,
        parameters: { extents },
      },
      this.scene
    );

    body.shape = shape;

    const tileMaterial = {
      friction: PhysicsConstants.TILE_FRICTION,
      restitution: PhysicsConstants.TILE_RESTITUTION,
    };

    if (shape.material) {
      shape.material.friction = tileMaterial.friction;
      shape.material.restitution = tileMaterial.restitution;
    }

    const tileMass = PhysicsConstants.TILE_MASS;
    const width = TILE_CONFIG.meshSize.width;
    const height = TILE_CONFIG.meshSize.height;
    const depth = TILE_CONFIG.meshSize.depth;

    const inertia = PhysicsFormulas.boxInertia(tileMass, width, height, depth);

    body.setMassProperties({
      mass: tileMass,
      inertia: new Vector3(inertia.x, inertia.y, inertia.z),
    });

    body.setLinearDamping(PhysicsConstants.TILE_LINEAR_DAMPING);
    body.setAngularDamping(PhysicsConstants.TILE_ANGULAR_DAMPING);

    // Enable collision callbacks for trigger detection (goal scoring)
    if (this.havokPlugin) {
      this.havokPlugin.setCollisionCallbackEnabled(body, true);
    }

    this.tileBodies.set(tileIndex, { node, body, shape });
    // console.log(`[PHYSICS] Created tile body for tile ${tileIndex} at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
  }

  /**
   * Remove tile physics body (when tile is held/locked/placed)
   */
  removeTileBody(tileIndex: number): void {
    const entry = this.tileBodies.get(tileIndex);
    if (!entry) return;

    entry.body.dispose();
    entry.shape.dispose();
    entry.node.dispose();
    this.tileBodies.delete(tileIndex);
    console.log(`[PHYSICS] Removed tile body for tile ${tileIndex}`);
  }

  /**
   * Iterate over all tile physics bodies
   */
  forEachTileBody(callback: (tileIndex: number, data: { node: TransformNode; body: PhysicsBody }) => void): void {
    this.tileBodies.forEach((data, tileIndex) => {
      callback(tileIndex, data);
    });
  }

  /**
   * Check whether a tile body exists
   */
  hasTileBody(tileIndex: number): boolean {
    return this.tileBodies.has(tileIndex);
  }

  /**
   * Teleport tile body to new position (clean teleport, zero velocity)
   * Used when shooting LOCKED/CHARGING tiles - moves body to player position
   */
  teleportTileBody(
    tileIndex: number,
    position: { x: number; y: number; z: number },
    rotation?: { x: number; y: number; z: number; w: number }
  ): void {
    const tileData = this.tileBodies.get(tileIndex);
    if (!tileData) {
      console.error(`[PHYSICS] Cannot teleport tile ${tileIndex}: body not found!`);
      return;
    }

    const currentMotionType = tileData.body.getMotionType();
    console.log(`[PHYSICS] Teleporting tile ${tileIndex} (motion type: ${currentMotionType})`);

    // ROBUST TELEPORT: Dispose old body and recreate at new position
    // This is the ONLY way to guarantee instant position change in BabylonJS Physics V2

    // Save current properties
    const oldShape = tileData.shape;
    const oldNode = tileData.node;
    const scene = this.scene;

    if (!scene) {
      console.error(`[PHYSICS] Cannot teleport: scene not initialized`);
      return;
    }

    // Dispose old body and shape
    tileData.body.dispose();
    tileData.shape.dispose();

    // Update node to new position
    oldNode.position.set(position.x, position.y, position.z);
    if (rotation) {
      if (!oldNode.rotationQuaternion) {
        oldNode.rotationQuaternion = Quaternion.Identity();
      }
      oldNode.rotationQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }

    // Create new body at new position
    const newBody = new PhysicsBody(
      oldNode,
      currentMotionType,
      false,
      scene
    );

    // Recreate shape
    const extents = new Vector3(
      TILE_CONFIG.meshSize.width,
      TILE_CONFIG.meshSize.height,
      TILE_CONFIG.meshSize.depth
    );

    const newShape = new PhysicsShape(
      {
        type: PhysicsShapeType.BOX,
        parameters: { extents },
      },
      scene
    );

    newBody.shape = newShape;

    // Restore material properties
    const tileMaterial = {
      friction: PhysicsConstants.TILE_FRICTION,
      restitution: PhysicsConstants.TILE_RESTITUTION,
    };

    if (newShape.material) {
      newShape.material.friction = tileMaterial.friction;
      newShape.material.restitution = tileMaterial.restitution;
    }

    // Restore mass properties
    const tileMass = PhysicsConstants.TILE_MASS;
    const width = TILE_CONFIG.meshSize.width;
    const height = TILE_CONFIG.meshSize.height;
    const depth = TILE_CONFIG.meshSize.depth;

    const inertia = PhysicsFormulas.boxInertia(tileMass, width, height, depth);

    newBody.setMassProperties({
      mass: tileMass,
      inertia: new Vector3(inertia.x, inertia.y, inertia.z),
    });

    newBody.setLinearDamping(PhysicsConstants.TILE_LINEAR_DAMPING);
    newBody.setAngularDamping(PhysicsConstants.TILE_ANGULAR_DAMPING);

    // Enable collision callbacks
    if (this.havokPlugin) {
      this.havokPlugin.setCollisionCallbackEnabled(newBody, true);
    }

    // Update stored reference
    this.tileBodies.set(tileIndex, { node: oldNode, body: newBody, shape: newShape });

    console.log(`[PHYSICS] Recreated tile body ${tileIndex} at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
  }

  /**
   * Set the motion type of a tile body (DYNAMIC or ANIMATED)
   */
  setTileMotionType(tileIndex: number, motionType: PhysicsMotionType): void {
    const tileData = this.tileBodies.get(tileIndex);
    if (!tileData) return;

    const currentType = tileData.body.getMotionType();
    if (currentType !== motionType) {
      tileData.body.setMotionType(motionType);
      console.log(`[PHYSICS] Tile ${tileIndex} motion type changed from ${currentType} to ${motionType}`);
    }
  }

  /**
   * Move a tile while being held (position-controlled, no physics)
   * Uses disablePreStep to directly control position without physics simulation
   */
  moveTileHeld(
    tileIndex: number,
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number; w: number }
  ): void {
    const tileData = this.tileBodies.get(tileIndex);
    if (!tileData) return;

    // Update transform node position
    tileData.node.position.set(position.x, position.y, position.z);
    if (!tileData.node.rotationQuaternion) {
      tileData.node.rotationQuaternion = Quaternion.Identity();
    }
    tileData.node.rotationQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    // CRITICAL: disablePreStep=false makes physics body sync FROM node (not physics engine)
    // This gives instant position control without physics simulation
    // Body stays DYNAMIC but position is controlled by node
    tileData.body.disablePreStep = false;

    // Zero velocities to prevent drift
    tileData.body.setLinearVelocity(Vector3.Zero());
    tileData.body.setAngularVelocity(Vector3.Zero());
  }

  /**
   * Re-enable physics simulation for a tile (after being held)
   * Call this before applying impulse to ensure physics is active
   */
  enableTilePhysics(tileIndex: number): void {
    const tileData = this.tileBodies.get(tileIndex);
    if (!tileData) return;

    // Re-enable physics simulation (body will now be controlled by physics engine)
    tileData.body.disablePreStep = true;

    console.log(`[PHYSICS] Re-enabled physics for tile ${tileIndex}`);
  }

  /**
   * Apply impulse to tile (for shooting with right mouse button)
   * @param tileIndex The tile index (0-399)
   * @param direction Normalized direction vector
   * @param strength Strength multiplier (1-100) from charge time
   */
  applyTileImpulse(
    tileIndex: number,
    direction: { x: number; y: number; z: number },
    strength: number
  ): void {
    const tileData = this.tileBodies.get(tileIndex);
    if (!tileData) {
      console.warn(`[PHYSICS] Cannot apply impulse to tile ${tileIndex}: body not found`);
      return;
    }

    // Map strength (1-100) to impulse force (10-3000)
    // Using quadratic scaling for better feel - more power at mid-high range
    // strength 1 = 10 impulse (very weak)
    // strength 100 = 3000 impulse (very strong)
    const t = (strength - 1) / 99;
    const quadraticT = PhysicsFormulas.quadraticStrength(t);
    const impulseStrength = PhysicsConstants.IMPULSE_BASE +
      quadraticT * (PhysicsConstants.IMPULSE_MAX - PhysicsConstants.IMPULSE_BASE);

    // Calculate impulse vector (direction * impulseStrength)
    const impulse = new Vector3(
      direction.x * impulseStrength,
      direction.y * impulseStrength,
      direction.z * impulseStrength
    );

    // Apply impulse at tile center
    tileData.body.applyImpulse(impulse, tileData.node.position);

    console.log(`[PHYSICS] Applied impulse to tile ${tileIndex}: strength=${strength}, impulse=${impulseStrength.toFixed(0)}`);
  }

  /**
   * Apply backforce to player (recoil from shooting tile)
   * Newton's third law: equal and opposite reaction
   * @param sessionId The player session ID
   * @param direction The shoot direction (backforce will be opposite)
   * @param strength Strength multiplier (1-100) from charge time
   */
  applyPlayerBackforce(
    sessionId: string,
    direction: { x: number; y: number; z: number },
    strength: number
  ): void {
    const playerData = this.playerBodies.get(sessionId);
    if (!playerData) {
      console.warn(`[PHYSICS] Cannot apply backforce to player ${sessionId}: body not found`);
      return;
    }

    // Map strength (1-100) to backforce impulse (9-1800)
    // Backforce scaled by momentum conservation: ratio = m_tile/m_player = 12/20 = 0.6
    // Using quadratic scaling for consistency with tile impulse
    // strength 1 = 9 backforce (slightly higher than 6 for better feel)
    // strength 100 = 1800 backforce (3000 * 0.6 = proper momentum conservation)
    const t = (strength - 1) / 99;
    const quadraticT = PhysicsFormulas.quadraticStrength(t);
    const backforceStrength = PhysicsConstants.BACKFORCE_BASE +
      quadraticT * (PhysicsConstants.BACKFORCE_MAX - PhysicsConstants.BACKFORCE_BASE);

    // Calculate backforce vector (opposite direction * backforceStrength)
    const backforce = new Vector3(
      -direction.x * backforceStrength,
      -direction.y * backforceStrength,
      -direction.z * backforceStrength
    );

    // Apply impulse at player center
    playerData.body.applyImpulse(backforce, playerData.node.position);

    console.log(`[PHYSICS] Applied backforce to player ${sessionId}: strength=${strength}, backforce=${backforceStrength.toFixed(0)}`);
  }

  /**
   * Dispose physics world
   */
  dispose(): void {
    // Clear observable subscriptions to prevent memory leaks
    if (this.havokPlugin) {
      this.havokPlugin.onTriggerCollisionObservable.clear();
      this.havokPlugin.onCollisionObservable.clear();
    }

    this.tileBodies.forEach((entry) => {
      entry.body.dispose();
      entry.shape.dispose();
      entry.node.dispose();
    });
    this.tileBodies.clear();

    // Dispose all player bodies
    this.playerBodies.forEach((_, sessionId) => {
      this.removePlayerBody(sessionId);
    });

    // Dispose ground plane
    if (this.groundBody) {
      this.groundBody.dispose();
      this.groundBody = null;
    }

    // Dispose boundary bodies
    for (const body of this.boundaryBodies) {
      body.dispose();
    }
    this.boundaryBodies = [];

    // Dispose ramp bodies
    for (const body of this.rampBodies) {
      body.dispose();
    }
    this.rampBodies = [];

    // Dispose arch bodies
    for (const body of this.archBodies) {
      body.dispose();
    }
    this.archBodies = [];

    // Dispose goal trigger bodies
    for (const body of this.goalTriggerBodies.values()) {
      body.dispose();
    }
    this.goalTriggerBodies.clear();

    // Dispose scene and engine
    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }

    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }

    this.havokPlugin = null;
    this.initialized = false;

    console.log('[PHYSICS] Physics world disposed');
  }
}
