/**
 * VehicleRenderer (Monster Truck) - Visual representation only
 *
 * SIMPLIFIED PHYSICS APPROACH:
 * - Server: Box physics (1.5×2×2.5) - simple sliding movement
 * - Client: Visual monster truck with animated wheels
 * - Wheels: Rotate based on velocity (visual only, no physics)
 * - Forks: Hold tiles at attachment point
 *
 * This is NOT a player-controlled entity - it only renders server state!
 */

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { GlowLayer } from '@babylonjs/core/Layers/glowLayer';

/**
 * Shared spoke master mesh manager (singleton)
 * Creates one master spoke mesh that all vehicles instance from
 */
class SpokeMasterMesh {
  private static instance: SpokeMasterMesh | null = null;
  private masterSpoke: Mesh | null = null;
  private material: StandardMaterial | null = null;

  private constructor() {}

  static getInstance(): SpokeMasterMesh {
    if (!SpokeMasterMesh.instance) {
      SpokeMasterMesh.instance = new SpokeMasterMesh();
    }
    return SpokeMasterMesh.instance;
  }

  getMasterSpoke(scene: Scene): Mesh {
    // Check if master is disposed or belongs to a different/disposed scene
    // This handles scene reinitialization (e.g., reconnect)
    if (this.masterSpoke && this.masterSpoke.isDisposed()) {
      this.masterSpoke = null;
      this.material = null;
    }

    if (!this.masterSpoke) {
      // Create shared material
      this.material = new StandardMaterial('shared_spoke_mat', scene);
      this.material.diffuseColor = new Color3(0.8, 0.8, 0.85);
      this.material.specularColor = new Color3(1, 1, 1);
      this.material.emissiveColor = new Color3(0.15, 0.15, 0.15);

      // Create master spoke geometry (hidden)
      const spokeLength = WHEEL_METRICS.radius * 0.8;
      const spokeWidth = 0.08;
      const spokeHeight = WHEEL_METRICS.width + 0.04;

      this.masterSpoke = MeshBuilder.CreateBox(
        'master_spoke',
        {
          width: spokeWidth,
          height: spokeHeight,
          depth: spokeLength * 2,
        },
        scene
      );
      this.masterSpoke.material = this.material;
      this.masterSpoke.isVisible = false; // Master is hidden
      this.masterSpoke.setEnabled(false);
    }
    return this.masterSpoke;
  }

  createInstance(name: string, scene: Scene): InstancedMesh {
    const master = this.getMasterSpoke(scene);
    const instance = master.createInstance(name);
    instance.isVisible = true;
    return instance;
  }

  dispose(): void {
    if (this.masterSpoke) {
      this.masterSpoke.dispose();
      this.masterSpoke = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    SpokeMasterMesh.instance = null;
  }
}
import {
  CHASSIS_METRICS,
  WHEEL_METRICS,
  FORK_METRICS,
  VEHICLE_LAYOUT,
  TILE_ATTACH_POINT,
  CAR_BODY_DIMENSIONS,
  PLAYER_CONFIG,
  getWheelRotationFromDistance,
} from '@blockgame/shared';

export class VehicleRenderer {
  private root: TransformNode; // Root at physics center (for world position tracking)
  private chassis: Mesh; // Main chassis mesh (invisible root for car parts)
  private mergedBody: Mesh | null = null; // OPTIMIZATION: All static body parts merged into one mesh
  private headlights: Mesh[] = []; // Separate for emissive material
  private taillights: Mesh[] = []; // Separate for emissive material
  private wheels: Mesh[] = []; // [frontLeft, frontRight, backLeft, backRight]
  private wheelSpokes: (Mesh | InstancedMesh)[][] = []; // Spokes for each wheel (instanced for performance)
  private frontWheelKnuckles: TransformNode[] = []; // [frontLeft, frontRight] for steering
  private axles: Mesh[] = []; // [front axle, back axle]
  private forks: Mesh[] = []; // [left fork, right fork]
  private rayConnector: Mesh | null = null; // Visual ray between fork tips
  private color: Color3; // Vehicle color (generated from sessionId)

  // Taxi-sign style roof label (name + health on one sign)
  // Two planes for front/back visibility (both readable, not mirrored)
  private roofSignFront: Mesh | null = null;
  private roofSignBack: Mesh | null = null;
  private roofSignTexture: DynamicTexture | null = null;
  private currentHealthPercent: number = 1; // Track for redrawing

  // Interpolation for smooth movement (matching PlayerRenderer API)
  private currentPosition: Vector3;
  private targetPosition: Vector3;
  private currentRotation: Quaternion;
  private targetRotation: Quaternion;
  private currentSteering: number = 0;
  private targetSteering: number = 0;

  // Velocity extrapolation (smooth between server updates)
  private velocity: Vector3 = Vector3.Zero();
  private lastTargetPosition: Vector3;
  private lastTargetTime: number = 0;
  private timeSinceLastUpdate: number = 0;

  // Frame-rate independent smoothing constants (units: per second)
  // Higher values = more responsive, lower = smoother
  private static readonly LOCAL_SMOOTHING_SPEED = 18; // Local player: very responsive
  private static readonly REMOTE_SMOOTHING_SPEED = 12; // Remote players: smooth
  private static readonly ROTATION_SMOOTHING_SPEED = 15; // Rotation: medium
  private static readonly STEERING_SMOOTHING_SPEED = 20; // Steering: responsive

  // Client-side prediction: Input state for local player
  // This allows immediate visual response before server confirms
  private inputThrottle: number = 0;
  private inputSteering: number = 0;

  // Wheel rotation tracking for animation
  private wheelRotation: number = 0;
  private lastPosition: Vector3;

