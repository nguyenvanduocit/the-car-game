import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  AbstractMesh,
  InstancedMesh,
  Quaternion,
  Texture,
  Vector4,
} from '@babylonjs/core';
import { TileMasterMesh } from './TileMasterMesh';
import { TILE_CONFIG } from '@blockgame/shared';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Physics } from './Physics';

/**
 * Tile renderer - handles tile mesh rendering (no client-side physics)
 * All tile physics and positions are managed by the server
 */
export class TileRenderer {
  // Shared base material for all tiles (memory optimization)
  private static SHARED_TILE_MATERIAL: StandardMaterial | null = null;

  private scene: Scene;
  private physics: Physics;
  private mesh: AbstractMesh;
  private material: StandardMaterial;

  // Visual connection line (arm) from player to held tile
  private connectionLine: Mesh | null = null;
  private connectionLineMaterial: StandardMaterial | null = null;

  // Target state from server (for interpolation)
  private targetPosition: Vector3;
  private targetRotation: Quaternion;

  // Tile state
  private tileIndex: number;
  private ownedBy: string | null = null;
  private state: string = 'on_floor';

  // Camera reference for held tiles
  private attachedCamera: any = null;

  // Fly animation state
  private isFlying: boolean = false;
  private flyStartPosition: Vector3 | null = null;
  private flyTargetPosition: Vector3 | null = null;
  private flyStartRotation: Quaternion | null = null;
  private flyTargetRotation: Quaternion | null = null;
  private flyProgress: number = 0;
  private flyDuration: number = 1.5; // seconds
  private flyOnComplete: (() => void) | undefined = undefined;

  // Dirty flag optimization - skip interpolation when tile is static
  private isDirty: boolean = true; // True when target has changed
  private readonly POSITION_THRESHOLD_SQ: number = 0.0001; // Squared distance threshold (0.01 units)
  private readonly ROTATION_THRESHOLD: number = 0.9999; // Quaternion dot product threshold (very close)

  // Arm update throttling - reduce update frequency for held tiles
  private lastArmUpdateFrame: number = 0;
  private readonly ARM_UPDATE_INTERVAL: number = 2; // Update every 2 frames (30Hz instead of 60Hz)

  // Frame-rate independent smoothing constant (per second)
  private static readonly TILE_SMOOTHING_SPEED = 15; // Tiles: medium smoothness

  /**
   * Initialize shared base material for all tiles (lazy initialization)
   */
  private static initSharedMaterial(scene: Scene): StandardMaterial {
    if (!TileRenderer.SHARED_TILE_MATERIAL) {
      const material = new StandardMaterial('shared_tile_mat', scene);
      // Bright white diffuse to maximize light reflection
      material.diffuseColor = new Color3(1.5, 1.5, 1.5);
      // Strong ambient response to ensure visibility
      material.ambientColor = new Color3(0.8, 0.8, 0.8);
      // Moderate specular for shine without washout
      material.specularColor = new Color3(0.6, 0.6, 0.6);
      material.specularPower = 32;
      // Disable emissive initially (will be set by state)
      material.emissiveColor = new Color3(0, 0, 0);
      // Ensure material is affected by lighting
      material.disableLighting = false;
      // Use Fresnel for better light interaction
      material.useSpecularOverAlpha = true;
      TileRenderer.SHARED_TILE_MATERIAL = material;
    }
    return TileRenderer.SHARED_TILE_MATERIAL;
  }

  /**
   * Get or load texture from cache - DEPRECATED (Using Atlas)
   */
  private static getTexture(frameSlotIndex: number, scene: Scene): Texture | null {
    return null;
  }

