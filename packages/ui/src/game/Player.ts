import { Scene, MeshBuilder, StandardMaterial, Color3, Mesh, Vector3, Quaternion, TransformNode, GlowLayer } from '@babylonjs/core';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import {
  PLAYER_CONFIG,
  BODY_METRICS,
  HEAD_METRICS,
  LEG_METRICS,
  ARM_METRICS,
  PLAYER_LAYOUT,
} from '@blockgame/shared';

/**
 * Player rendering - represents players in the scene (SERVER-AUTHORITATIVE)
 * Renders players as colored spheres with name tags
 * All players render server state with interpolation for smoothness
 */
export class PlayerRenderer {
  // Shared base material for all players (memory optimization)
  private static SHARED_PLAYER_MATERIAL: StandardMaterial | null = null;

  private scene: Scene;
  private sessionId: string;
  private mesh: Mesh;
  private wireframeMesh: Mesh | null = null; // Wireframe overlay for debugging
  private leftArm: { parent: TransformNode; upper: Mesh; lower: Mesh } | null = null; // Left arm with parent
  private rightArm: { parent: TransformNode; upper: Mesh; lower: Mesh } | null = null; // Right arm with parent
  private armConnector: Mesh | null = null; // Electric line connecting the arms
  private armConfig: { lowerLength: number } | null = null; // Arm configuration for tip calculation
  private head: Mesh | null = null; // Head box on top of body
  private leftLeg: Mesh | null = null; // Left leg
  private rightLeg: Mesh | null = null; // Right leg

  private targetPosition: Vector3; // Server position target
  private currentPosition: Vector3; // Interpolated position
  private targetRotation: Quaternion; // Server rotation target (now includes Y-rotation from camera)
  private currentRotation: Quaternion; // Interpolated rotation (body and arms follow this)

  // Dirty flag optimization - skip interpolation when player is static
  private isDirty: boolean = true; // True when target has changed
  private readonly POSITION_THRESHOLD_SQ: number = 0.0001; // Squared distance threshold (0.01 units)
  private readonly ROTATION_THRESHOLD: number = 0.9999; // Quaternion dot product threshold (very close)
  private readonly isLocal: boolean; // True if this is the local player

  private displayName: string;

  constructor(scene: Scene, sessionId: string, displayName: string, position: Vector3, isLocal: boolean = false) {
    this.scene = scene;
    this.sessionId = sessionId;
    this.displayName = displayName;
    this.isLocal = isLocal;
    this.targetPosition = position.clone();
    this.currentPosition = position.clone();
    this.targetRotation = Quaternion.Identity();
    this.currentRotation = Quaternion.Identity();

    // Create sphere mesh for player
    this.mesh = this.createPlayerSphere();
    this.mesh.position = position;
    this.mesh.rotationQuaternion = this.currentRotation.clone();

    // Create arms
    this.createArms();

    // Create head
    this.createHead();

    // Create legs
    this.createLegs();
  }

  /**
   * Initialize shared base material for all players (lazy initialization)
   * This material is cloned for each player, saving memory and improving performance
   */
  private static initSharedMaterial(scene: Scene): StandardMaterial {
    if (!PlayerRenderer.SHARED_PLAYER_MATERIAL) {
      const material = new StandardMaterial('shared_player_mat', scene);
      material.specularColor = new Color3(0.2, 0.2, 0.2);
      // diffuseColor will be set per-player clone
      PlayerRenderer.SHARED_PLAYER_MATERIAL = material;
    }
    return PlayerRenderer.SHARED_PLAYER_MATERIAL;
  }