  constructor(
    private scene: Scene,
    private sessionId: string,
    private displayName: string, // Player display name (for UI labels)
    position: Vector3,
    private isLocal: boolean = false // Is this the local player? (for debugging)
  ) {
    // Generate random color based on sessionId (consistent per player)
    this.color = this.generateColor(sessionId);

    // Initialize interpolation state
    this.currentPosition = position.clone();
    this.targetPosition = position.clone();
    this.lastPosition = position.clone();
    this.lastTargetPosition = position.clone();
    this.currentRotation = Quaternion.Identity();
    this.targetRotation = Quaternion.Identity();

    // Create root at physics center (this tracks world position)
    this.root = new TransformNode(`vehicle_root_${sessionId}`, scene);
    this.root.position.copyFrom(position);

    // Create vehicle parts (all parented to root with correct offsets)
    this.chassis = this.createChassis();
    this.createCarBodyParts(); // Add cabin, hood, trunk
    this.wheels = this.createWheels();
    this.axles = this.createAxles();
    this.forks = this.createForks();
    this.rayConnector = this.createRayConnector();

    // Create taxi-sign style roof label (name + health bar combined)
    this.createRoofSign();
  }

  /**
   * Create chassis (main body box) - now invisible, serves as root for car parts
   * Parented to root with upward offset to sit on wheels
   */
  private createChassis(): Mesh {
    const chassis = MeshBuilder.CreateBox(
      `chassis_${this.sessionId}`,
      {
        width: CHASSIS_METRICS.width,   // 1.5 - X
        height: CHASSIS_METRICS.height, // 1.0 - Y
        depth: CHASSIS_METRICS.depth,   // 2.5 - Z
      },
      this.scene
    );

    // Parent to root and offset upward to sit on wheels
    chassis.parent = this.root;
    chassis.position.y = VEHICLE_LAYOUT.chassis.centerY - 0.15; // +0.15 (lowered from +0.3 to be closer to wheels)

    // Material - main vehicle color
    const material = new StandardMaterial(`chassis_mat_${this.sessionId}`, this.scene);
    material.diffuseColor = this.color;
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    material.alpha = 0.3; // Semi-transparent to see car parts
    chassis.material = material;

    // Hide chassis (it's just a root for parts now)
    chassis.isVisible = false;

    return chassis;
  }