  constructor(
    scene: Scene,
    physics: Physics,
    tileIndex: number,
    initialPosition: Vector3,
    initialRotation?: { x: number; y: number; z: number; w: number },
    textureUrl: string = '/tiles/tile-0.webp'
  ) {
    this.scene = scene;
    this.physics = physics;
    this.tileIndex = tileIndex;
    this.targetPosition = initialPosition.clone();
    this.targetRotation = initialRotation
      ? new Quaternion(initialRotation.x, initialRotation.y, initialRotation.z, initialRotation.w)
      : Quaternion.Identity();

    // Create tile mesh (floor tile: 1.2 wide x 0.4 thick x 1.2 deep)
    // Create tile instance from master mesh
    // Create tile instance from master mesh
    const masterMesh = TileMasterMesh.getInstance(scene);
    this.mesh = masterMesh.createInstance(textureUrl);

    // Ensure instance is visible (master is hidden)
    this.mesh.isVisible = true;

    this.mesh.position = initialPosition.clone();

    // Initialize rotation quaternion with initial value from server
    this.mesh.rotationQuaternion = this.targetRotation.clone();

    // Clone shared material (cheaper than creating new material)
    // For instances, we initially share the master material
    // But if we need unique textures (before Atlas implementation), we might need to clone
    // For now, we'll clone to maintain current behavior until Texture Atlas (Task 2.3)
    // Update: Task 2.3 implemented. We use master material and instanced buffers.
    // However, we keep the material property for compatibility with existing code that might access it
    // But we don't clone it anymore, we use the master mesh material
    this.material = this.mesh.material as StandardMaterial;

    // Set initial UV offset - DEPRECATED with Multi-Material Instancing
    // Texture is set via createInstance above
    // this.swapTexture(frameSlotIndex);

    // Enable shadow casting and receiving
    // Note: receiveShadows is set on master mesh, not instances
    // this.mesh.receiveShadows = true; // Has no effect on instances

    // No physics body for tiles - server manages all physics
    // Tiles are rendered at exact server positions (no client-side physics)

  }

  /**
   * Enable shadow casting (should be called after scene setup)
   */
  enableShadowCasting(shadowGenerator: ShadowGenerator): void {
    shadowGenerator.addShadowCaster(this.mesh);
  }

  /**
   * Update position from server state (direct update - no interpolation for static tiles)
   * Accepts x,y,z directly to avoid GC pressure from Vector3 allocations
   */
  updateTargetPosition(position: Vector3 | { x: number; y: number; z: number }): void {
    // Skip server position updates while flying (client controls animation)
    if (this.isFlying) {
      return;
    }

    // Calculate distance squared to check if position actually changed
    const dx = this.targetPosition.x - position.x;
    const dy = this.targetPosition.y - position.y;
    const dz = this.targetPosition.z - position.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;

    // Only mark dirty if position changed significantly
    if (distanceSq > this.POSITION_THRESHOLD_SQ) {
      this.isDirty = true;
    }

    this.targetPosition.set(position.x, position.y, position.z);

    // For static tiles on_floor, update immediately without interpolation
    if (this.state === 'on_floor') {
      this.mesh.position.set(position.x, position.y, position.z);
    }
  }

  /**
   * Update rotation from server state (direct update for static tiles)
   * Avoids creating new Quaternion to reduce GC pressure
   */
  updateTargetRotation(rotation: { x: number; y: number; z: number; w: number }): void {
    // Skip server rotation updates while flying (client controls animation)
    if (this.isFlying) {
      return;
    }

    // Calculate quaternion dot product inline to avoid creating new Quaternion
    // Dot product: q1.x*q2.x + q1.y*q2.y + q1.z*q2.z + q1.w*q2.w
    const dotProduct =
      this.targetRotation.x * rotation.x +
      this.targetRotation.y * rotation.y +
      this.targetRotation.z * rotation.z +
      this.targetRotation.w * rotation.w;

    // Dot product close to 1.0 means very similar rotations
    // Mark dirty if rotation changed significantly
    if (Math.abs(dotProduct) < this.ROTATION_THRESHOLD) {
      this.isDirty = true;
    }

    this.targetRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);

    // Always ensure rotationQuaternion exists (required for interpolation)
    if (!this.mesh.rotationQuaternion) {
      this.mesh.rotationQuaternion = new Quaternion();
    }