  /**
   * Create box mesh representing player body (torso)
   * Positioned using PLAYER_LAYOUT - NO offset needed!
   */
  private createPlayerSphere(): Mesh {
    // Create body box using metrics
    const box = MeshBuilder.CreateBox(
      `player_${this.sessionId}`,
      {
        width: BODY_METRICS.width,
        height: BODY_METRICS.height,
        depth: BODY_METRICS.depth,
      },
      this.scene
    );

    // Position at body center (relative to physics center)
    // Body is centered at physics center, so position = 0
    box.position.y = PLAYER_LAYOUT.body.centerY;  // 0

    // Clone shared material (cheaper than creating new material)
    const sharedMaterial = PlayerRenderer.initSharedMaterial(this.scene);
    const material = sharedMaterial.clone(`player_mat_${this.sessionId}`);
    material.diffuseColor = this.generatePlayerColor(); // Override color per player
    box.material = material;

    // Enable shadow casting and receiving
    box.receiveShadows = true;

    return box;
  }

  /**
   * Generate player color from display name
   * Same name = same color (deterministic)
   */
  private generatePlayerColor(): Color3 {
    const hash = this.hashCode(this.displayName);
    const hue = (hash % 360) / 360;
    return Color3.FromHSV(hue * 360, 0.7, 0.8);
  }

  /**
   * Simple hash function for consistent colors per name
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  }

  /**
   * Create wireframe overlay for debugging
   * Makes it easier to see player box orientation and rotation
   */
  private createWireframeOverlay(): void {
    // Clone the body box mesh (slightly larger to avoid z-fighting)
    this.wireframeMesh = MeshBuilder.CreateBox(
      `player_wireframe_${this.sessionId}`,
      {
        width: BODY_METRICS.width + 0.02,
        height: BODY_METRICS.height + 0.02,
        depth: BODY_METRICS.depth + 0.02,
      },
      this.scene
    );

    // Get the player's box color and make wireframe glow the same color
    const boxMaterial = this.mesh.material as StandardMaterial;
    const playerColor = boxMaterial.diffuseColor.clone();

    // Create wireframe material with matching color glow
    const wireframeMaterial = new StandardMaterial(`player_wireframe_mat_${this.sessionId}`, this.scene);
    wireframeMaterial.wireframe = true;
    wireframeMaterial.emissiveColor = playerColor.scale(1.5); // Brighter version of player color
    wireframeMaterial.alpha = 0.7; // More visible
    this.wireframeMesh.material = wireframeMaterial;

    // Parent to main mesh so it follows position/rotation
    this.wireframeMesh.parent = this.mesh;
    this.wireframeMesh.isPickable = false;

    console.log(`[PLAYER] Wireframe overlay created for player ${this.sessionId} with matching color`);
  }

