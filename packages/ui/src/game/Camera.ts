import { Scene, ArcRotateCamera, Vector3 } from '@babylonjs/core';
import { PLAYER_CONFIG, VEHICLE_LAYOUT } from '@blockgame/shared';

/**
 * Third-person camera setup for BlockGame
 * Camera orbits around the vehicle
 */
export class GameCamera {
  private camera: ArcRotateCamera;
  private scene: Scene;
  private playerPosition: Vector3; // Vehicle center point (raw target)
  private smoothedTarget: Vector3; // Smoothed camera target (prevents jitter)

  // Camera settings optimized for monster truck vehicle
  private readonly VEHICLE_CAMERA_HEIGHT_OFFSET = 1.5; // Height above vehicle center (vehicle is 2.0 tall)
  private readonly VEHICLE_CAMERA_DISTANCE = 10; // Distance behind vehicle (closer than old 12)

  // Camera smoothing factor (0.1 = very smooth, 0.3 = responsive, 1.0 = instant)
  // This smooths out the jitter from server updates arriving at 20Hz while client renders at 60fps
  private readonly CAMERA_SMOOTH_FACTOR = 0.2;

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.scene = scene;
    this.playerPosition = new Vector3(
      0,
      this.VEHICLE_CAMERA_HEIGHT_OFFSET,
      0
    );
    // Initialize smoothed target at same position
    this.smoothedTarget = this.playerPosition.clone();

    // Create ArcRotateCamera orbiting around vehicle
    // Parameters: name, alpha (horizontal rotation), beta (vertical rotation), radius (distance), target
    // Alpha: 0 = +X side, PI/2 = +Z side, PI = -X side, -PI/2 = -Z side
    // Vehicle faces +Z, so camera behind = -Z side = -PI/2
    this.camera = new ArcRotateCamera(
      'vehicleCamera',
      -Math.PI / 2, // Start behind vehicle (camera on -Z side, looking forward with vehicle)
      Math.PI / 2.5, // ~54 degrees from vertical, gives great forward field of view
      this.VEHICLE_CAMERA_DISTANCE, // Default distance, user can zoom out
      this.playerPosition,
      this.scene
    );

    // Attach mouse controls for rotation
    this.camera.attachControl(canvas, true);

    // Camera settings
    this.camera.minZ = 0;
    this.camera.maxZ = 1000;

    // Limit vertical rotation (prevent camera from going below ground or flipping over)
    this.camera.lowerBetaLimit = 0.01; // ~0 degrees (top-down view)
    this.camera.upperBetaLimit = Math.PI / 2; // 90 degrees (horizontal view)

    // Limit zoom distance (adjusted for vehicle)
    this.camera.lowerRadiusLimit = this.VEHICLE_CAMERA_DISTANCE * 0.4; // Min zoom (4 units)
    this.camera.upperRadiusLimit = this.VEHICLE_CAMERA_DISTANCE * 5.0; // Max zoom (50 units)

    // Smooth camera movements
    this.camera.inertia = 0.9;
    this.camera.angularSensibilityX = 1000;
    this.camera.angularSensibilityY = 1000;
    this.camera.wheelPrecision = 50;

    // Remove keyboard input
    this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
  }

  /**
   * Set vehicle position (camera target will follow with smoothing)
   * Smoothing prevents jitter from server updates arriving at 20Hz while rendering at 60fps
   */
  setPosition(x: number, y: number, z: number): void {
    // Update raw target position
    this.playerPosition.set(
      x,
      y + this.VEHICLE_CAMERA_HEIGHT_OFFSET, // Height above vehicle center
      z
    );

    // Lerp smoothed target toward raw target (prevents camera jitter)
    this.smoothedTarget.x += (this.playerPosition.x - this.smoothedTarget.x) * this.CAMERA_SMOOTH_FACTOR;
    this.smoothedTarget.y += (this.playerPosition.y - this.smoothedTarget.y) * this.CAMERA_SMOOTH_FACTOR;
    this.smoothedTarget.z += (this.playerPosition.z - this.smoothedTarget.z) * this.CAMERA_SMOOTH_FACTOR;

    // Camera follows the smoothed target
    this.camera.setTarget(this.smoothedTarget);
  }

  /**
   * Get player position (the center point)
   */
  getPlayerPosition(): Vector3 {
    return this.playerPosition.clone();
  }

  /**
   * Get camera rotation (yaw) for movement calculations
   */
  getRotation(): number {
    return this.camera.alpha;
  }

  /**
   * Set camera rotation (yaw)
   */
  setRotation(yaw: number): void {
    this.camera.alpha = yaw;
  }

  /**
   * Get the BabylonJS camera instance
   */
  getCamera(): ArcRotateCamera {
    return this.camera;
  }

  /**
   * Dispose camera
   */
  dispose(): void {
    this.camera.dispose();
  }
}