  /**
   * Create car body parts and merge them into a single mesh for performance
   * REFACTORED: 2-block design for cleaner alignment
   * - Base body: Long flat block from front to back
   * - Cabin: Sits on top of base
   */
  private createCarBodyParts(): void {
    const meshesToMerge: Mesh[] = [];

    // Create shared body material (will be applied to merged mesh)
    const bodyMat = new StandardMaterial(`body_mat_${this.sessionId}`, this.scene);
    bodyMat.diffuseColor = this.color;
    bodyMat.specularColor = new Color3(0.2, 0.2, 0.2);

    // Create a temporary parent at chassis position to bake correct local coords
    // This ensures merged geometry is relative to chassis center
    const tempParent = new TransformNode(`temp_merge_parent_${this.sessionId}`, this.scene);

    // --- 2-Block Design (from shared CAR_BODY_DIMENSIONS) ---

    // Block 1: Base body - long flat block from front to back
    const baseBody = MeshBuilder.CreateBox(
      `base_body_${this.sessionId}`,
      {
        width: CAR_BODY_DIMENSIONS.base.width,
        height: CAR_BODY_DIMENSIONS.base.height,
        depth: CAR_BODY_DIMENSIONS.base.depth,
      },
      this.scene
    );
    baseBody.parent = tempParent;
    baseBody.position.set(0, CAR_BODY_DIMENSIONS.base.offsetY, CAR_BODY_DIMENSIONS.base.offsetZ);
    meshesToMerge.push(baseBody);

    // Block 2: Cabin - sits on top of base body
    const cabin = MeshBuilder.CreateBox(
      `cabin_${this.sessionId}`,
      {
        width: CAR_BODY_DIMENSIONS.cabin.width,
        height: CAR_BODY_DIMENSIONS.cabin.height,
        depth: CAR_BODY_DIMENSIONS.cabin.depth,
      },
      this.scene
    );
    cabin.parent = tempParent;
    // Position cabin on top of base body
    const cabinY = CAR_BODY_DIMENSIONS.base.offsetY + CAR_BODY_DIMENSIONS.base.height / 2 + CAR_BODY_DIMENSIONS.cabin.height / 2;
    cabin.position.set(0, cabinY, CAR_BODY_DIMENSIONS.cabin.offsetZ);
    meshesToMerge.push(cabin);

    // Fenders (4)
    const fenderSize = {
      width: CHASSIS_METRICS.width * 0.15,
      height: CHASSIS_METRICS.height * 0.4,
      depth: 1.0,
    };
    const fenderPositions = [
      { x: -CHASSIS_METRICS.width / 2 - 0.05, z: WHEEL_METRICS.offsetZ },
      { x: CHASSIS_METRICS.width / 2 + 0.05, z: WHEEL_METRICS.offsetZ },
      { x: -CHASSIS_METRICS.width / 2 - 0.05, z: -WHEEL_METRICS.offsetZ },
      { x: CHASSIS_METRICS.width / 2 + 0.05, z: -WHEEL_METRICS.offsetZ },
    ];
    fenderPositions.forEach((pos, i) => {
      const fender = MeshBuilder.CreateBox(`fender_${i}_${this.sessionId}`, fenderSize, this.scene);
      fender.parent = tempParent;
      fender.position.set(pos.x, -0.4, pos.z); // Lowered to better cover wheels
      meshesToMerge.push(fender);
    });

    // Bumpers (2)
    const frontBumper = MeshBuilder.CreateBox(
      `bumper_front_${this.sessionId}`,
      { width: CHASSIS_METRICS.width + 0.2, height: 0.3, depth: 0.2 },
      this.scene
    );
    frontBumper.parent = tempParent;
    frontBumper.position.set(0, -0.3, CHASSIS_METRICS.depth / 2 + 0.1);
    meshesToMerge.push(frontBumper);

    const rearBumper = MeshBuilder.CreateBox(
      `bumper_rear_${this.sessionId}`,
      { width: CHASSIS_METRICS.width + 0.2, height: 0.3, depth: 0.2 },
      this.scene
    );
    rearBumper.parent = tempParent;
    rearBumper.position.set(0, -0.3, -CHASSIS_METRICS.depth / 2 - 0.1);
    meshesToMerge.push(rearBumper);

    // --- Window Frames (merged into body for performance) ---
    const cabinYCenter = CAR_BODY_DIMENSIONS.base.offsetY +
                   CAR_BODY_DIMENSIONS.base.height / 2 +
                   CAR_BODY_DIMENSIONS.cabin.height / 2;
    const cabinWidth = CAR_BODY_DIMENSIONS.cabin.width;
    const cabinHeight = CAR_BODY_DIMENSIONS.cabin.height;
    const cabinDepth = CAR_BODY_DIMENSIONS.cabin.depth;
    const cabinZ = CAR_BODY_DIMENSIONS.cabin.offsetZ;

    const frameThick = 0.1;
    const frameProtrude = 0.06;

    // Front windshield frame
    const frontWindowWidth = cabinWidth * 0.7;
    const frontWindowHeight = cabinHeight * 0.55;
    const frontY = cabinYCenter + cabinHeight * 0.05;
    const frontZ = cabinZ + cabinDepth / 2 + frameProtrude / 2;

    const frontTop = MeshBuilder.CreateBox(`wf_front_top_${this.sessionId}`,
      { width: frontWindowWidth + frameThick * 2, height: frameThick, depth: frameProtrude }, this.scene);
    frontTop.parent = tempParent;
    frontTop.position.set(0, frontY + frontWindowHeight / 2 + frameThick / 2, frontZ);
    meshesToMerge.push(frontTop);

    const frontBottom = MeshBuilder.CreateBox(`wf_front_bottom_${this.sessionId}`,
      { width: frontWindowWidth + frameThick * 2, height: frameThick, depth: frameProtrude }, this.scene);
    frontBottom.parent = tempParent;
    frontBottom.position.set(0, frontY - frontWindowHeight / 2 - frameThick / 2, frontZ);
    meshesToMerge.push(frontBottom);

    const frontLeft = MeshBuilder.CreateBox(`wf_front_left_${this.sessionId}`,
      { width: frameThick, height: frontWindowHeight, depth: frameProtrude }, this.scene);
    frontLeft.parent = tempParent;
    frontLeft.position.set(-frontWindowWidth / 2 - frameThick / 2, frontY, frontZ);
    meshesToMerge.push(frontLeft);

    const frontRight = MeshBuilder.CreateBox(`wf_front_right_${this.sessionId}`,
      { width: frameThick, height: frontWindowHeight, depth: frameProtrude }, this.scene);
    frontRight.parent = tempParent;
    frontRight.position.set(frontWindowWidth / 2 + frameThick / 2, frontY, frontZ);
    meshesToMerge.push(frontRight);

    // Side window frames
    const sideWindowLength = cabinDepth * 0.55;
    const sideWindowHeight = cabinHeight * 0.5;
    const sideY = cabinYCenter + cabinHeight * 0.05;

    // Left side window frame
    const leftX = -cabinWidth / 2 - frameProtrude / 2;

    const leftTop = MeshBuilder.CreateBox(`wf_left_top_${this.sessionId}`,
      { width: frameProtrude, height: frameThick, depth: sideWindowLength + frameThick * 2 }, this.scene);
    leftTop.parent = tempParent;
    leftTop.position.set(leftX, sideY + sideWindowHeight / 2 + frameThick / 2, cabinZ);
    meshesToMerge.push(leftTop);

    const leftBottom = MeshBuilder.CreateBox(`wf_left_bottom_${this.sessionId}`,
      { width: frameProtrude, height: frameThick, depth: sideWindowLength + frameThick * 2 }, this.scene);
    leftBottom.parent = tempParent;
    leftBottom.position.set(leftX, sideY - sideWindowHeight / 2 - frameThick / 2, cabinZ);
    meshesToMerge.push(leftBottom);

    const leftFront = MeshBuilder.CreateBox(`wf_left_front_${this.sessionId}`,
      { width: frameProtrude, height: sideWindowHeight, depth: frameThick }, this.scene);
    leftFront.parent = tempParent;
    leftFront.position.set(leftX, sideY, cabinZ + sideWindowLength / 2 + frameThick / 2);
    meshesToMerge.push(leftFront);

    const leftBack = MeshBuilder.CreateBox(`wf_left_back_${this.sessionId}`,
      { width: frameProtrude, height: sideWindowHeight, depth: frameThick }, this.scene);
    leftBack.parent = tempParent;
    leftBack.position.set(leftX, sideY, cabinZ - sideWindowLength / 2 - frameThick / 2);
    meshesToMerge.push(leftBack);

    // Right side window frame
    const rightX = cabinWidth / 2 + frameProtrude / 2;

    const rightTop = MeshBuilder.CreateBox(`wf_right_top_${this.sessionId}`,
      { width: frameProtrude, height: frameThick, depth: sideWindowLength + frameThick * 2 }, this.scene);
    rightTop.parent = tempParent;
    rightTop.position.set(rightX, sideY + sideWindowHeight / 2 + frameThick / 2, cabinZ);
    meshesToMerge.push(rightTop);

    const rightBottom = MeshBuilder.CreateBox(`wf_right_bottom_${this.sessionId}`,
      { width: frameProtrude, height: frameThick, depth: sideWindowLength + frameThick * 2 }, this.scene);
    rightBottom.parent = tempParent;
    rightBottom.position.set(rightX, sideY - sideWindowHeight / 2 - frameThick / 2, cabinZ);
    meshesToMerge.push(rightBottom);

    const rightFront = MeshBuilder.CreateBox(`wf_right_front_${this.sessionId}`,
      { width: frameProtrude, height: sideWindowHeight, depth: frameThick }, this.scene);
    rightFront.parent = tempParent;
    rightFront.position.set(rightX, sideY, cabinZ + sideWindowLength / 2 + frameThick / 2);
    meshesToMerge.push(rightFront);

    const rightBack = MeshBuilder.CreateBox(`wf_right_back_${this.sessionId}`,
      { width: frameProtrude, height: sideWindowHeight, depth: frameThick }, this.scene);
    rightBack.parent = tempParent;
    rightBack.position.set(rightX, sideY, cabinZ - sideWindowLength / 2 - frameThick / 2);
    meshesToMerge.push(rightBack);

    // --- Side Mirrors (merged into body) ---
    const mirrorWidth = 0.08;
    const mirrorHeight = 0.12;
    const mirrorDepth = 0.18;
    const armLength = 0.15;
    const armThick = 0.04;

    const leftMirrorY = cabinYCenter - cabinHeight * 0.05;
    const leftMirrorZ = cabinZ + cabinDepth / 2 - 0.1;

    const leftArm = MeshBuilder.CreateBox(`mirror_arm_left_${this.sessionId}`,
      { width: armLength, height: armThick, depth: armThick }, this.scene);
    leftArm.parent = tempParent;
    leftArm.position.set(-cabinWidth / 2 - armLength / 2, leftMirrorY, leftMirrorZ);
    meshesToMerge.push(leftArm);

    const leftMirror = MeshBuilder.CreateBox(`mirror_left_${this.sessionId}`,
      { width: mirrorWidth, height: mirrorHeight, depth: mirrorDepth }, this.scene);
    leftMirror.parent = tempParent;
    leftMirror.position.set(-cabinWidth / 2 - armLength - mirrorWidth / 2, leftMirrorY, leftMirrorZ);
    meshesToMerge.push(leftMirror);

    const rightMirrorY = cabinYCenter - cabinHeight * 0.05;
    const rightMirrorZ = cabinZ + cabinDepth / 2 - 0.1;

    const rightArm = MeshBuilder.CreateBox(`mirror_arm_right_${this.sessionId}`,
      { width: armLength, height: armThick, depth: armThick }, this.scene);
    rightArm.parent = tempParent;
    rightArm.position.set(cabinWidth / 2 + armLength / 2, rightMirrorY, rightMirrorZ);
    meshesToMerge.push(rightArm);

    const rightMirror = MeshBuilder.CreateBox(`mirror_right_${this.sessionId}`,
      { width: mirrorWidth, height: mirrorHeight, depth: mirrorDepth }, this.scene);
    rightMirror.parent = tempParent;
    rightMirror.position.set(cabinWidth / 2 + armLength + mirrorWidth / 2, rightMirrorY, rightMirrorZ);
    meshesToMerge.push(rightMirror);

    // NOTE: Only headlights and taillights are NOT merged (need emissive materials)

    // Merge all meshes into one (massive performance boost)
    this.mergedBody = Mesh.MergeMeshes(
      meshesToMerge,
      true,  // disposeSource - dispose original meshes after merge
      true,  // allow32BitsIndices
      undefined, // meshSubclass
      false, // subdivideWithSubMeshes
      false  // multiMultiMaterials
    );

    // Clean up temp parent
    tempParent.dispose();

    if (this.mergedBody) {
      this.mergedBody.name = `body_merged_${this.sessionId}`;
      this.mergedBody.parent = this.chassis;
      this.mergedBody.position.set(0, 0, 0); // Centered on chassis
      this.mergedBody.material = bodyMat;
      this.mergedBody.receiveShadows = true;
      // NOTE: Do NOT freeze world matrix - body must move with vehicle
    }

    // Create lights as separate meshes (need emissive materials for glow)
    this.createLights();
  }

