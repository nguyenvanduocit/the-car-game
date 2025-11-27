import {
  Scene,
  Ray,
  RayHelper,
  PointerEventTypes,
  PointerInfo,
  Observer,
  Mesh,
  Color3,
  Vector3,
} from '@babylonjs/core';
import { FORK_METRICS } from '@blockgame/shared';
import type { Camera, AbstractMesh } from '@babylonjs/core';
import type { ColyseusClient } from '../network/ColyseusClient';
import type { Frame } from './Frame';
import type { StateSync } from '../network/StateSync';
import type { GameCamera } from './Camera';
import type { GameSound } from './Sound';

/**
 * Raycast handler for tile and frame slot clicking
 * Detects clicks on 3D objects and sends events to server
 */
export class Raycast {
  private scene: Scene;
  private camera: GameCamera;
  private client: ColyseusClient;
  private sound: GameSound | null = null;
  private stateSync: StateSync | null = null;
  private frame: Frame | null = null;
  private pointerObserver: Observer<PointerInfo> | null = null;
  private isPointerLocked: boolean = false;
  private pointerLockEnabled: boolean = true;
  private permanentlyDisabled: boolean = false;

  // Charge mechanic for tile shooting
  private isCharging: boolean = false;
  private chargeStartTime: number = 0;
  private chargingTileIndex: number | null = null;
  private readonly MIN_STRENGTH = 1;
  private readonly MAX_STRENGTH = 100;
  private readonly MAX_CHARGE_TIME = 2000; // 2 seconds to reach max strength

  constructor(scene: Scene, camera: GameCamera, client: ColyseusClient) {
    this.scene = scene;
    this.camera = camera;
    this.client = client;

    this.setupPointerInput();
    this.setupPointerLock();
  }

  /**
   * Set state sync reference for tile detection
   */
  setStateSync(stateSync: StateSync): void {
    this.stateSync = stateSync;
  }

  /**
   * Set frame reference for frame slot detection
   */
  setFrame(frame: Frame): void {
    this.frame = frame;
  }

  /**
   * Set sound system reference for audio feedback
   */
  setSound(sound: GameSound): void {
    this.sound = sound;
  }