    // For static tiles on_floor, update immediately without interpolation
    if (this.state === 'on_floor') {
      this.mesh.rotationQuaternion.copyFrom(this.targetRotation);
    }
    // For all other states (placed, locked, charging), interpolation will apply the rotation
  }

  /**
   * Update tile state
   * @param fillCount - 1 for half-filled, 2 for complete
   */
  updateState(state: string, ownedBy: string | null, fillCount: number = 0): void {
    this.state = state;
    this.ownedBy = ownedBy;

    // Scale based on fill count when placed
    if (state === 'placed') {
      this.mesh.scaling.setAll(fillCount === 1 ? 0.5 : 1.0);
    } else {
      this.mesh.scaling.setAll(1.0);
    }
  }

  /**
   * Set tile scale (for placed tiles)
   */
  setScale(scale: number): void {
    this.mesh.scaling.setAll(scale);
  }

  /**
   * Interpolate position and rotation toward server state
   * Called every frame for smooth rendering
   * Uses frame-rate independent exponential smoothing for consistent feel
   * Note: Tiles on_floor are static and don't need interpolation (updated directly)
   * Note: LOCKED and CHARGING tiles interpolate to server position (server controls attachment)
   */
  interpolate(_lerpFactor: number): void {
    // Handle fly animation first (client-side animation, ignores server state)
    if (this.isFlying) {
      this.updateFlyAnimation();
      return;
    }

    // Skip interpolation for static tiles on floor (already updated directly)
    if (this.state === 'on_floor') {
      return;
    }

    // Skip interpolation for placed tiles that are not moving (static in frame)
    if (this.state === 'placed' && !this.isDirty) {
      return;
    }

    // Early exit if tile is static (optimization)
    if (!this.isDirty) {
      // Check if we're already close enough to target
      const distanceSq = Vector3.DistanceSquared(this.mesh.position, this.targetPosition);
      const rotDot = this.mesh.rotationQuaternion
        ? Quaternion.Dot(this.mesh.rotationQuaternion, this.targetRotation)
        : 1.0;

      // If we're very close to target and not dirty, skip interpolation
      if (distanceSq < this.POSITION_THRESHOLD_SQ && Math.abs(rotDot) > this.ROTATION_THRESHOLD) {
        return;
      }
    }

    // Frame-rate independent smoothing factor
    const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;
    const smoothFactor = 1 - Math.exp(-TileRenderer.TILE_SMOOTHING_SPEED * deltaTime);

    // Only interpolate for tiles in transition states (if any)
    // Lerp position (in-place to avoid GC pressure)
    Vector3.LerpToRef(
      this.mesh.position,
      this.targetPosition,
      smoothFactor,
      this.mesh.position
    );

    // Slerp rotation
    if (this.mesh.rotationQuaternion) {
      Quaternion.SlerpToRef(
        this.mesh.rotationQuaternion,
        this.targetRotation,
        smoothFactor,
        this.mesh.rotationQuaternion
      );
    }

    // Clear dirty flag after interpolation
    this.isDirty = false;
  }

  /**
   * Start fly animation to target position
   * @param targetPosition Target position to fly to
   * @param targetRotation Optional target rotation quaternion (defaults to 90 degrees around X)
   * @param onComplete Optional callback when animation completes
   */
  startFlyAnimation(targetPosition: Vector3, targetRotation?: Quaternion, onComplete?: () => void): void {
    this.isFlying = true;
    this.flyStartPosition = this.mesh.position.clone();
    this.flyTargetPosition = targetPosition.clone();
    this.flyOnComplete = onComplete;

    // Store current rotation
    if (!this.mesh.rotationQuaternion) {
      this.mesh.rotationQuaternion = Quaternion.Identity();
    }
    this.flyStartRotation = this.mesh.rotationQuaternion.clone();

    // Use provided target rotation or default to 90 degrees around X axis
    if (targetRotation) {
      this.flyTargetRotation = targetRotation.clone();
    } else {
      // Default: 90 degrees around X axis to face forward
      const angle = Math.PI / 2;
      this.flyTargetRotation = new Quaternion(
        Math.sin(angle / 2), // x
        0,                    // y
        0,                    // z
        Math.cos(angle / 2)   // w
      );
    }

    this.flyProgress = 0;

    // Hide connection line if visible
    if (this.connectionLine) {
      this.connectionLine.isVisible = false;
    }
  }

  /**
   * Update fly animation (called every frame)
   * Uses smooth easing for natural motion
   */
  private updateFlyAnimation(): void {
    if (!this.isFlying || !this.flyStartPosition || !this.flyTargetPosition) return;

    // Get delta time from scene (in seconds)
    const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;

    // Update progress
    this.flyProgress += deltaTime / this.flyDuration;

    if (this.flyProgress >= 1.0) {
      // Animation complete
      this.mesh.position = this.flyTargetPosition.clone();
      if (this.flyTargetRotation && this.mesh.rotationQuaternion) {
        this.mesh.rotationQuaternion.copyFrom(this.flyTargetRotation);
      }
      this.isFlying = false;
      this.flyStartPosition = null;
      this.flyTargetPosition = null;
      this.flyStartRotation = null;
      this.flyTargetRotation = null;
      this.flyProgress = 0;

      // Call completion callback if provided
      if (this.flyOnComplete) {
        this.flyOnComplete();
        this.flyOnComplete = undefined;
      }

      return;
    }

    // Ease-out cubic for smooth deceleration
    const easeProgress = 1 - Math.pow(1 - this.flyProgress, 3);

    // Interpolate position (in-place to avoid GC pressure)
    Vector3.LerpToRef(
      this.flyStartPosition!,
      this.flyTargetPosition!,
      easeProgress,
      this.mesh.position
    );

    // Interpolate rotation (slerp for smooth rotation)
    if (this.flyStartRotation && this.flyTargetRotation && this.mesh.rotationQuaternion) {
      Quaternion.SlerpToRef(
        this.flyStartRotation,
        this.flyTargetRotation,
        easeProgress,
        this.mesh.rotationQuaternion
      );
    }
  }

  /**
   * Create visual arm (connection line) from player to tile
   */
  private createConnectionLine(): void {
    if (this.connectionLine) return; // Already created

    // Create material for the arm
    this.connectionLineMaterial = new StandardMaterial(`arm-mat-${this.tileIndex}`, this.scene);
    this.connectionLineMaterial.diffuseColor = new Color3(0.6, 0.6, 0.6); // Gray
    this.connectionLineMaterial.emissiveColor = new Color3(0.1, 0.1, 0.1); // Slight glow
    this.connectionLineMaterial.alpha = 0.8; // Semi-transparent

    // Create a thin cylinder as the arm
    this.connectionLine = MeshBuilder.CreateCylinder(
      `arm-${this.tileIndex}`,
      {
        height: 1, // Will be updated based on arm length
        diameter: 0.15, // Visible arm thickness
        tessellation: 12,
      },
      this.scene
    );

    this.connectionLine.material = this.connectionLineMaterial;
    this.connectionLine.isVisible = false; // Hidden by default
  }

  /**
   * Get arm endpoint position (where tile should be grabbed)
   */
  private getArmEndpoint(): Vector3 {
    if (!this.attachedCamera) return Vector3.Zero();

    // Arm extends from camera/player position
    const armStart = this.attachedCamera.position.clone();

    // Calculate arm endpoint (in front and to the right of camera)
    const endpoint = armStart.clone();
    endpoint.addInPlace(this.attachedCamera.getDirection(Vector3.Forward()).scale(3));
    endpoint.addInPlace(this.attachedCamera.getDirection(Vector3.Right()).scale(2));
    endpoint.addInPlace(this.attachedCamera.getDirection(Vector3.Down()).scale(1));

    return endpoint;
  }

  /**
   * Update arm position and rotation, and position tile at arm endpoint
   * Throttled to 30Hz (every 2 frames) for performance
   */
  private updateArmAndTile(): void {
    if (!this.connectionLine || !this.attachedCamera) return;

    // Throttle arm updates to reduce per-frame calculations
    const currentFrame = this.scene.getFrameId();
    if (currentFrame - this.lastArmUpdateFrame < this.ARM_UPDATE_INTERVAL) {
      return; // Skip this frame
    }
    this.lastArmUpdateFrame = currentFrame;

    const armStart = this.attachedCamera.position.clone();
    const armEnd = this.getArmEndpoint();

    // Position tile at arm endpoint (tile is grabbed by the arm)
    this.mesh.position = armEnd.clone();

    // Calculate arm midpoint and length
    const midpoint = Vector3.Center(armStart, armEnd);
    const armLength = Vector3.Distance(armStart, armEnd);

    // Position arm at midpoint
    this.connectionLine.position = midpoint;

    // Scale arm to match length
    this.connectionLine.scaling.y = armLength;

    // Rotate arm to point from start to end
    const direction = armEnd.subtract(armStart);
    if (direction.length() > 0) {
      this.connectionLine.lookAt(armEnd);
      this.connectionLine.rotate(Vector3.Right(), Math.PI / 2);
    }
  }

  /**
   * Attach tile to arm (when held by local player)
   */
  attachToCamera(camera: any): void {
    if (!camera) return;

    this.attachedCamera = camera;

    // DO NOT parent tile to camera - tile follows arm endpoint
    this.mesh.parent = null;

    // Create and show arm
    this.createConnectionLine();
    if (this.connectionLine) {
      this.connectionLine.isVisible = true;
      this.updateArmAndTile();
    }
  }

  /**
   * Detach tile from camera (when placed or dropped)
   */
  detachFromCamera(): void {
    this.mesh.parent = null;
    this.attachedCamera = null;

    // Hide connection line
    if (this.connectionLine) {
      this.connectionLine.isVisible = false;
    }
  }

  /**
   * Get mesh for raycast detection
   */
  getMesh(): AbstractMesh {
    return this.mesh;
  }

  /**
   * Get tile index
   */
  getIndex(): number {
    return this.tileIndex;
  }

  /**
   * Reset tile for reuse (Object Pooling)
   */
  reset(
    tileIndex: number,
    position: Vector3,
    rotation?: { x: number; y: number; z: number; w: number },
    textureUrl: string = '/tiles/tile-0.webp'
  ): void {
    this.tileIndex = tileIndex;
    this.targetPosition.copyFrom(position);

    if (rotation) {
      this.targetRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
    } else {
      this.targetRotation.copyFrom(Quaternion.Identity());
    }

    // Create instance from the appropriate master mesh based on texture
    // If this.mesh already exists, dispose it before creating a new one
    if (this.mesh) {
      this.mesh.dispose();
    }
    this.mesh = TileMasterMesh.getInstance(this.scene).createInstance(textureUrl);

    // Set initial transform
    this.mesh.position.copyFrom(this.targetPosition); // Use targetPosition for initial placement
    this.mesh.rotationQuaternion = this.targetRotation.clone(); // Use targetRotation for initial placement

    // Store metadata
    this.mesh.metadata = {
      type: 'tile',
      index: this.tileIndex // Use tileIndex for metadata
    };

    // Reset state
    this.state = 'on_floor';
    this.ownedBy = null;
    this.isDirty = true;
    this.isFlying = false;
    this.flyOnComplete = undefined;

    // Reset visual state
    this.setVisible(true);
    this.detachFromCamera();

    // Update texture (this method is now deprecated/changed for Multi-Material Instancing)
    // this.swapTexture(frameSlotIndex); // Old atlas UV method

    // Reset material properties (emissive color is now handled by the master mesh material)
    // this.material.emissiveColor = new Color3(0, 0, 0);

  }

  /**
   * Set tile visibility (for pooling)
   */
  setVisible(visible: boolean): void {
    this.mesh.isVisible = visible;
    this.mesh.setEnabled(visible);

    // Also hide connection line if it exists
    if (this.connectionLine) {
      this.connectionLine.isVisible = false; // Connection line deprecated (server handles attachment)
    }
  }

  /**
   * Swap texture for reused tile (using Atlas UVs)
   */
  public swapTexture(textureUrl: string) {
    if (!this.mesh) return;

    // With Multi-Material Instancing, we cannot just change the texture of an instance
    // We must switch to an instance of a different master mesh

    // 1. Save current transform
    const position = this.mesh.position.clone();
    const rotation = this.mesh.rotationQuaternion ? this.mesh.rotationQuaternion.clone() : Quaternion.Identity();
    const scaling = this.mesh.scaling.clone();
    const isVisible = this.mesh.isVisible;

    // 2. Dispose current instance (return to pool logic is handled by TilePool,
    // but here we are just swapping the underlying mesh for this renderer)
    // Actually, since TilePool manages TileRenderer, and TileRenderer manages the mesh...
    // We can just dispose the BabylonJS mesh.
    this.mesh.dispose();

    // 3. Create new instance
    this.mesh = TileMasterMesh.getInstance(this.scene).createInstance(textureUrl);

    // 4. Restore transform
    this.mesh.position = position;
    this.mesh.rotationQuaternion = rotation;
    this.mesh.scaling = scaling;
    this.mesh.isVisible = isVisible;

    // Restore metadata
    this.mesh.metadata = {
      type: 'tile',
      index: this.tileIndex // Use this.tileIndex as it's the current index for this renderer
    };
  }

  /**
   * Dispose tile renderer
   */
  dispose(): void {
    // Dispose connection line
    if (this.connectionLine) {
      this.connectionLine.dispose();
      this.connectionLine = null;
    }

    if (this.connectionLineMaterial) {
      this.connectionLineMaterial.dispose();
      this.connectionLineMaterial = null;
    }

    // Dispose tile mesh and material
    // Material is shared (master material), so DO NOT dispose it
    // this.material.dispose();
    this.mesh.dispose();
  }
}