  /**
   * Create lights as separate meshes (need emissive materials for glow)
   */
  private createLights(): void {
    // Headlight material (warm white emissive)
    const headlightMat = new StandardMaterial(`headlight_mat_${this.sessionId}`, this.scene);
    headlightMat.emissiveColor = new Color3(1, 1, 0.8);
    headlightMat.disableLighting = true;

    // Taillight material (red emissive)
    const taillightMat = new StandardMaterial(`taillight_mat_${this.sessionId}`, this.scene);
    taillightMat.emissiveColor = new Color3(1, 0, 0);
    taillightMat.disableLighting = true;

    // Headlights (front)
    const headlightL = MeshBuilder.CreateBox(`headlight_L_${this.sessionId}`, { width: 0.25, height: 0.2, depth: 0.1 }, this.scene);
    headlightL.parent = this.chassis;
    headlightL.position.set(-0.5, -0.1, CHASSIS_METRICS.depth / 2);
    headlightL.material = headlightMat;
    this.headlights.push(headlightL);

    const headlightR = MeshBuilder.CreateBox(`headlight_R_${this.sessionId}`, { width: 0.25, height: 0.2, depth: 0.1 }, this.scene);
    headlightR.parent = this.chassis;
    headlightR.position.set(0.5, -0.1, CHASSIS_METRICS.depth / 2);
    headlightR.material = headlightMat;
    this.headlights.push(headlightR);

    // Taillights (rear)
    const taillightL = MeshBuilder.CreateBox(`taillight_L_${this.sessionId}`, { width: 0.25, height: 0.2, depth: 0.1 }, this.scene);
    taillightL.parent = this.chassis;
    taillightL.position.set(-0.5, -0.1, -CHASSIS_METRICS.depth / 2);
    taillightL.material = taillightMat;
    this.taillights.push(taillightL);

    const taillightR = MeshBuilder.CreateBox(`taillight_R_${this.sessionId}`, { width: 0.25, height: 0.2, depth: 0.1 }, this.scene);
    taillightR.parent = this.chassis;
    taillightR.position.set(0.5, -0.1, -CHASSIS_METRICS.depth / 2);
    taillightR.material = taillightMat;
    this.taillights.push(taillightR);
  }