  /**
   * Setup pointer input listener for clicks
   */
  private setupPointerInput(): void {
    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        this.handlePointerDown(pointerInfo);
      } else if (pointerInfo.type === PointerEventTypes.POINTERUP) {
        this.handlePointerUp(pointerInfo);
      }
    });
  }

  /**
   * Setup pointer lock for FPS controls
   */
  private setupPointerLock(): void {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (!canvas) return;

    // Request pointer lock on canvas click (only if enabled and not permanently disabled)
    canvas.addEventListener('click', () => {
      if (!this.isPointerLocked && this.pointerLockEnabled && !this.permanentlyDisabled) {
        canvas.requestPointerLock();
      }
    });

    // Track pointer lock state
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === canvas;
    });
  }

  /**
   * Handle pointer down event (click)
   */
  private handlePointerDown(pointerInfo: PointerInfo): void {
    // Only process clicks when pointer is locked (in-game)
    if (!this.isPointerLocked) return;

    // Get mouse button (0 = left, 1 = middle, 2 = right)
    const button = pointerInfo.event.button;

    // Create ray from camera through mouse position
    const ray = this.createRayFromCamera();
    if (!ray) return;

    // Right mouse button: start charging
    if (button === 2) {
      this.handleRightButtonDown(ray);
      return;
    }

    // Left mouse button: frame slot, fork attack, or tile click
    if (button === 0) {
      // Check for fork attack (melee attack on another player)
      const forkAttackHit = this.checkForkAttackInteraction();
      if (forkAttackHit) {
        this.handleForkAttack(forkAttackHit.targetSessionId);
        return;
      }

      // Check for frame slot hit (higher priority than tiles)
      const frameSlotHit = this.checkFrameSlotHit(ray);
      if (frameSlotHit) {
        this.handleFrameSlotClick(frameSlotHit.slotIndex);
        return;
      }

      // Check for tile hit (Phase 5 implementation)
      // CHANGED: Use pickup zone (box) instead of raycast
      const tileHit = this.checkTileInPickupZone();
      if (tileHit) {
        this.handleTileClick(tileHit.tileIndex);
        return;
      }
    }
  }

  /**
   * Handle pointer up event (release)
   */
  private handlePointerUp(pointerInfo: PointerInfo): void {
    // Only process when pointer is locked (in-game)
    if (!this.isPointerLocked) return;

    // Get mouse button (0 = left, 1 = middle, 2 = right)
    const button = pointerInfo.event.button;

    // Right mouse button released: shoot tile with charged strength
    if (button === 2 && this.isCharging) {
      this.handleRightButtonUp();
    }
  }

  /**
   * Create ray from left arm tip to right arm tip
   */
  private createRayFromCamera(): Ray | null {
    if (!this.stateSync) return null;

    const localPlayer = this.stateSync.getLocalPlayer();
    if (!localPlayer) return null;

    const leftTip = localPlayer.getLeftArmTip();
    const rightTip = localPlayer.getRightArmTip();

    if (!leftTip || !rightTip) return null;

    // Create ray from left tip to right tip
    const direction = rightTip.subtract(leftTip).normalize();
    const distance = Vector3.Distance(leftTip, rightTip);
    return new Ray(leftTip, direction, distance);
  }

  /**
   * Check if ray hits a frame slot
   */
  private checkFrameSlotHit(ray: Ray): { slotIndex: number } | null {
    if (!this.frame) return null;

    const slotMeshes = this.frame.getSlotMeshes();
    const pickResult = this.scene.pickWithRay(ray, (mesh) => {
      // Only pick frame slot meshes
      return slotMeshes.includes(mesh as any);
    });

    if (pickResult && pickResult.hit && pickResult.pickedMesh) {
      const metadata = pickResult.pickedMesh.metadata;
      if (metadata && metadata.isFrameSlot) {
        return { slotIndex: metadata.slotIndex };
      }
    }

    return null;
  }

  /**
   * Check if any tile is within the pickup zone (between forks)
   * Uses vertical rays from the fork area to detect tiles below
   * Scans center and corners to cover the rectangular area
   */
  private checkTileInPickupZone(): { tileIndex: number } | null {
    if (!this.stateSync) return null;

    const localPlayer = this.stateSync.getLocalPlayer();
    if (!localPlayer) return null;

    const vehicleMesh = localPlayer.getMesh();
    const worldMatrix = vehicleMesh.getWorldMatrix();

    // Define pickup zone dimensions (local space)
    const halfWidth = (FORK_METRICS.spacing + FORK_METRICS.width) / 2;
    const halfLength = FORK_METRICS.length / 2;
    const centerX = 0;
    const centerZ = FORK_METRICS.offsetZ;
    const startY = FORK_METRICS.offsetY + 1.0; // Start ray above forks

    // Define ray origins in local space (Center + 4 Corners)
    const localOrigins = [
      new Vector3(centerX, startY, centerZ), // Center
      new Vector3(centerX - halfWidth, startY, centerZ - halfLength), // Back Left
      new Vector3(centerX + halfWidth, startY, centerZ - halfLength), // Back Right
      new Vector3(centerX - halfWidth, startY, centerZ + halfLength), // Front Left
      new Vector3(centerX + halfWidth, startY, centerZ + halfLength), // Front Right
    ];

    // Direction is always down relative to vehicle (or world down?)
    // Use World Down for reliable ground picking
    const direction = new Vector3(0, -1, 0);
    const length = 3.0; // Sufficient length to reach ground

    // DEBUG: Visualize rays
    const debugColors = [
      new Color3(1, 0, 0), // Center - Red
      new Color3(0, 1, 0), // BL - Green
      new Color3(0, 0, 1), // BR - Blue
      new Color3(1, 1, 0), // FL - Yellow
      new Color3(0, 1, 1), // FR - Cyan
    ];

    for (let i = 0; i < localOrigins.length; i++) {
      const localOrigin = localOrigins[i];
      // Transform origin to world space
      const worldOrigin = Vector3.TransformCoordinates(localOrigin, worldMatrix);

      // Create ray
      const ray = new Ray(worldOrigin, direction, length);

      // DEBUG: Show ray
      const rayHelper = new RayHelper(ray);
      rayHelper.show(this.scene, debugColors[i]);
      setTimeout(() => rayHelper.dispose(), 100); // Show for 100ms

      // Pick with ray
      const pickInfo = this.scene.pickWithRay(ray, (mesh) => {
        // Predicate: Only pick tiles
        // Check metadata for type 'tile'
        return mesh.metadata && mesh.metadata.type === 'tile';
      });

      if (pickInfo && pickInfo.hit && pickInfo.pickedMesh) {
        const mesh = pickInfo.pickedMesh;

        // Extract tile index from metadata
        if (mesh.metadata && typeof mesh.metadata.index === 'number') {
          console.log(`[RAYCAST] Pickup zone detected tile ${mesh.metadata.index} at distance ${pickInfo.distance}`);
          return { tileIndex: mesh.metadata.index };
        }
      }
    }

    return null;
  }

  /**
   * Check if vehicle fork tips are inside another player's collision box
   * Returns target player sessionId if contact detected
   */
  private checkForkAttackInteraction(): { targetSessionId: string } | null {
    if (!this.stateSync) return null;

    const localPlayer = this.stateSync.getLocalPlayer();
    if (!localPlayer) return null;

    // Get fork tips
    const leftTip = localPlayer.getLeftArmTip();
    const rightTip = localPlayer.getRightArmTip();

    if (!leftTip && !rightTip) return null;

    // Get all players except local player
    const allPlayers = this.stateSync.getPlayers();

    for (const [sessionId, playerRenderer] of allPlayers.entries()) {
      // Skip local player
      if (sessionId === localPlayer.getSessionId()) continue;

      const playerMesh = playerRenderer.getChassis(); // Get actual mesh for intersection

      // Check if either fork tip intersects with the player's bounding box
      if (leftTip && playerMesh.intersectsPoint(leftTip)) {
        console.log(`[RAYCAST] Left fork tip hit player ${sessionId}`);
        return { targetSessionId: sessionId };
      }

      if (rightTip && playerMesh.intersectsPoint(rightTip)) {
        console.log(`[RAYCAST] Right fork tip hit player ${sessionId}`);
        return { targetSessionId: sessionId };
      }
    }

    return null;
  }

  /**
   * Handle fork attack (melee attack on another player)
   */
  private handleForkAttack(targetSessionId: string): void {
    console.log(`[RAYCAST] Fork attack on player ${targetSessionId}`);

    // Play attack sound
    if (this.sound) {
      this.sound.play('tileClick'); // Reuse tile click sound for now
    }

    // Send fork attack message to server
    this.client.sendForkAttack(targetSessionId);
  }

  /**
   * Handle tile click
   */
  private handleTileClick(tileIndex: number): void {
    console.log(`[RAYCAST] Tile ${tileIndex} clicked`);

    // Play click sound
    if (this.sound) {
      this.sound.play('tileClick');
    }

    // Send tile click request to server
    this.client.sendTileClick(tileIndex);
  }

  /**
   * Handle frame slot click
   */
  private handleFrameSlotClick(slotIndex: number): void {
    console.log(`[RAYCAST] Frame slot ${slotIndex} clicked`);

    // Send frame placement request to server
    // Note: Sound plays when tile actually lands (server-confirmed)
    this.client.sendFramePlacement(slotIndex);
  }

  /**
   * Handle right mouse button down - start charging
   */
  private handleRightButtonDown(ray: Ray): void {
    // Check for tile hit (using pickup zone)
    const tileHit = this.checkTileInPickupZone();
    if (!tileHit) return;

    // Start charging
    this.isCharging = true;
    this.chargeStartTime = performance.now();
    this.chargingTileIndex = tileHit.tileIndex;

    // Send start charge message to server (SERVER CONTROLS POSITION)
    this.client.sendStartTileCharge(tileHit.tileIndex);

    // Play charging sound (will loop)
    if (this.sound) {
      this.sound.play('charging');
    }

    console.log(`[RAYCAST] Started charging tile ${tileHit.tileIndex}`);
  }

  /**
   * Handle right mouse button up - shoot tile with charged strength
   */
  private handleRightButtonUp(): void {
    if (!this.isCharging || this.chargingTileIndex === null) return;
    this.releaseTile('manual');
  }

  /**
   * Handle tile auto-release when max charge is reached
   * Called by StateSync when tile state changes to on_floor
   */
  handleTileAutoRelease(tileIndex: number): void {
    // Only handle if we're currently charging this tile
    if (!this.isCharging || this.chargingTileIndex !== tileIndex) return;
    this.releaseTile('auto');
  }

  /**
   * Release charged tile (shared logic for manual and auto release)
   */
  private releaseTile(source: 'manual' | 'auto'): void {
    if (this.chargingTileIndex === null) return;

    console.log(`[RAYCAST] Releasing charged tile ${this.chargingTileIndex} (${source})`);

    // Stop charging sound
    if (this.sound) {
      this.sound.stop('charging');
    }

    // Play tile shot sound
    if (this.sound) {
      this.sound.play('tileShot');
    }

    // Get player's facing direction (camera rotation)
    const rotation = this.camera.getRotation();

    // Calculate forward direction based on camera rotation (camera forward = -cos/-sin)
    const forwardX = -Math.cos(rotation);
    const forwardZ = -Math.sin(rotation);

    console.log(`[RAYCAST] Shooting tile ${this.chargingTileIndex} with rotation ${rotation.toFixed(3)} -> Direction: (${forwardX.toFixed(3)}, 0, ${forwardZ.toFixed(3)})`);

    // Send tile shoot request to server (SERVER CALCULATES STRENGTH)
    this.client.sendTileShoot(this.chargingTileIndex, {
      x: forwardX,
      y: 0,
      z: forwardZ,
    });

    // Reset charging state
    this.isCharging = false;
    this.chargeStartTime = 0;
    this.chargingTileIndex = null;
  }

  /**
   * Get currently hovered frame slot (for UI feedback)
   * Returns null if not hovering over a slot
   */
  getHoveredFrameSlot(): number | null {
    if (!this.isPointerLocked || !this.frame) return null;

    const ray = this.createRayFromCamera();
    if (!ray) return null;

    const hit = this.checkFrameSlotHit(ray);
    return hit ? hit.slotIndex : null;
  }

  /**
   * Disable automatic pointer lock (for UI dialogs)
   */
  disablePointerLock(): void {
    this.pointerLockEnabled = false;
  }

  /**
   * Enable automatic pointer lock (after UI dialogs close)
   * Will not enable if permanently disabled (e.g., after disconnect)
   */
  enablePointerLock(): void {
    if (this.permanentlyDisabled) return;
    this.pointerLockEnabled = true;
  }

  /**
   * Permanently disable pointer lock (e.g., on disconnect)
   * Cannot be re-enabled after this is called
   */
  permanentlyDisablePointerLock(): void {
    this.permanentlyDisabled = true;
    this.pointerLockEnabled = false;
  }

  /**
   * Dispose raycast handler
   */
  dispose(): void {
    // Stop charging sound if playing
    if (this.isCharging && this.sound) {
      this.sound.stop('charging');
    }

    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
  }
}