  /**
   * Create arms for the player
   * Each arm has upper and lower segments (box shapes)
   * Uses parent transform nodes to rotate arms around body
   *
   * Arm structure (local space):
   * - Parent node: rotates around body with look direction
   * - Upper arm: offset X = ±shoulderOffset, rotates down
   * - Lower arm: child of upper arm, extends forward when upper is rotated
   * - Connector: links the two lower arm tips
   */
  private createArms(): void {
    // Use metrics from playerMetrics.ts
    const {
      thickness: armThickness,
      upperLength: upperArmLength,
      lowerLength: lowerArmLength,
      shoulderOffset: armOffsetX,
      upperRotation,
    } = ARM_METRICS;

    // Create parent transform nodes for rotation around body
    // These nodes represent the shoulder pivot points
    const leftArmParent = new TransformNode(`leftArmParent_${this.sessionId}`, this.scene);
    const rightArmParent = new TransformNode(`rightArmParent_${this.sessionId}`, this.scene);

    // Position parents at shoulder position (player position, will be updated in interpolation)
    leftArmParent.position = this.mesh.position.clone();
    rightArmParent.position = this.mesh.position.clone();

    // Left arm
    const leftUpperArm = MeshBuilder.CreateBox(
      `leftUpperArm_${this.sessionId}`,
      { width: armThickness, height: upperArmLength, depth: armThickness },
      this.scene
    );
    const leftLowerArm = MeshBuilder.CreateBox(
      `leftLowerArm_${this.sessionId}`,
      { width: armThickness, height: lowerArmLength, depth: armThickness },
      this.scene
    );

    // Right arm
    const rightUpperArm = MeshBuilder.CreateBox(
      `rightUpperArm_${this.sessionId}`,
      { width: armThickness, height: upperArmLength, depth: armThickness },
      this.scene
    );
    const rightLowerArm = MeshBuilder.CreateBox(
      `rightLowerArm_${this.sessionId}`,
      { width: armThickness, height: lowerArmLength, depth: armThickness },
      this.scene
    );

    // Create arm material (same color as body, shared across all arm segments)
    const armMaterial = new StandardMaterial(`arm_mat_${this.sessionId}`, this.scene);
    armMaterial.diffuseColor = (this.mesh.material as StandardMaterial).diffuseColor;
    armMaterial.specularColor = new Color3(0.2, 0.2, 0.2);

    // Share same material instance across all arm segments for this player
    leftUpperArm.material = armMaterial;
    leftLowerArm.material = armMaterial;
    rightUpperArm.material = armMaterial;
    rightLowerArm.material = armMaterial;

    // Parent upper arms to their respective parent nodes
    leftUpperArm.parent = leftArmParent;
    rightUpperArm.parent = rightArmParent;

    // Position upper arms to the side in local space
    // Attach at shoulder position defined in metrics
    leftUpperArm.position.x = -armOffsetX;
    leftUpperArm.position.y = ARM_METRICS.shoulderY;
    leftUpperArm.position.z = ARM_METRICS.shoulderZ;

    rightUpperArm.position.x = armOffsetX;
    rightUpperArm.position.y = ARM_METRICS.shoulderY;
    rightUpperArm.position.z = ARM_METRICS.shoulderZ;

    // Point arms down (will rotate forward when parent rotates)
    leftUpperArm.rotation.x = upperRotation;
    rightUpperArm.rotation.x = upperRotation;

    // Parent lower arms to upper arms
    leftLowerArm.parent = leftUpperArm;
    rightLowerArm.parent = rightUpperArm;

    // Lower arms rotate to extend forward from elbow
    // We want lower arm to be more horizontal, extending forward from where upper arm ends
    const lowerArmRotation = Math.PI / 2 - upperRotation;
    leftLowerArm.rotation.x = lowerArmRotation;
    rightLowerArm.rotation.x = lowerArmRotation;

    // Position lower arms at the elbow (bottom of upper arm)
    // Upper arm with pivot at shoulder extends from Y=0 to Y=-upperArmLength (elbow)
    // Lower arm pivot is at top (elbow), offset by -lowerArmLength/2 so pivot is at elbow
    leftLowerArm.position.x = 0;
    leftLowerArm.position.y = -upperArmLength - lowerArmLength/2 + 1; // At elbow, with pivot at top
    leftLowerArm.position.z = -0.3;

    rightLowerArm.position.x = 0;
    rightLowerArm.position.y = -upperArmLength - lowerArmLength / 2 + 1; // At elbow, with pivot at top
    rightLowerArm.position.z = -0.3;

    // Enable shadows
    leftUpperArm.receiveShadows = true;
    leftLowerArm.receiveShadows = true;
    rightUpperArm.receiveShadows = true;
    rightLowerArm.receiveShadows = true;

    // Make arms non-pickable (don't interfere with raycasting)
    leftUpperArm.isPickable = false;
    leftLowerArm.isPickable = false;
    rightUpperArm.isPickable = false;
    rightLowerArm.isPickable = false;

    // Store references
    this.leftArm = { parent: leftArmParent, upper: leftUpperArm, lower: leftLowerArm };
    this.rightArm = { parent: rightArmParent, upper: rightUpperArm, lower: rightLowerArm };

    // Store config for tip calculation
    this.armConfig = { lowerLength: lowerArmLength };

    // Create connector bar between arms (electric line)
    this.createArmConnector(ARM_METRICS);

    console.log(`[PLAYER] Arms created for player ${this.sessionId}`);
  }

