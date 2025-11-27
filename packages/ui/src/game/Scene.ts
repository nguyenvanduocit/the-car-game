import {
  Engine,
  Scene,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color3,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  Quaternion,
  Texture,
} from '@babylonjs/core';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { AdvancedDynamicTexture, TextBlock, Control, StackPanel } from '@babylonjs/gui';
import { GameCamera } from './Camera';
import { Floor } from './Floor';
import { Physics } from './Physics';
import { GameSound } from './Sound';
import { Scoreboard } from './Scoreboard';
import { CompassGUI } from '../gui/CompassGUI';
import { RAMP_DESCRIPTORS, ARCH_DESCRIPTORS, GOAL_TRIGGER_DESCRIPTORS } from '@blockgame/shared';

/**
 * Futuristic galaxy lighting - space environment with neon accents
 */
const LIGHTING_CONFIG = {
  // Hemispheric light (ambient with cool blue tint)
  hemispheric: {
    intensity: 0.7,
    diffuse: { r: 0.8, g: 0.85, b: 1.0 }, // Cool blue-white
    specular: { r: 0.2, g: 0.2, b: 0.3 },
    groundColor: { r: 0.2, g: 0.15, b: 0.3 }, // Purple ground reflection
  },
  // Directional light (starlight)
  directional: {
    direction: { x: -1, y: -2, z: -1 },
    position: { x: 20, y: 40, z: 20 },
    intensity: 0.9,
    diffuse: { r: 0.95, g: 0.95, b: 1.0 }, // Cool white
    specular: { r: 0.4, g: 0.4, b: 0.5 },
    shadowMapSize: 512,
    shadowDarkness: 0.5,
    shadowBlurKernel: 8,
  },
  // Scene environment
  scene: {
    clearColor: { r: 0.02, g: 0.02, b: 0.05 }, // Deep space
    ambientColor: { r: 0.15, g: 0.15, b: 0.25 }, // Dark blue ambient
  },
  // ENV space skybox (prefiltered for best performance)
  sky: {
    enabled: true,
    size: 1000,
    envUrl: '/skybox/qwantani_night_puresky_2k.env', // Prefiltered ENV from Poly Haven
    level: 0.3, // Darker night sky
    rotationSpeed: 0.0005, // Radians per frame (~0.03 deg/frame, full rotation in ~3.5 min)
  },
  // Post-processing (disabled for performance)
  postProcessing: {
    fxaaEnabled: false,
    imageProcessingEnabled: false,
    contrast: 1.0,
    exposure: 1.0,
    toneMappingEnabled: false,
    bloomEnabled: false,
    bloomThreshold: 0.7,
    bloomWeight: 0.3,
    bloomKernel: 64,
    bloomScale: 0.5,
  },
} as const;

import type { NetworkStats } from '../network/ColyseusClient';

/**
 * Performance monitoring system
 */
class PerformanceMonitor {
  private engine: Engine;
  private scene: Scene;
  private guiTexture: AdvancedDynamicTexture;
  private instrumentation: SceneInstrumentation;
  private enabled: boolean = false;
  private overlayVisible: boolean = false;
  private updateInterval: number = 500; // ms
  private lastUpdateTime: number = 0;
  private debugPanel: StackPanel | null = null;
  private debugText: TextBlock | null = null;
  private history: string[] = [];
  private networkStatsProvider: (() => NetworkStats) | null = null;
  private lastBytesSent: number = 0;
  private lastBytesReceived: number = 0;
  private lastStatsTime: number = 0;
  private metrics: {
    fps: number;
    drawCalls: number;
    activeMeshes: number;
    totalMeshes: number;
    memoryMB: number;
    frameTime: number;
    latency: number;
    bandwidthUp: number;   // KB/s
    bandwidthDown: number; // KB/s
  } = {
      fps: 0,
      drawCalls: 0,
      activeMeshes: 0,
      totalMeshes: 0,
      memoryMB: 0,
      frameTime: 0,
      latency: 0,
      bandwidthUp: 0,
      bandwidthDown: 0,
    };