  /**
   * Create 4 wheels (cylinders) at corners
   * Wheels will rotate based on movement velocity
   * Each wheel has spokes for visual rotation feedback
   */
  private createWheels(): Mesh[] {
    const wheels: Mesh[] = [];
    this.frontWheelKnuckles = [];
    this.wheelSpokes = [];

    // Wheel positions: [frontLeft, frontRight, backLeft, backRight]
    const positions = [
      { x: -WHEEL_METRICS.offsetX, z: WHEEL_METRICS.offsetZ },   // Front left
      { x: WHEEL_METRICS.offsetX, z: WHEEL_METRICS.offsetZ },    // Front right
      { x: -WHEEL_METRICS.offsetX, z: -WHEEL_METRICS.offsetZ },  // Back left
      { x: WHEEL_METRICS.offsetX, z: -WHEEL_METRICS.offsetZ },   // Back right
    ];

    const names = ['front_left', 'front_right', 'back_left', 'back_right'];

    // Spoke material (shared across all wheels for efficiency)
    // Bright silver with slight emissive for visibility
    const spokeMaterial = new StandardMaterial(`spoke_mat_${this.sessionId}`, this.scene);
    spokeMaterial.diffuseColor = new Color3(0.8, 0.8, 0.85); // Bright silver
    spokeMaterial.specularColor = new Color3(1, 1, 1);
    spokeMaterial.emissiveColor = new Color3(0.15, 0.15, 0.15); // Slight glow for visibility

    for (let i = 0; i < 4; i++) {
      const isFront = i < 2;
      let parent: TransformNode = this.root;

      // For front wheels, create steering knuckles
      if (isFront) {
        const knuckle = new TransformNode(`knuckle_${names[i]}_${this.sessionId}`, this.scene);
        knuckle.position.x = positions[i].x;
        knuckle.position.y = VEHICLE_LAYOUT.wheel.centerY;
        knuckle.position.z = positions[i].z;
        knuckle.parent = this.root;
        this.frontWheelKnuckles.push(knuckle);
        parent = knuckle;
      }

      const wheel = MeshBuilder.CreateCylinder(
        `wheel_${names[i]}_${this.sessionId}`,
        {
          diameter: WHEEL_METRICS.radius * 2, // 0.8
          height: WHEEL_METRICS.width,        // 0.3 (cylinder height = thickness)
          tessellation: 16,
        },
        this.scene
      );

      if (isFront) {
        // Parented to knuckle (which is already at position)
        wheel.position.set(0, 0, 0);
      } else {
        // Parented to root
        wheel.position.x = positions[i].x;
        wheel.position.y = VEHICLE_LAYOUT.wheel.centerY;
        wheel.position.z = positions[i].z;
      }

      // Rotate cylinder to horizontal (wheels face sideways)
      // Cylinder default: Y-axis (vertical) → Rotate 90° around Z to make X-axis
      wheel.rotation.z = Math.PI / 2;

      // Parent to appropriate node
      wheel.parent = parent;

      // Material - darker color for wheels (black/dark gray)
      const material = new StandardMaterial(`wheel_mat_${names[i]}_${this.sessionId}`, this.scene);
      material.diffuseColor = new Color3(0.1, 0.1, 0.1); // Dark gray
      material.specularColor = new Color3(0.3, 0.3, 0.3);
      wheel.material = material;

      // Create spokes for this wheel (5 spokes in radial pattern)
      const spokes = this.createWheelSpokes(wheel, names[i], spokeMaterial);
      this.wheelSpokes.push(spokes);

      wheels.push(wheel);
    }

    return wheels;
  }

  /**
   * Create spokes for a wheel (3 spokes in radial pattern)
   * OPTIMIZATION: Uses instanced meshes from shared master geometry
   * All vehicles share the same spoke geometry, reducing draw calls
   */
  private createWheelSpokes(wheel: Mesh, wheelName: string, _material: StandardMaterial): (Mesh | InstancedMesh)[] {
    const spokes: (Mesh | InstancedMesh)[] = [];
    const numSpokes = 3;

    for (let i = 0; i < numSpokes; i++) {
      const angle = (i / numSpokes) * Math.PI * 2;

      // Create instanced spoke from shared master (much cheaper than new mesh)
      const spoke = SpokeMasterMesh.getInstance().createInstance(
        `spoke_${wheelName}_${i}_${this.sessionId}`,
        this.scene
      );

      // Position at wheel center
      spoke.position.set(0, 0, 0);

      // Rotate around Y axis to distribute radially
      spoke.rotation.y = angle;

      spoke.parent = wheel;

      spokes.push(spoke);
    }

    return spokes;
  }

  /**
   * Create axles and driveshaft merged into one mesh
   * Front axle, back axle, and connecting driveshaft
   */
  private createAxles(): Mesh[] {
    const meshesToMerge: Mesh[] = [];

    // Temp parent for merging
    const tempParent = new TransformNode(`temp_axle_parent_${this.sessionId}`, this.scene);

    // Axle positions: [front, back]
    const positions = [
      { z: WHEEL_METRICS.offsetZ },   // Front axle
      { z: -WHEEL_METRICS.offsetZ },  // Back axle
    ];

    for (let i = 0; i < 2; i++) {
      const axle = MeshBuilder.CreateCylinder(
        `axle_${i}_${this.sessionId}`,
        {
          diameter: 0.1,
          height: WHEEL_METRICS.offsetX * 2,
          tessellation: 8,
        },
        this.scene
      );
      axle.parent = tempParent;
      axle.position.set(0, VEHICLE_LAYOUT.wheel.centerY, positions[i].z);
      axle.rotation.z = Math.PI / 2;
      meshesToMerge.push(axle);
    }

    // Driveshaft - connects front and back axles
    const driveshaftLength = WHEEL_METRICS.offsetZ * 2;
    const driveshaft = MeshBuilder.CreateCylinder(
      `driveshaft_${this.sessionId}`,
      {
        diameter: 0.08,
        height: driveshaftLength,
        tessellation: 8,
      },
      this.scene
    );
    driveshaft.parent = tempParent;
    driveshaft.position.set(0, VEHICLE_LAYOUT.wheel.centerY, 0);
    driveshaft.rotation.x = Math.PI / 2;
    meshesToMerge.push(driveshaft);

    // Merge all axles and driveshaft into one mesh
    const mergedAxles = Mesh.MergeMeshes(
      meshesToMerge,
      true,  // disposeSource
      true,  // allow32BitsIndices
      undefined,
      false,
      false
    );

    tempParent.dispose();

    if (mergedAxles) {
      mergedAxles.name = `axles_merged_${this.sessionId}`;
      mergedAxles.parent = this.root;

      // Material - dark metallic gray
      const material = new StandardMaterial(`axle_mat_${this.sessionId}`, this.scene);
      material.diffuseColor = new Color3(0.2, 0.2, 0.2);
      material.specularColor = new Color3(0.4, 0.4, 0.4);
      mergedAxles.material = material;

      return [mergedAxles];
    }

    return [];
  }

