import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  AbstractMesh,
  GlowLayer,
  Animation,
  SpotLight,
} from '@babylonjs/core';
import { FRAME_CONFIG, getFrameGrid } from '@blockgame/shared';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';

/**
 * Frame glow configuration
 */
const FRAME_GLOW_CONFIG = {
  emissiveColor: { r: 0.0, g: 0.8, b: 1.0 }, // Cyan glow
  emissiveIntensity: 2.0, // Increased for more visible glow
  diffuseColor: { r: 0.1, g: 0.4, b: 0.5 }, // Dark cyan base
  specularColor: { r: 0.5, g: 0.8, b: 1.0 }, // Bright cyan highlights
  specularPower: 64,
  glowIntensity: 1.5, // Increased for stronger glow halo
  pulseSpeed: 1.5, // Seconds per pulse cycle
  pulseMin: 0.7, // Lower minimum for more dramatic pulse
  pulseMax: 1.3, // Higher maximum for more dramatic pulse
} as const;

/**
 * Frame manager - renders picture frame and slot grid
 * Floating mesh above room center for tile assembly
 */
export class Frame {
  private scene: Scene;
  private frameMesh: Mesh | null = null;
  private slotMeshes: Mesh[] = [];
  private framePosition: Vector3;
  private gridWidth: number;
  private gridHeight: number;
  private slotSize: number;
  private slotSpacing: number;
  private frameMaterial: StandardMaterial | null = null;
  private glowLayer: GlowLayer | null = null;
  private spotLights: SpotLight[] = [];

  /**
   * Initialize frame rendering
   * @param scene BabylonJS scene
   * @param tileCount Total number of tiles (determines grid size)
   * @param position Frame position in 3D space
   */
  constructor(scene: Scene, tileCount: number, position?: Vector3) {
    this.scene = scene;
    this.slotSize = FRAME_CONFIG.slotSize;
    this.slotSpacing = FRAME_CONFIG.slotSpacing;
    this.framePosition = position ?? new Vector3(
      FRAME_CONFIG.position.x,
      FRAME_CONFIG.position.y,
      FRAME_CONFIG.position.z
    );

    // Calculate grid dimensions (try to make it roughly square)
    // For 20 tiles: 5x4, for 30 tiles: 6x5, for 50 tiles: 10x5
    const { columns, rows } = getFrameGrid(tileCount);
    this.gridWidth = Math.max(columns, 1);
    this.gridHeight = Math.max(rows, 1);

    this.createFrameMesh();
    this.createSlotMeshes(tileCount);
    this.createFrameLighting();
  }

  /**
   * Create main frame mesh (border)
   */
  private createFrameMesh(): void {
    const horizontalSpacing = Math.max(0, this.gridWidth - 1) * this.slotSpacing;
    const verticalSpacing = Math.max(0, this.gridHeight - 1) * this.slotSpacing;
    const slotAreaWidth = this.gridWidth * this.slotSize + horizontalSpacing;
    const slotAreaHeight = this.gridHeight * this.slotSize + verticalSpacing;
    const frameWidth = slotAreaWidth + 2 * this.slotSpacing;
    const frameHeight = slotAreaHeight + 2 * this.slotSpacing;

    // Create frame border (hollow rectangle)
    const borderThickness = 0.3;
    const borderDepth = 0.1;

    // Top border
    const topBorder = MeshBuilder.CreateBox(
      'frameTop',
      { width: frameWidth, height: borderThickness, depth: borderDepth },
      this.scene
    );
    topBorder.position = this.framePosition.clone();
    topBorder.position.y += frameHeight / 2;

    // Bottom border
    const bottomBorder = MeshBuilder.CreateBox(
      'frameBottom',
      { width: frameWidth, height: borderThickness, depth: borderDepth },
      this.scene
    );
    bottomBorder.position = this.framePosition.clone();
    bottomBorder.position.y -= frameHeight / 2;

    // Left border
    const leftBorder = MeshBuilder.CreateBox(
      'frameLeft',
      { width: borderThickness, height: frameHeight, depth: borderDepth },
      this.scene
    );
    leftBorder.position = this.framePosition.clone();
    leftBorder.position.x -= frameWidth / 2;

    // Right border
    const rightBorder = MeshBuilder.CreateBox(
      'frameRight',
      { width: borderThickness, height: frameHeight, depth: borderDepth },
      this.scene
    );
    rightBorder.position = this.framePosition.clone();
    rightBorder.position.x += frameWidth / 2;

    // Create glowing material for frame
    const cfg = FRAME_GLOW_CONFIG;
    this.frameMaterial = new StandardMaterial('frameMaterial', this.scene);
    this.frameMaterial.diffuseColor = new Color3(cfg.diffuseColor.r, cfg.diffuseColor.g, cfg.diffuseColor.b);
    this.frameMaterial.emissiveColor = new Color3(
      cfg.emissiveColor.r * cfg.emissiveIntensity,
      cfg.emissiveColor.g * cfg.emissiveIntensity,
      cfg.emissiveColor.b * cfg.emissiveIntensity
    );
    this.frameMaterial.specularColor = new Color3(cfg.specularColor.r, cfg.specularColor.g, cfg.specularColor.b);
    this.frameMaterial.specularPower = cfg.specularPower;

    topBorder.material = this.frameMaterial;
    bottomBorder.material = this.frameMaterial;
    leftBorder.material = this.frameMaterial;
    rightBorder.material = this.frameMaterial;

    // Merge borders into single mesh for performance
    this.frameMesh = Mesh.MergeMeshes(
      [topBorder, bottomBorder, leftBorder, rightBorder],
      true,
      true,
      undefined,
      false,
      true
    ) as Mesh;

    if (this.frameMesh) {
      this.frameMesh.name = 'pictureFrame';
    }
  }