  constructor(engine: Engine, scene: Scene, guiTexture: AdvancedDynamicTexture) {
    this.engine = engine;
    this.scene = scene;
    this.guiTexture = guiTexture;

    // Initialize scene instrumentation for detailed metrics
    // Note: captureFrameTime disabled by default for +1-2ms performance gain
    this.instrumentation = new SceneInstrumentation(scene);
    this.instrumentation.captureFrameTime = false;
    this.instrumentation.captureActiveMeshesEvaluationTime = false;
    this.instrumentation.captureRenderTime = false;

    // Setup input for toggling overlay
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3') {
        this.toggleOverlay();
      }
      if (e.key === 'F4') {
        this.exportCSV();
      }
    });
  }

  enable(): void {
    this.enabled = true;
    console.log('[PERF] Performance monitoring enabled. Press F3 for overlay, F4 to export CSV.');
  }

  disable(): void {
    this.enabled = false;
    this.hideOverlay();
  }

  /**
   * Set network stats provider (called after Colyseus connection)
   */
  setNetworkStatsProvider(provider: () => NetworkStats): void {
    this.networkStatsProvider = provider;
    this.lastStatsTime = Date.now();
  }

  toggleOverlay(): void {
    if (this.overlayVisible) {
      this.hideOverlay();
    } else {
      this.showOverlay();
    }
  }

  private showOverlay(): void {
    if (this.debugPanel) return;

    this.debugPanel = new StackPanel();
    this.debugPanel.width = "320px";
    this.debugPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.debugPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.debugPanel.paddingTop = "10px";
    this.debugPanel.paddingRight = "10px";
    this.debugPanel.isHitTestVisible = false;

    const bg = new TextBlock();
    bg.text = "Performance Monitor";
    bg.height = "30px";
    bg.color = "white";
    bg.fontSize = 16;
    bg.fontFamily = "monospace";
    this.debugPanel.addControl(bg);

    this.debugText = new TextBlock();
    this.debugText.height = "220px";
    this.debugText.color = "#00FF00";
    this.debugText.fontSize = 14;
    this.debugText.fontFamily = "monospace";
    this.debugText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.debugText.resizeToFit = true;
    this.debugPanel.addControl(this.debugText);

    this.guiTexture.addControl(this.debugPanel);
    this.overlayVisible = true;
  }

  private hideOverlay(): void {
    if (this.debugPanel) {
      this.guiTexture.removeControl(this.debugPanel);
      this.debugPanel.dispose();
      this.debugPanel = null;
      this.debugText = null;
    }
    this.overlayVisible = false;
  }

  update(): void {
    if (!this.enabled) return;

    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateInterval) return;

    this.lastUpdateTime = now;

    // Collect metrics
    this.metrics.fps = Math.round(this.engine.getFps());
    this.metrics.activeMeshes = this.scene.getActiveMeshes().length;
    this.metrics.totalMeshes = this.scene.meshes.length;
    this.metrics.frameTime = this.instrumentation.frameTimeCounter.lastSecAverage;

    // Get draw calls from instrumentation if available
    this.metrics.drawCalls = this.instrumentation.drawCallsCounter.current;

    // Estimate memory usage
    if (performance && (performance as any).memory) {
      const memInfo = (performance as any).memory;
      this.metrics.memoryMB = Math.round(memInfo.usedJSHeapSize / 1024 / 1024);
    }

    // Collect network stats if provider is set
    if (this.networkStatsProvider) {
      const stats = this.networkStatsProvider();
      this.metrics.latency = stats.latency;

      // Calculate bandwidth (bytes/sec -> KB/s)
      const timeDelta = (now - this.lastStatsTime) / 1000;
      if (timeDelta > 0) {
        this.metrics.bandwidthUp = (stats.bytesSent - this.lastBytesSent) / timeDelta / 1024;
        this.metrics.bandwidthDown = (stats.bytesReceived - this.lastBytesReceived) / timeDelta / 1024;
        this.lastBytesSent = stats.bytesSent;
        this.lastBytesReceived = stats.bytesReceived;
        this.lastStatsTime = now;
      }
    }

    // Record history
    this.history.push(`${now},${this.metrics.fps},${this.metrics.drawCalls},${this.metrics.activeMeshes},${this.metrics.memoryMB},${this.metrics.latency}`);
    if (this.history.length > 3600) {
      this.history.shift();
    }

    // Update Overlay
    if (this.overlayVisible && this.debugText) {
      let text =
        `FPS: ${this.metrics.fps}\n` +
        `Draw Calls: ${this.metrics.drawCalls}\n` +
        `Active Meshes: ${this.metrics.activeMeshes}/${this.metrics.totalMeshes}\n` +
        `Frame Time: ${this.metrics.frameTime.toFixed(2)} ms\n` +
        `Memory: ${this.metrics.memoryMB} MB\n`;

      // Add network stats if available
      if (this.networkStatsProvider) {
        text +=
          `───────────────────\n` +
          `Latency: ${this.metrics.latency} ms\n` +
          `↑ ${this.metrics.bandwidthUp.toFixed(1)} KB/s\n` +
          `↓ ${this.metrics.bandwidthDown.toFixed(1)} KB/s\n`;
      }

      text += `[F3] Toggle | [F4] Export`;
      this.debugText.text = text;
    }
  }

  exportCSV(): void {
    const header = "Timestamp,FPS,DrawCalls,ActiveMeshes,MemoryMB,LatencyMs";
    const csvContent = [header, ...this.history].join("\n");
    console.log("[PERF] Performance Data Export:");
    console.log(csvContent);

    // In a real browser environment, we could trigger a download
    // For now, logging to console is sufficient for the agent to read if needed
    alert("Performance data logged to console!");
  }

  getMetrics() {
    return { ...this.metrics };
  }

  dispose(): void {
    this.instrumentation.dispose();
    this.hideOverlay();
  }
}