  /**
   * Create 2 forks (prongs) extending forward
   * Tiles will attach between the forks
   */
  private createForks(): Mesh[] {
    const forks: Mesh[] = [];

    // Fork positions: left and right
    const positions = [
      { x: -FORK_METRICS.spacing / 2 }, // Left fork
      { x: FORK_METRICS.spacing / 2 },  // Right fork
    ];

    const names = ['left', 'right'];

    for (let i = 0; i < 2; i++) {
      const fork = MeshBuilder.CreateBox(
        `fork_${names[i]}_${this.sessionId}`,
        {
          width: FORK_METRICS.width,   // 0.2
          height: FORK_METRICS.height, // 0.15
          depth: FORK_METRICS.length,  // 1.0
        },
        this.scene
      );

      // Position relative to root
      fork.position.x = positions[i].x;
      fork.position.y = VEHICLE_LAYOUT.fork.centerY; // -0.15 (updated)
      fork.position.z = FORK_METRICS.offsetZ;         // 1.75

      // Parent to root
      fork.parent = this.root;

      // Material - bright orange with emissive glow for visibility
      const material = new StandardMaterial(`fork_mat_${names[i]}_${this.sessionId}`, this.scene);
      material.diffuseColor = new Color3(1.0, 0.5, 0.0); // Bright orange
      material.emissiveColor = new Color3(0.3, 0.15, 0.0); // Orange glow
      material.specularColor = new Color3(0.8, 0.4, 0.1);
      fork.material = material;

      forks.push(fork);
    }

    return forks;
  }

  /**
   * Create visual ray connector between fork tips
   * This shows the player where they're aiming for tile pickup
   */
  private createRayConnector(): Mesh {
    const connector = MeshBuilder.CreateCylinder(
      `ray_connector_${this.sessionId}`,
      {
        height: FORK_METRICS.spacing, // Distance between forks
        diameter: 0.03,
        tessellation: 8
      },
      this.scene
    );

    // Create glowing material
    const material = new StandardMaterial(`ray_connector_mat_${this.sessionId}`, this.scene);
    material.emissiveColor = new Color3(0, 1, 1); // Cyan glow
    material.disableLighting = true;
    material.alpha = 0.5; // Semi-transparent
    connector.material = material;

    // Parent to root
    connector.parent = this.root;

    // Position at fork tips (centered between them)
    connector.position.x = 0; // Centered between left and right forks
    connector.position.y = VEHICLE_LAYOUT.fork.centerY; // Same height as forks
    connector.position.z = FORK_METRICS.offsetZ + FORK_METRICS.length / 2; // At fork tips

    // Rotate 90° around Z to lay horizontally (X-axis)
    connector.rotation.z = Math.PI / 2;

    return connector;
  }

  /**
   * Create taxi-sign style roof sign with name + health bar
   * Two planes facing opposite directions (both readable)
   */
  private createRoofSign(): void {
    const signWidth = 1.4;
    const signHeight = 0.35;
    const signY = 1.35; // On top of cabin
    const signZ = 0.5; // Cabin offset

    // Create dynamic texture for name + health bar (shared by both planes)
    this.roofSignTexture = new DynamicTexture(
      `roofsign_tex_${this.sessionId}`,
      { width: 256, height: 64 },
      this.scene,
      false
    );
    this.drawRoofSignTexture();

    // Create shared material
    const material = new StandardMaterial(`roofsign_mat_${this.sessionId}`, this.scene);
    material.diffuseTexture = this.roofSignTexture;
    material.emissiveTexture = this.roofSignTexture; // Self-lit
    material.disableLighting = true;

    // Front-facing plane (visible when looking at car from behind, -Z direction)
    this.roofSignFront = MeshBuilder.CreatePlane(
      `roofsign_front_${this.sessionId}`,
      { width: signWidth, height: signHeight },
      this.scene
    );
    this.roofSignFront.parent = this.root;
    this.roofSignFront.position.y = signY;
    this.roofSignFront.position.z = signZ;
    this.roofSignFront.rotation.y = Math.PI; // Face -Z (backward)
    this.roofSignFront.material = material;
    this.roofSignFront.isPickable = false;

    // Back-facing plane (visible when looking at car from front, +Z direction)
    this.roofSignBack = MeshBuilder.CreatePlane(
      `roofsign_back_${this.sessionId}`,
      { width: signWidth, height: signHeight },
      this.scene
    );
    this.roofSignBack.parent = this.root;
    this.roofSignBack.position.y = signY;
    this.roofSignBack.position.z = signZ;
    // No rotation - faces +Z (forward)
    this.roofSignBack.material = material;
    this.roofSignBack.isPickable = false;
  }

  /**
   * Draw name + health bar on the roof sign texture
   */
  private drawRoofSignTexture(): void {
    if (!this.roofSignTexture) return;

    const ctx = this.roofSignTexture.getContext() as CanvasRenderingContext2D;
    const width = 256;
    const height = 64;

    // Clear and draw background
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw name (top portion)
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white';
    ctx.fillText(this.displayName, width / 2, 22);

    // Draw health bar background (bottom portion)
    const barX = 20;
    const barY = 44;
    const barWidth = width - 40;
    const barHeight = 12;

    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Draw health bar fill
    const fillWidth = barWidth * this.currentHealthPercent;
    ctx.fillStyle = this.currentHealthPercent > 0.3 ? '#cc2222' : '#ff4444'; // Brighter when low
    ctx.fillRect(barX, barY, fillWidth, barHeight);

    // Border
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    this.roofSignTexture.update();
  }

  /**
   * Update health bar display by redrawing the texture
   * @param currentHealth Current health value
   * @param maxHealth Maximum health value
   */
  updateHealth(currentHealth: number, maxHealth: number): void {
    const percent = Math.max(0, Math.min(1, currentHealth / maxHealth));

    // Only redraw if health changed significantly (avoid unnecessary redraws)
    if (Math.abs(percent - this.currentHealthPercent) > 0.01) {
      this.currentHealthPercent = percent;
      this.drawRoofSignTexture();
    }
  }