  /**
   * Create electric connector bar between the two lower arm tips
   *
   * Strategy: Parent connector to left lower arm, position at arm tip
   */
  private createArmConnector(config: {
    thickness: number;
    upperLength: number;
    lowerLength: number;
    shoulderOffset: number;
    upperRotation: number;
  }): void {
    if (!this.leftArm || !this.rightArm) return;

    const connectorLength = config.shoulderOffset * 2;

    // Create cylinder connecting the arm tips
    const connector = MeshBuilder.CreateCylinder(
      `armConnector_${this.sessionId}`,
      { height: connectorLength, diameter: 0.08 },
      this.scene
    );

    // Create glowing green material (brighter for more visibility)
    const material = new StandardMaterial(`armConnectorMat_${this.sessionId}`, this.scene);
    material.diffuseColor = new Color3(0, 1, 0.2); // Green
    material.emissiveColor = new Color3(0, 2.5, 1.0); // Very bright green glow
    material.alpha = 0.95;
    connector.material = material;

    // Parent to left lower arm
    connector.parent = this.leftArm.lower;

    // Position at the tip of the lower arm (far end from elbow)
    // Lower arm box extends ±lowerLength/2 from its center
    // Tip is at -lowerLength/2 in lower arm's local Y (bottom of box)
    connector.position.x = config.shoulderOffset; // Offset to center between arms
    connector.position.y = -config.lowerLength / 2; // At the tip (bottom) of lower arm
    connector.position.z = 0;

    // Rotate to horizontal (cylinder is vertical by default, rotate around Z to make it horizontal X)
    connector.rotation.z = Math.PI / 2;

    connector.isPickable = false;
    connector.receiveShadows = true;

    this.armConnector = connector;
  }


  /**
   * Create head box on top of body
   * Positioned using PLAYER_LAYOUT - directly on top of body
   */
  private createHead(): void {
    this.head = MeshBuilder.CreateBox(
      `head_${this.sessionId}`,
      {
        width: HEAD_METRICS.size,
        height: HEAD_METRICS.size,
        depth: HEAD_METRICS.size,
      },
      this.scene
    );

    // Position at head center (relative to physics center)
    this.head.position.x = 0;
    this.head.position.y = PLAYER_LAYOUT.head.centerY;  // 1.4
    this.head.position.z = 0;

    // Parent to body mesh to follow rotation
    this.head.parent = this.mesh;

    // Same material as body
    const bodyMaterial = this.mesh.material as StandardMaterial;
    this.head.material = bodyMaterial;

    // Enable shadows
    this.head.receiveShadows = true;
    this.head.isPickable = false;

    console.log(`[PLAYER] Head created for player ${this.sessionId} using HEAD_METRICS`);
  }

  /**
   * Create legs under body
   * Positioned using PLAYER_LAYOUT - directly under body, touching it
   */
  private createLegs(): void {
    // Left leg
    this.leftLeg = MeshBuilder.CreateBox(
      `leftLeg_${this.sessionId}`,
      {
        width: LEG_METRICS.width,
        height: LEG_METRICS.height,
        depth: LEG_METRICS.depth,
      },
      this.scene
    );

    // Position at leg center (relative to physics center)
    this.leftLeg.position.x = -LEG_METRICS.spacing;  // Left side
    this.leftLeg.position.y = PLAYER_LAYOUT.leg.centerY;  // -1.8
    this.leftLeg.position.z = 0;

    // Parent to body mesh to follow rotation
    this.leftLeg.parent = this.mesh;

    // Right leg
    this.rightLeg = MeshBuilder.CreateBox(
      `rightLeg_${this.sessionId}`,
      {
        width: LEG_METRICS.width,
        height: LEG_METRICS.height,
        depth: LEG_METRICS.depth,
      },
      this.scene
    );

    this.rightLeg.position.x = LEG_METRICS.spacing;  // Right side
    this.rightLeg.position.y = PLAYER_LAYOUT.leg.centerY;  // -1.8
    this.rightLeg.position.z = 0;

    // Parent to body mesh to follow rotation
    this.rightLeg.parent = this.mesh;

    // Same material as body
    const bodyMaterial = this.mesh.material as StandardMaterial;
    this.leftLeg.material = bodyMaterial;
    this.rightLeg.material = bodyMaterial;

    // Enable shadows
    this.leftLeg.receiveShadows = true;
    this.rightLeg.receiveShadows = true;
    this.leftLeg.isPickable = false;
    this.rightLeg.isPickable = false;

    console.log(`[PLAYER] Legs created for player ${this.sessionId} using LEG_METRICS`);
  }