  /**
   * Create slot meshes in grid layout
   */
  private createSlotMeshes(tileCount: number): void {
    const slotMaterial = new StandardMaterial('slotMaterial', this.scene);
    slotMaterial.diffuseColor = new Color3(0.2, 0.2, 0.3); // Dark blue-grey
    slotMaterial.alpha = 0.3; // Semi-transparent
    slotMaterial.backFaceCulling = false;

    const highlightMaterial = new StandardMaterial('slotHighlightMaterial', this.scene);
    highlightMaterial.diffuseColor = new Color3(0.3, 0.8, 0.3); // Green for valid placement
    highlightMaterial.alpha = 0.5;
    highlightMaterial.backFaceCulling = false;

    const errorMaterial = new StandardMaterial('slotErrorMaterial', this.scene);
    errorMaterial.diffuseColor = new Color3(0.8, 0.3, 0.3); // Red for invalid placement
    errorMaterial.alpha = 0.5;
    errorMaterial.backFaceCulling = false;

    // Half-filled material (phase 1 complete, waiting for phase 2)
    const halfFilledMaterial = new StandardMaterial('slotHalfFilledMaterial', this.scene);
    halfFilledMaterial.diffuseColor = new Color3(0.4, 0.6, 0.3); // Muted green
    halfFilledMaterial.alpha = 0.6; // Slightly more opaque
    halfFilledMaterial.backFaceCulling = false;

    // Calculate starting position (top-left corner of grid)
    const horizontalSpacing = Math.max(0, this.gridWidth - 1) * this.slotSpacing;
    const verticalSpacing = Math.max(0, this.gridHeight - 1) * this.slotSpacing;
    const slotAreaWidth = this.gridWidth * this.slotSize + horizontalSpacing;
    const slotAreaHeight = this.gridHeight * this.slotSize + verticalSpacing;
    const startX = this.framePosition.x - slotAreaWidth / 2 + this.slotSize / 2;
    const startY = this.framePosition.y + slotAreaHeight / 2 - this.slotSize / 2;

    // Create slot meshes
    for (let i = 0; i < tileCount; i++) {
      const row = Math.floor(i / this.gridWidth);
      const col = i % this.gridWidth;

      const slot = MeshBuilder.CreatePlane(
        `frameSlot_${i}`,
        { width: this.slotSize, height: this.slotSize },
        this.scene
      );

      slot.position = new Vector3(
        startX + col * (this.slotSize + this.slotSpacing),
        startY - row * (this.slotSize + this.slotSpacing),
        this.framePosition.z
      );

      slot.material = slotMaterial;
      slot.metadata = {
        slotIndex: i,
        isFrameSlot: true,
        isEmpty: true,
        fillState: 0, // 0 = empty, 1 = half, 2 = complete
        defaultMaterial: slotMaterial,
        highlightMaterial: highlightMaterial,
        errorMaterial: errorMaterial,
        halfFilledMaterial: halfFilledMaterial,
      };

      this.slotMeshes.push(slot);
    }
  }