/**
 * Initialize BabylonJS scene with basic setup
 */
export class GameScene {
  private engine: Engine;
  private scene: Scene;
  private gameCamera: GameCamera;
  private floor: Floor;
  private physics: Physics;
  private physicsInitialized: boolean = false;
  private shadowGenerator: ShadowGenerator | null = null;
  private guiTexture: AdvancedDynamicTexture;
  private renderingPipeline: DefaultRenderingPipeline | null = null;
  private sound: GameSound;
  private scoreboard: Scoreboard;
  private performanceMonitor: PerformanceMonitor;
  private compass: CompassGUI;
  private skybox: Mesh | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // Create engine with audio enabled
    this.engine = new Engine(canvas, true, {
      audioEngine: true, // Explicitly enable audio
    }, true);

    // Create scene
    this.scene = new Scene(this.engine);

    // Performance: disable shadows
    this.scene.shadowsEnabled = false;

    // Create camera (first-person)
    this.gameCamera = new GameCamera(this.scene, canvas);

    // Setup enhanced lighting
    this.setupLighting();

    // Create floor
    this.floor = new Floor(this.scene);

    // Create ramps for jumping
    this.createRamps();

    // Create goal arches for soccer gameplay
    this.createArches();

    // Create goal trigger plane visualizations (for debugging)
    this.createGoalTriggers();

    // Create scoreboard
    this.scoreboard = new Scoreboard(this.scene);

    // Initialize physics system
    this.physics = new Physics(this.scene);

    // Initialize sound system
    this.sound = new GameSound(this.scene);

    // Setup audio unlock on user interaction (required by browsers)
    this.setupAudioUnlock(canvas);