  /**
   * Enable shadow casting (should be called after scene setup)
   */
  enableShadowCasting(shadowGenerator: ShadowGenerator): void {
    shadowGenerator.addShadowCaster(this.mesh);

    // Add arms to shadow casters
    if (this.leftArm) {
      shadowGenerator.addShadowCaster(this.leftArm.upper);
      shadowGenerator.addShadowCaster(this.leftArm.lower);
    }
    if (this.rightArm) {
      shadowGenerator.addShadowCaster(this.rightArm.upper);
      shadowGenerator.addShadowCaster(this.rightArm.lower);
    }

    // Add arm connector to shadow casters
    if (this.armConnector) {
      shadowGenerator.addShadowCaster(this.armConnector);
    }

    // Add head and legs to shadow casters
    if (this.head) {
      shadowGenerator.addShadowCaster(this.head);
    }
    if (this.leftLeg) {
      shadowGenerator.addShadowCaster(this.leftLeg);
    }
    if (this.rightLeg) {
      shadowGenerator.addShadowCaster(this.rightLeg);
    }
  }

  /**
   * Enable glow effect on arm connector
   * @param glowLayer The scene's glow layer
   */
  enableGlow(glowLayer: GlowLayer | null): void {
    if (!glowLayer) return;

    // Add arm connector to glow layer (green glow)
    if (this.armConnector) {
      glowLayer.addIncludedOnlyMesh(this.armConnector);
    }

    console.log(`[PLAYER] Glow effect enabled for player ${this.sessionId} (arm connector)`);
  }

  /**
   * Update target position from server state
   * Called when server sends position update
   */
  updateTargetPosition(position: Vector3): void {
    // Calculate distance squared to check if position actually changed
    const distanceSq = Vector3.DistanceSquared(this.targetPosition, position);

    // Only mark dirty if position changed significantly
    if (distanceSq > this.POSITION_THRESHOLD_SQ) {
      this.isDirty = true;
    }

    this.targetPosition.copyFrom(position);
  }

  /**
   * Update target rotation from server state
   * Called when server sends rotation update
   */
  updateTargetRotation(rotation: { x: number; y: number; z: number; w: number }): void {
    // Calculate quaternion dot product to check if rotation changed
    const newRotation = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const dotProduct = Quaternion.Dot(this.targetRotation, newRotation);

    // Dot product close to 1.0 means very similar rotations
    // Mark dirty if rotation changed significantly
    if (Math.abs(dotProduct) < this.ROTATION_THRESHOLD) {
      this.isDirty = true;
    }

    this.targetRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
  }


  /**
   * Interpolate to target position and rotation (smooth movement) (SERVER-AUTHORITATIVE)
   * Called every frame from StateSync
   * Interpolates toward server position for all players (including local)
   * @param lerpFactor - Interpolation factor (0.2 = 20% per frame)
   */
  interpolate(lerpFactor: number = 0.2): void {
    // Early exit if player is static (optimization)
    if (!this.isDirty) {
      // Check if we're already close enough to target
      const distanceSq = Vector3.DistanceSquared(this.currentPosition, this.targetPosition);
      const rotDot = Quaternion.Dot(this.currentRotation, this.targetRotation);

      // If we're very close to target and not dirty, skip interpolation
      if (distanceSq < this.POSITION_THRESHOLD_SQ && Math.abs(rotDot) > this.ROTATION_THRESHOLD) {
        return;
      }
    }

    // Interpolate current position toward server target position
    this.currentPosition.x += (this.targetPosition.x - this.currentPosition.x) * lerpFactor;
    this.currentPosition.y += (this.targetPosition.y - this.currentPosition.y) * lerpFactor;
    this.currentPosition.z += (this.targetPosition.z - this.currentPosition.z) * lerpFactor;

    // Slerp (spherical interpolation) for rotation (includes body Y-rotation now)
    Quaternion.SlerpToRef(this.currentRotation, this.targetRotation, lerpFactor, this.currentRotation);

    // Update mesh position and rotation
    this.mesh.position.copyFrom(this.currentPosition);
    if (this.mesh.rotationQuaternion) {
      this.mesh.rotationQuaternion.copyFrom(this.currentRotation);
    }

    // Update arm pointing direction
    this.updateArmRotation();

    // Clear dirty flag after interpolation
    this.isDirty = false;
  }