  /**
   * Create focused lighting on the frame to make tiles brighter (front + back)
   */
  private createFrameLighting(): void {
    const lightDistance = 20; // Distance from frame
    const lightIntensity = 1.5;
    const lightAngle = Math.PI / 1.5; // Wide angle to cover frame

    // FRONT light - positioned in front of frame (negative Z), pointing at frame
    const frontLightPos = new Vector3(
      this.framePosition.x,
      this.framePosition.y,
      this.framePosition.z - lightDistance
    );
    const frontDirection = new Vector3(0, 0, 1); // Pointing towards +Z (at the frame)

    const frontLight = new SpotLight(
      'frameFrontLight',
      frontLightPos,
      frontDirection,
      lightAngle,
      2,
      this.scene
    );
    frontLight.intensity = lightIntensity;
    frontLight.diffuse = new Color3(1.0, 0.98, 0.95); // Warm white
    frontLight.specular = new Color3(0.1, 0.1, 0.1);
    this.spotLights.push(frontLight);

    // BACK light - positioned behind frame (positive Z), pointing at frame
    const backLightPos = new Vector3(
      this.framePosition.x,
      this.framePosition.y,
      this.framePosition.z + lightDistance
    );
    const backDirection = new Vector3(0, 0, -1); // Pointing towards -Z (at the frame)

    const backLight = new SpotLight(
      'frameBackLight',
      backLightPos,
      backDirection,
      lightAngle,
      2,
      this.scene
    );
    backLight.intensity = lightIntensity;
    backLight.diffuse = new Color3(1.0, 0.98, 0.95); // Warm white
    backLight.specular = new Color3(0.1, 0.1, 0.1);
    this.spotLights.push(backLight);

    console.log('[FRAME] Created front + back lights for frame illumination');
  }

  /**
   * Enable shadow casting for the frame
   */
  enableShadowCasting(shadowGenerator: ShadowGenerator): void {
    if (this.frameMesh) {
      shadowGenerator.addShadowCaster(this.frameMesh);
    }
  }

  /**
   * Enable glow effect on the frame border (OPTIONAL - glow layer may be disabled)
   * @param glowLayer The scene's glow layer
   */
  enableGlow(glowLayer: GlowLayer | null): void {
    if (!glowLayer || !this.frameMesh || !this.frameMaterial) {
      // Glow layer disabled, just use pulsing animation on emissive color
      this.createPulseAnimation();
      console.log('[FRAME] Frame pulsing animation enabled (glow layer disabled)');
      return;
    }

    this.glowLayer = glowLayer;

    // CRITICAL: Only make the frame mesh glow, exclude everything else
    // This prevents the cyan wash over the entire scene
    this.glowLayer.addIncludedOnlyMesh(this.frameMesh);

    // Don't use customEmissiveColorSelector - let each mesh use its own material emissive color
    // This allows player wireframes to use their unique colors

    // Create pulsing animation for the emissive intensity
    this.createPulseAnimation();

    console.log('[FRAME] Glow effect enabled (using material emissive colors)');
  }

  /**
   * Create pulsing animation for the frame glow
   */
  private createPulseAnimation(): void {
    if (!this.frameMaterial) return;

    const cfg = FRAME_GLOW_CONFIG;
    const baseEmissive = new Color3(
      cfg.emissiveColor.r * cfg.emissiveIntensity,
      cfg.emissiveColor.g * cfg.emissiveIntensity,
      cfg.emissiveColor.b * cfg.emissiveIntensity
    );

    // Create animation for emissive color intensity
    const pulseAnimation = new Animation(
      'framePulse',
      'emissiveColor',
      60, // 60 FPS
      Animation.ANIMATIONTYPE_COLOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );

    const framesPerSecond = 60;
    const totalFrames = Math.floor(cfg.pulseSpeed * framesPerSecond);

    // Create keyframes for smooth pulsing
    const keys = [];

    // Start at max
    keys.push({
      frame: 0,
      value: new Color3(
        baseEmissive.r * cfg.pulseMax,
        baseEmissive.g * cfg.pulseMax,
        baseEmissive.b * cfg.pulseMax
      )
    });

    // Fade to min
    keys.push({
      frame: totalFrames / 2,
      value: new Color3(
        baseEmissive.r * cfg.pulseMin,
        baseEmissive.g * cfg.pulseMin,
        baseEmissive.b * cfg.pulseMin
      )
    });

    // Back to max
    keys.push({
      frame: totalFrames,
      value: new Color3(
        baseEmissive.r * cfg.pulseMax,
        baseEmissive.g * cfg.pulseMax,
        baseEmissive.b * cfg.pulseMax
      )
    });

    pulseAnimation.setKeys(keys);

    // Apply animation to material
    this.frameMaterial.animations = [pulseAnimation];
    this.scene.beginAnimation(this.frameMaterial, 0, totalFrames, true);
  }