  /**
   * Update target position from server state (matching PlayerRenderer API)
   * StateSync will call this, then call interpolate() for smooth movement
   * Accepts raw x,y,z to avoid Vector3 allocation (GC optimization)
   */
  updateTargetPosition(position: Vector3 | { x: number; y: number; z: number }): void {
    const now = performance.now();
    const deltaTime = (now - this.lastTargetTime) / 1000; // Convert to seconds

    // Calculate velocity from position change (for local player extrapolation)
    if (deltaTime > 0.001 && deltaTime < 0.5) { // Valid delta (not first frame, not stale)
      const dx = position.x - this.lastTargetPosition.x;
      const dy = position.y - this.lastTargetPosition.y;
      const dz = position.z - this.lastTargetPosition.z;

      // Check if position actually changed (player is moving)
      // If position delta is very small, player has stopped - zero velocity
      const positionDeltaSq = dx * dx + dy * dy + dz * dz;
      const STOP_THRESHOLD_SQ = 0.0001; // 0.01 units squared

      if (positionDeltaSq > STOP_THRESHOLD_SQ) {
        this.velocity.set(dx / deltaTime, dy / deltaTime, dz / deltaTime);
      } else {
        // Player stopped - zero velocity to prevent drift
        this.velocity.set(0, 0, 0);
      }
    }

    // Store for next velocity calculation
    this.lastTargetPosition.set(position.x, position.y, position.z);
    this.lastTargetTime = now;
    this.timeSinceLastUpdate = 0;

    // Set target position
    this.targetPosition.set(position.x, position.y, position.z);
  }