  /**
   * Update arm parent positions to follow player body
   * Arms rotation is now inherited from body mesh rotation (no separate rotation needed)
   */
  private updateArmRotation(): void {
    if (!this.leftArm || !this.rightArm) return;

    // Update parent positions to follow player
    this.leftArm.parent.position.copyFrom(this.currentPosition);
    this.rightArm.parent.position.copyFrom(this.currentPosition);

    // Arms rotation now follows body mesh rotation automatically
    // No need to set Y-rotation here - it's inherited from body quaternion
    this.leftArm.parent.rotationQuaternion = this.currentRotation.clone();
    this.rightArm.parent.rotationQuaternion = this.currentRotation.clone();
  }

  /**
   * Get player session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get player mesh
   */
  getMesh(): Mesh {
    return this.mesh;
  }

  /**
   * Get left arm tip position (end of lower arm)
   * Calculates actual tip position, not mesh center
   */
  getLeftArmTip(): Vector3 | null {
    if (!this.leftArm || !this.armConfig) return null;

    // Get mesh center position
    const center = this.leftArm.lower.getAbsolutePosition();

    // Transform local -Y direction to world space to get "down" direction
    const downDirection = Vector3.TransformNormal(
      new Vector3(0, -1, 0),
      this.leftArm.lower.getWorldMatrix()
    );

    // Offset from center to tip (half the lower arm length in down direction)
    const tipOffset = downDirection.scale(this.armConfig.lowerLength / 2);
    return center.add(tipOffset);
  }

  /**
   * Get right arm tip position (end of lower arm)
   * Calculates actual tip position, not mesh center
   */
  getRightArmTip(): Vector3 | null {
    if (!this.rightArm || !this.armConfig) return null;

    // Get mesh center position
    const center = this.rightArm.lower.getAbsolutePosition();

    // Transform local -Y direction to world space to get "down" direction
    const downDirection = Vector3.TransformNormal(
      new Vector3(0, -1, 0),
      this.rightArm.lower.getWorldMatrix()
    );

    // Offset from center to tip (half the lower arm length in down direction)
    const tipOffset = downDirection.scale(this.armConfig.lowerLength / 2);
    return center.add(tipOffset);
  }

  /**
   * Dispose player mesh
   */
  dispose(): void {
    // Dispose arm connector
    if (this.armConnector) {
      this.armConnector.dispose();
      this.armConnector = null;
    }

    // Dispose arms (parent nodes will dispose children automatically)
    if (this.leftArm) {
      this.leftArm.parent.dispose();
      this.leftArm = null;
    }
    if (this.rightArm) {
      this.rightArm.parent.dispose();
      this.rightArm = null;
    }

    // Dispose head
    if (this.head) {
      this.head.dispose();
      this.head = null;
    }

    // Dispose legs
    if (this.leftLeg) {
      this.leftLeg.dispose();
      this.leftLeg = null;
    }
    if (this.rightLeg) {
      this.rightLeg.dispose();
      this.rightLeg = null;
    }

    // Dispose wireframe
    if (this.wireframeMesh) {
      this.wireframeMesh.dispose();
      this.wireframeMesh = null;
    }

    // Dispose main mesh
    this.mesh.dispose();
  }
}