  /**
   * Get slot position for tile placement
   */
  getSlotPosition(slotIndex: number): Vector3 | null {
    if (slotIndex < 0 || slotIndex >= this.slotMeshes.length) {
      return null;
    }
    return this.slotMeshes[slotIndex].position.clone();
  }

  /**
   * Get slot mesh by index
   */
  getSlotMesh(slotIndex: number): Mesh | null {
    if (slotIndex < 0 || slotIndex >= this.slotMeshes.length) {
      return null;
    }
    return this.slotMeshes[slotIndex];
  }

  /**
   * Highlight slot (green for valid, red for invalid)
   */
  highlightSlot(slotIndex: number, isValid: boolean): void {
    const slot = this.getSlotMesh(slotIndex);
    if (!slot || !slot.metadata) return;

    if (isValid) {
      slot.material = slot.metadata.highlightMaterial;
    } else {
      slot.material = slot.metadata.errorMaterial;
    }
  }

  /**
   * Clear slot highlight (return to default)
   */
  clearHighlight(slotIndex: number): void {
    const slot = this.getSlotMesh(slotIndex);
    if (!slot || !slot.metadata) return;

    slot.material = slot.metadata.defaultMaterial;
  }

  /**
   * Mark slot as half-filled (phase 1 complete, waiting for phase 2)
   * Shows slot with different color to indicate partial completion
   */
  setSlotHalf(slotIndex: number): void {
    const slot = this.getSlotMesh(slotIndex);
    if (!slot || !slot.metadata) return;

    slot.material = slot.metadata.halfFilledMaterial;
    slot.metadata.fillState = 1;
    slot.metadata.isEmpty = false;
    slot.isVisible = true; // Keep visible with half-filled color
  }

  /**
   * Mark slot as fully filled (both phases complete, hide slot mesh)
   */
  fillSlot(slotIndex: number): void {
    const slot = this.getSlotMesh(slotIndex);
    if (!slot) return;

    slot.isVisible = false;
    if (slot.metadata) {
      slot.metadata.isEmpty = false;
      slot.metadata.fillState = 2;
    }
  }

  /**
   * Update slot fill state from server state
   * @param slotIndex Slot index
   * @param fillState 0 = empty, 1 = half, 2 = complete
   */
  updateSlotFillState(slotIndex: number, fillState: number): void {
    if (fillState === 0) {
      // Reset to empty (shouldn't normally happen)
      this.clearHighlight(slotIndex);
      const slot = this.getSlotMesh(slotIndex);
      if (slot && slot.metadata) {
        slot.isVisible = true;
        slot.metadata.isEmpty = true;
        slot.metadata.fillState = 0;
      }
    } else if (fillState === 1) {
      this.setSlotHalf(slotIndex);
    } else if (fillState === 2) {
      this.fillSlot(slotIndex);
    }
  }

  /**
   * Get all slot meshes (for raycasting)
   */
  getSlotMeshes(): Mesh[] {
    return this.slotMeshes;
  }

  /**
   * Dispose frame and all slot meshes
   */
  dispose(): void {
    // Stop animations
    if (this.frameMaterial) {
      this.scene.stopAnimation(this.frameMaterial);
      this.frameMaterial.dispose();
      this.frameMaterial = null;
    }

    // Dispose spotlights
    this.spotLights.forEach((light) => {
      light.dispose();
    });
    this.spotLights = [];

    if (this.frameMesh) {
      this.frameMesh.dispose();
      this.frameMesh = null;
    }

    this.slotMeshes.forEach((slot) => {
      slot.dispose();
    });
    this.slotMeshes = [];

    this.glowLayer = null;
  }
}