  /**
   * Update target rotation from server state (matching PlayerRenderer API)
   * Uses full quaternion for proper pitch/roll on ramps
   */
  updateTargetRotation(rotation: { x: number; y: number; z: number; w: number }): void {
    this.targetRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  /**
   * Update target steering from server state
   */
  updateTargetSteering(steering: number): void {
    this.targetSteering = steering;
  }

  /**
   * Set current input state for client-side prediction (local player only)
   * This allows the vehicle to predict movement based on INPUT, not server state
   * @param throttle -1 to 1 (backward to forward)
   * @param steering -1 to 1 (left to right)
   */
  setInputState(throttle: number, steering: number): void {
    this.inputThrottle = throttle;
    this.inputSteering = steering;
  }

  /**
   * Interpolate towards target position/rotation (matching PlayerRenderer API)
   * Called every frame by StateSync for smooth movement
   * Uses frame-rate independent exponential smoothing for consistent feel at any FPS
   * @param factor Interpolation factor (0-1), typically 0.4 for remote players, 1.0 for local
   */
  interpolate(factor: number): void {
    // Get delta time in seconds
    const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;
    this.timeSinceLastUpdate += deltaTime;

    // Decay velocity over time when no updates received
    // This prevents drift when server stops sending updates (position threshold optimization)
    const VELOCITY_DECAY_START = 0.08; // Start decay after 80ms without update (more forgiving)
    const VELOCITY_DECAY_RATE = 6.0;   // Decay speed (reduced for smoother stop)
    if (this.timeSinceLastUpdate > VELOCITY_DECAY_START) {
      const decayFactor = Math.exp(-VELOCITY_DECAY_RATE * (this.timeSinceLastUpdate - VELOCITY_DECAY_START));
      this.velocity.scaleInPlace(decayFactor);
    }

    // Frame-rate independent exponential smoothing
    // Formula: factor = 1 - exp(-speed * deltaTime)
    // This ensures same smoothing feel at 30fps, 60fps, or 144fps
    const smoothingSpeed = this.isLocal
      ? VehicleRenderer.LOCAL_SMOOTHING_SPEED
      : VehicleRenderer.REMOTE_SMOOTHING_SPEED;
    const positionFactor = 1 - Math.exp(-smoothingSpeed * deltaTime);
    const rotationFactor = 1 - Math.exp(-VehicleRenderer.ROTATION_SMOOTHING_SPEED * deltaTime);
    const steeringFactor = 1 - Math.exp(-VehicleRenderer.STEERING_SMOOTHING_SPEED * deltaTime);

    // For remote players, add velocity extrapolation for smoother movement between updates
    let targetX = this.targetPosition.x;
    let targetY = this.targetPosition.y;
    let targetZ = this.targetPosition.z;

    if (!this.isLocal && this.timeSinceLastUpdate < 0.1) {
      // Extrapolate position based on last known velocity (max 100ms prediction)
      const extrapolationTime = Math.min(this.timeSinceLastUpdate, 0.05); // Cap at 50ms
      targetX += this.velocity.x * extrapolationTime;
      targetY += this.velocity.y * extrapolationTime;
      targetZ += this.velocity.z * extrapolationTime;
    }

    // Smooth position interpolation
    this.currentPosition.x += (targetX - this.currentPosition.x) * positionFactor;
    this.currentPosition.y += (targetY - this.currentPosition.y) * positionFactor;
    this.currentPosition.z += (targetZ - this.currentPosition.z) * positionFactor;

    // Slerp rotation (full quaternion for pitch/roll on ramps)
    Quaternion.SlerpToRef(this.currentRotation, this.targetRotation, rotationFactor, this.currentRotation);

    // Lerp steering with frame-rate independent factor
    this.currentSteering += (this.targetSteering - this.currentSteering) * steeringFactor;

    // Apply steering to front knuckles
    // Max steering angle visually (approx 30 degrees = 0.5 radians)
    const MAX_VISUAL_STEER = 0.5;
    const steerAngle = this.currentSteering * MAX_VISUAL_STEER;

    for (const knuckle of this.frontWheelKnuckles) {
      knuckle.rotation.y = steerAngle;
    }

    // Calculate distance traveled since last frame (for wheel rotation)
    const distance = Vector3.Distance(this.lastPosition, this.currentPosition);
    if (distance > 0.001) { // Only rotate if actually moving
      const rotationDelta = getWheelRotationFromDistance(distance);
      this.wheelRotation += rotationDelta;

      // Apply rotation to all wheels around X-axis (wheel axle direction)
      // Wheels are cylinders rotated 90° around Z, so their axis is now X
      for (const wheel of this.wheels) {
        wheel.rotation.x = this.wheelRotation;
      }
    }
    this.lastPosition.copyFrom(this.currentPosition);

    // Update root transform (root is at physics center)
    this.root.position.copyFrom(this.currentPosition);

    // Apply full quaternion rotation (enables pitch/roll on ramps)
    if (!this.root.rotationQuaternion) {
      this.root.rotationQuaternion = this.currentRotation.clone();
    } else {
      this.root.rotationQuaternion.copyFrom(this.currentRotation);
    }
  }

  /**
   * Get world position for tile attachment (on forks)
   */
  getTileAttachmentPosition(): Vector3 {
    // Use shared tile attach point configuration
    const localOffset = new Vector3(
      TILE_ATTACH_POINT.x,
      TILE_ATTACH_POINT.y,
      TILE_ATTACH_POINT.z
    );
    return Vector3.TransformCoordinates(localOffset, this.root.getWorldMatrix());
  }

  /**
   * Get vehicle's forward direction (world space)
   */
  getForwardDirection(): Vector3 {
    // Vehicle faces +Z in local space (before rotation)
    const forward = new Vector3(0, 0, 1);
    return Vector3.TransformNormal(forward, this.root.getWorldMatrix()).normalize();
  }

  /**
   * Get left fork tip position in world space
   * Used for raycasting to select tiles
   */
  getLeftForkTip(): Vector3 | null {
    if (this.forks.length < 2) return null;

    // Left fork is at index 0
    const leftFork = this.forks[0];

    // Tip is at the front of the fork (positive Z in local space)
    const tipLocalOffset = new Vector3(0, 0, FORK_METRICS.length / 2);

    return Vector3.TransformCoordinates(tipLocalOffset, leftFork.getWorldMatrix());
  }

  /**
   * Get right fork tip position in world space
   * Used for raycasting to select tiles
   */
  getRightForkTip(): Vector3 | null {
    if (this.forks.length < 2) return null;

    // Right fork is at index 1
    const rightFork = this.forks[1];

    // Tip is at the front of the fork (positive Z in local space)
    const tipLocalOffset = new Vector3(0, 0, FORK_METRICS.length / 2);

    return Vector3.TransformCoordinates(tipLocalOffset, rightFork.getWorldMatrix());
  }

  /**
   * Get left arm tip position (matching PlayerRenderer API for compatibility)
   * Vehicles have forks instead of arms - this is an alias
   */
  getLeftArmTip(): Vector3 | null {
    return this.getLeftForkTip();
  }

  /**
   * Get right arm tip position (matching PlayerRenderer API for compatibility)
   * Vehicles have forks instead of arms - this is an alias
   */
  getRightArmTip(): Vector3 | null {
    return this.getRightForkTip();
  }

  /**
   * Get main mesh for debugging/camera attachment (matching PlayerRenderer API)
   * Returns the root TransformNode which has the world position and proper Node interface
   * This is required for:
   * - Camera attachment (needs world position)
   * - Debug visualization parenting (needs proper Node with isEnabled method)
   */
  getMesh(): TransformNode {
    return this.root;
  }

  /**
   * Get chassis mesh (for shadow casting and other mesh-specific operations)
   * Use this when you need the actual Mesh, not the TransformNode root
   */
  getChassis(): Mesh {
    return this.chassis;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Enable shadow casting (matching PlayerRenderer API)
   * Adds vehicle meshes to shadow generator's render list
   */
  enableShadowCasting(shadowGenerator: ShadowGenerator): void {
    // Add merged body (main shadow caster)
    if (this.mergedBody) {
      shadowGenerator.addShadowCaster(this.mergedBody);
    }

    // Add wheels
    for (const wheel of this.wheels) {
      shadowGenerator.addShadowCaster(wheel);
    }

    // Add forks
    for (const fork of this.forks) {
      shadowGenerator.addShadowCaster(fork);
    }
  }

  /**
   * Enable glow effect (matching PlayerRenderer API)
   * Adds emissive meshes to glow layer
   */
  enableGlow(glowLayer: GlowLayer): void {
    // Add headlights (warm white glow)
    for (const light of this.headlights) {
      glowLayer.addIncludedOnlyMesh(light);
    }

    // Add taillights (red glow)
    for (const light of this.taillights) {
      glowLayer.addIncludedOnlyMesh(light);
    }

    // Add ray connector (cyan glow)
    if (this.rayConnector) {
      glowLayer.addIncludedOnlyMesh(this.rayConnector);
    }
  }

  /**
   * Generate consistent color from sessionId hash
   * Same sessionId always produces same color
   */
  private generateColor(sessionId: string): Color3 {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      hash = sessionId.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Convert hash to RGB (bright colors)
    const r = ((hash >> 0) & 0xFF) / 255;
    const g = ((hash >> 8) & 0xFF) / 255;
    const b = ((hash >> 16) & 0xFF) / 255;

    // Ensure colors are not too dark (minimum 0.3)
    return new Color3(
      Math.max(r, 0.3),
      Math.max(g, 0.3),
      Math.max(b, 0.3)
    );
  }

  /**
   * Set vehicle color (for team colors or customization)
   */
  setColor(color: Color3): void {
    this.color = color;
    if (this.chassis.material && this.chassis.material instanceof StandardMaterial) {
      this.chassis.material.diffuseColor = color;
    }
  }

  /**
   * Set visibility of the entire vehicle (for death/respawn)
   * @param visible Whether the vehicle should be visible
   */
  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
    // 3D label meshes are parented to root, so they follow automatically
  }

  /**
   * Dispose vehicle and all its meshes
   */
  dispose(): void {
    // Dispose roof sign planes and texture
    if (this.roofSignTexture) {
      this.roofSignTexture.dispose();
      this.roofSignTexture = null;
    }
    if (this.roofSignFront) {
      this.roofSignFront.dispose();
      this.roofSignFront = null;
    }
    if (this.roofSignBack) {
      this.roofSignBack.dispose();
      this.roofSignBack = null;
    }

    // Dispose merged body
    if (this.mergedBody) {
      this.mergedBody.dispose();
      this.mergedBody = null;
    }

    // Dispose lights (separate meshes for emissive materials)
    this.headlights.forEach(light => light.dispose());
    this.headlights = [];
    this.taillights.forEach(light => light.dispose());
    this.taillights = [];

    // Dispose all meshes (they're parented to root)
    this.chassis.dispose();
    // Dispose spokes first (they're children of wheels) - these are instances
    this.wheelSpokes.forEach(spokes => spokes.forEach(spoke => spoke.dispose()));
    this.wheelSpokes = [];
    this.wheels.forEach(wheel => wheel.dispose());
    this.axles.forEach(axle => axle.dispose());
    this.forks.forEach(fork => fork.dispose());

    if (this.rayConnector) {
      this.rayConnector.dispose();
      this.rayConnector = null;
    }

    // Dispose root last
    this.root.dispose();
  }
}