    // Create GUI texture for UI overlays (puzzles, dialogs, etc.)
    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI('UI', true, this.scene);
    // Set ideal width for consistent scaling on high-DPI (Retina) displays
    this.guiTexture.idealWidth = 1920;

    // Create compass GUI
    this.compass = new CompassGUI(this.guiTexture);

    // Initialize performance monitor
    this.performanceMonitor = new PerformanceMonitor(this.engine, this.scene, this.guiTexture);
    // Enable by default for optimization testing
    this.performanceMonitor.enable();

    // Start render loop
    this.engine.runRenderLoop(() => {
      this.scene.render();
      this.performanceMonitor.update();

      // Rotate skybox slowly for moving galaxy effect
      if (this.skybox) {
        this.skybox.rotation.y += LIGHTING_CONFIG.sky.rotationSpeed;
      }

      // Update compass with camera rotation and player position
      const playerPos = this.gameCamera.getPlayerPosition();
      this.compass.update(this.gameCamera.getRotation(), playerPos.x, playerPos.z);
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  /**
   * Setup balanced lighting - basic lights + subtle effects
   */
  private setupLighting(): void {
    const cfg = LIGHTING_CONFIG;

    // 1. Hemispheric light for ambient illumination
    const hemisphericLight = new HemisphericLight(
      'hemisphericLight',
      new Vector3(0, 1, 0),
      this.scene
    );
    hemisphericLight.intensity = cfg.hemispheric.intensity;
    hemisphericLight.diffuse = new Color3(cfg.hemispheric.diffuse.r, cfg.hemispheric.diffuse.g, cfg.hemispheric.diffuse.b);
    hemisphericLight.specular = new Color3(cfg.hemispheric.specular.r, cfg.hemispheric.specular.g, cfg.hemispheric.specular.b);
    hemisphericLight.groundColor = new Color3(cfg.hemispheric.groundColor.r, cfg.hemispheric.groundColor.g, cfg.hemispheric.groundColor.b);

    // 2. Directional light for shadows and depth
    const directionalLight = new DirectionalLight(
      'directionalLight',
      new Vector3(cfg.directional.direction.x, cfg.directional.direction.y, cfg.directional.direction.z),
      this.scene
    );
    directionalLight.position = new Vector3(cfg.directional.position.x, cfg.directional.position.y, cfg.directional.position.z);
    directionalLight.intensity = cfg.directional.intensity;
    directionalLight.diffuse = new Color3(cfg.directional.diffuse.r, cfg.directional.diffuse.g, cfg.directional.diffuse.b);
    directionalLight.specular = new Color3(cfg.directional.specular.r, cfg.directional.specular.g, cfg.directional.specular.b);

    // Setup shadow generator with optimized settings for better performance
    this.shadowGenerator = new ShadowGenerator(cfg.directional.shadowMapSize, directionalLight);
    // Use Poisson sampling instead of blur exponential for better performance
    this.shadowGenerator.usePoissonSampling = true;
    this.shadowGenerator.darkness = cfg.directional.shadowDarkness;

    // 3. Setup space/galaxy skybox
    this.setupSpaceSky();

    // 4. Setup post-processing (disabled for performance)
    this.setupPostProcessing();

    // Scene colors
    this.scene.clearColor = new Color3(cfg.scene.clearColor.r, cfg.scene.clearColor.g, cfg.scene.clearColor.b).toColor4();
    this.scene.ambientColor = new Color3(cfg.scene.ambientColor.r, cfg.scene.ambientColor.g, cfg.scene.ambientColor.b);

    console.log('[SCENE] Lighting setup complete (2 lights + space skybox)');
  }

  /**
   * Setup space/galaxy skybox with prefiltered ENV texture - best performance
   */
  private setupSpaceSky(): void {
    const cfg = LIGHTING_CONFIG.sky;

    if (!cfg.enabled) {
      return;
    }

    // Create skybox mesh
    this.skybox = MeshBuilder.CreateBox('skybox', { size: cfg.size }, this.scene);
    this.skybox.infiniteDistance = true;

    // Create material for skybox
    const skyMaterial = new StandardMaterial('skyMaterial', this.scene);
    skyMaterial.backFaceCulling = false;
    skyMaterial.disableLighting = true;

    // Load prefiltered ENV texture (faster than HDR - no runtime processing)
    const envTexture = CubeTexture.CreateFromPrefilteredData(cfg.envUrl, this.scene);
    envTexture.level = cfg.level;
    envTexture.coordinatesMode = Texture.SKYBOX_MODE;

    skyMaterial.reflectionTexture = envTexture;
    this.skybox.material = skyMaterial;

    // Also set as environment texture for PBR materials (reflections)
    this.scene.environmentTexture = envTexture;

    console.log('[SCENE] ENV skybox loaded from:', cfg.envUrl, '(rotating at', cfg.rotationSpeed, 'rad/frame)');
  }

  /**
   * Setup post-processing for futuristic galaxy look
   */
  private setupPostProcessing(): void {
    const cfg = LIGHTING_CONFIG.postProcessing;

    this.renderingPipeline = new DefaultRenderingPipeline(
      'defaultPipeline',
      true, // HDR enabled
      this.scene,
      [this.gameCamera.getCamera()]
    );

    // FXAA for anti-aliasing
    this.renderingPipeline.fxaaEnabled = cfg.fxaaEnabled;

    // Image processing for bright futuristic look
    this.renderingPipeline.imageProcessingEnabled = cfg.imageProcessingEnabled;
    if (cfg.imageProcessingEnabled && this.renderingPipeline.imageProcessing) {
      this.renderingPipeline.imageProcessing.contrast = cfg.contrast;
      this.renderingPipeline.imageProcessing.exposure = cfg.exposure;
      this.renderingPipeline.imageProcessing.toneMappingEnabled = cfg.toneMappingEnabled;
    }

    // Bloom for futuristic glow effects
    if (cfg.bloomEnabled) {
      this.renderingPipeline.bloomEnabled = true;
      this.renderingPipeline.bloomThreshold = cfg.bloomThreshold;
      this.renderingPipeline.bloomWeight = cfg.bloomWeight;
      this.renderingPipeline.bloomKernel = cfg.bloomKernel;
      this.renderingPipeline.bloomScale = cfg.bloomScale;
    }

    console.log('[SCENE] Post-processing pipeline created (bloom + exposure boost for galaxy look)');
  }

  /**
   * Create ramps for jumping/launching
   */
  private createRamps(): void {
    for (const ramp of RAMP_DESCRIPTORS) {
      // Create box mesh for ramp
      const rampMesh = MeshBuilder.CreateBox(
        `ramp_${ramp.name}`,
        {
          width: ramp.size.width,
          height: ramp.size.height,
          depth: ramp.size.depth,
        },
        this.scene
      );

      // Position ramp
      rampMesh.position = new Vector3(ramp.position.x, ramp.position.y, ramp.position.z);

      // Rotate ramp to create slope (around X axis)
      rampMesh.rotationQuaternion = Quaternion.RotationAxis(
        new Vector3(1, 0, 0),
        ramp.rotationX
      );

      // Create material for ramp - blue for west, red for east
      const rampMaterial = new StandardMaterial(`ramp_material_${ramp.name}`, this.scene);
      const isBlueRamp = ramp.name === 'ramp_west';
      if (isBlueRamp) {
        rampMaterial.diffuseColor = new Color3(0.3, 0.7, 1.0); // Neon blue
        rampMaterial.specularColor = new Color3(0.5, 0.8, 1.0);
        rampMaterial.emissiveColor = new Color3(0.2, 0.5, 0.8); // Blue emissive
      } else {
        rampMaterial.diffuseColor = new Color3(1.0, 0.3, 0.4); // Neon red
        rampMaterial.specularColor = new Color3(1.0, 0.5, 0.5);
        rampMaterial.emissiveColor = new Color3(0.8, 0.2, 0.25); // Red emissive
      }
      rampMesh.material = rampMaterial;
    }

    console.log(`[SCENE] Created ${RAMP_DESCRIPTORS.length} ramp meshes`);
  }

  /**
   * Create goal arches for soccer-style gameplay
   */
  private createArches(): void {
    for (const arch of ARCH_DESCRIPTORS) {
      // Determine goal color (neon blue or neon red for futuristic look)
      const isBlueGoal = arch.name === 'blue_goal';
      const goalColor = isBlueGoal
        ? new Color3(0.3, 0.7, 1.0) // Bright neon blue
        : new Color3(1.0, 0.3, 0.4); // Bright neon red
      const goalGlow = isBlueGoal
        ? new Color3(0.2, 0.5, 0.8) // Strong blue emissive
        : new Color3(0.8, 0.2, 0.25); // Strong red emissive

      // Create left post
      const leftPost = MeshBuilder.CreateCylinder(
        `${arch.name}_left_post`,
        {
          height: arch.height,
          diameter: arch.postRadius * 2,
        },
        this.scene
      );
      leftPost.position = new Vector3(
        arch.position.x - arch.width / 2,
        arch.position.y + arch.height / 2,
        arch.position.z
      );

      // Create right post
      const rightPost = MeshBuilder.CreateCylinder(
        `${arch.name}_right_post`,
        {
          height: arch.height,
          diameter: arch.postRadius * 2,
        },
        this.scene
      );
      rightPost.position = new Vector3(
        arch.position.x + arch.width / 2,
        arch.position.y + arch.height / 2,
        arch.position.z
      );

      // Create crossbar (rotated cylinder)
      const crossbar = MeshBuilder.CreateCylinder(
        `${arch.name}_crossbar`,
        {
          height: arch.width,
          diameter: arch.crossbarRadius * 2,
        },
        this.scene
      );
      crossbar.position = new Vector3(
        arch.position.x,
        arch.position.y + arch.height,
        arch.position.z
      );
      // Rotate 90 degrees around Z axis to make it horizontal
      crossbar.rotationQuaternion = Quaternion.RotationAxis(
        new Vector3(0, 0, 1),
        Math.PI / 2
      );

      // Create material for goal with neon glow
      const goalMaterial = new StandardMaterial(`goal_material_${arch.name}`, this.scene);
      goalMaterial.diffuseColor = goalColor;
      goalMaterial.specularColor = goalColor.scale(0.6);
      goalMaterial.emissiveColor = goalGlow; // Glow for bloom effect

      leftPost.material = goalMaterial;
      rightPost.material = goalMaterial;
      crossbar.material = goalMaterial;
    }

    console.log(`[SCENE] Created ${ARCH_DESCRIPTORS.length} goal arch meshes (neon glow)`);
  }

  /**
   * Create goal trigger plane visualizations for debugging
   * Shows semi-transparent planes at goal trigger locations
   */
  private createGoalTriggers(): void {
    for (const trigger of GOAL_TRIGGER_DESCRIPTORS) {
      // Determine goal color based on trigger name
      const isBlueGoal = trigger.name === 'blue_goal_trigger';
      const goalColor = isBlueGoal
        ? new Color3(0.2, 0.5, 1.0) // Blue
        : new Color3(1.0, 0.2, 0.2); // Red

      // Create thin box mesh for trigger visualization
      const triggerMesh = MeshBuilder.CreateBox(
        trigger.name,
        {
          width: trigger.size.width,
          height: trigger.size.height,
          depth: trigger.size.depth,
        },
        this.scene
      );

      // Position the trigger mesh
      triggerMesh.position = new Vector3(
        trigger.position.x,
        trigger.position.y,
        trigger.position.z
      );

      // Create semi-transparent material
      const triggerMaterial = new StandardMaterial(`trigger_material_${trigger.name}`, this.scene);
      triggerMaterial.diffuseColor = goalColor;
      triggerMaterial.alpha = 0.2; // Very transparent (20% opacity)
      triggerMaterial.emissiveColor = new Color3(0, 0, 0); // No glow

      triggerMesh.material = triggerMaterial;

      // Make trigger mesh non-collidable (visual only)
      triggerMesh.isPickable = false;

      console.log(`[SCENE] Created trigger visualization for ${trigger.name}`);
    }

    console.log(`[SCENE] Created ${GOAL_TRIGGER_DESCRIPTORS.length} goal trigger visualizations`);
  }

  /**
   * Get shadow generator for adding shadow casters
   */
  getShadowGenerator(): ShadowGenerator | null {
    return this.shadowGenerator;
  }

  /**
   * Initialize physics stub (async, for compatibility)
   * Client doesn't run physics - server is authoritative
   */
  async initializePhysics(): Promise<void> {
    if (this.physicsInitialized) {
      console.warn('[SCENE] Physics already initialized (stub)');
      return;
    }

    try {
      await this.physics.initialize();
      this.physicsInitialized = true;

      console.log('[SCENE] Physics stub initialized (client is render-only, server-authoritative)');
    } catch (error) {
      console.error('[SCENE] Failed to initialize physics stub:', error);
      throw error;
    }
  }

  /**
   * Get the BabylonJS scene
   */
  getScene(): Scene {
    return this.scene;
  }

  /**
   * Get the game camera
   */
  getCamera(): GameCamera {
    return this.gameCamera;
  }

  /**
   * Get the floor
   */
  getFloor(): Floor {
    return this.floor;
  }

  /**
   * Get the physics system
   */
  getPhysics(): Physics {
    return this.physics;
  }

  /**
   * Check if physics is initialized
   */
  isPhysicsInitialized(): boolean {
    return this.physicsInitialized;
  }

  /**
   * Get GUI texture for UI overlays
   */
  getGUITexture(): AdvancedDynamicTexture {
    return this.guiTexture;
  }

  /**
   * Get glow layer for adding glowing effects (disabled for performance)
   */
  getGlowLayer(): null {
    return null;
  }

  /**
   * Get sound system
   */
  getSound(): GameSound {
    return this.sound;
  }

  /**
   * Get scoreboard
   */
  getScoreboard(): Scoreboard {
    return this.scoreboard;
  }

  /**
   * Initialize sound system (async)
   */
  async initializeSound(): Promise<void> {
    try {
      await this.sound.initialize();
      console.log('[SCENE] Sound system initialized');
    } catch (error) {
      console.error('[SCENE] Failed to initialize sound system:', error);
      // Continue without sounds
    }
  }

  /**
   * Setup audio unlock on canvas interaction (required by browser autoplay policies)
   */
  private setupAudioUnlock(canvas: HTMLCanvasElement): void {
    const unlockAudio = () => {
      if (Engine.audioEngine && !Engine.audioEngine.unlocked) {
        console.log('[SCENE] Unlocking audio on user interaction...');
        Engine.audioEngine.unlock();
      }
    };

    // Unlock on canvas click (happens during pointer lock)
    canvas.addEventListener('click', unlockAudio, { once: true });

    // Also unlock on any canvas interaction
    canvas.addEventListener('pointerdown', unlockAudio, { once: true });

    console.log('[SCENE] Audio unlock listeners set up');
  }

  /**
   * Get performance monitor
   */
  getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  /**
   * Dispose scene and engine
   */
  dispose(): void {
    this.performanceMonitor.dispose();
    this.sound.dispose();
    this.renderingPipeline?.dispose();
    this.guiTexture.dispose();
    this.physics.dispose();
    this.floor.dispose();
    this.gameCamera.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
