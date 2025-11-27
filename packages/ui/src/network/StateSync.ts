import { Scene, Vector3, Quaternion, GlowLayer } from '@babylonjs/core';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Room } from 'colyseus.js';
import { getStateCallbacks } from 'colyseus.js';
import { VehicleRenderer } from '../game/Vehicle';
import { TileRenderer } from '../game/Tile';
import { TilePool } from '../game/TilePool';
import { TileMasterMesh } from '../game/TileMasterMesh';
import type { Physics } from '../game/Physics';
import type { GameCamera } from '../game/Camera';
import type { GameSound } from '../game/Sound';
import type { Scoreboard } from '../game/Scoreboard';
import type { Raycast } from '../game/Raycast';
import type { Frame } from '../game/Frame';
import type { DeathCountdownGUI } from '../gui/DeathCountdownGUI';

/**
 * State synchronization manager (SERVER-AUTHORITATIVE)
 * Handles Colyseus room state updates and syncs with BabylonJS scene
 * All entities render server state with client-side interpolation for smoothness
 */
export class StateSync {
  private scene: Scene;
  private room: Room<any>;
  private localSessionId: string;
  private physics: Physics;
  private shadowGenerator: ShadowGenerator | null = null;
  private glowLayer: GlowLayer | null = null;
  private gameCamera: GameCamera | null = null;
  private sound: GameSound | null = null;
  private scoreboard: Scoreboard | null = null;
  private raycast: Raycast | null = null;
  private frame: Frame | null = null;
  private deathCountdownGUI: DeathCountdownGUI | null = null;

  // Cache for slot states received before frame is initialized
  private pendingSlotStates: { halfFilledSlots: number[]; completeSlots: number[] } | null = null;

  // Other players in the scene (excluding local player)
  private players: Map<string, VehicleRenderer> = new Map();

  // Local player renderer (so we can see ourselves in third-person)
  private localPlayer: VehicleRenderer | null = null;

  // Tiles in the scene
  // private tiles: Map<string, TileRenderer> = new Map(); // Replaced by TilePool
  private tilePool: TilePool;

  // Placed tiles in frame (separate from available tiles)
  private placedTileRenderers: Map<number, TileRenderer> = new Map();

  // Interpolation settings
  private lerpFactor = 0.4; // 40% interpolation per frame (remote players)

  // Shadow optimization
  private readonly SHADOW_DISTANCE = 25; // Units
  private shadowCasters: Set<string> = new Set(); // Set of IDs (players/tiles) currently casting shadows
  private shadowUpdateCounter = 0;

  // GC optimization: reusable Vector3 for state listener callbacks
  // Safe to reuse because renderers clone the position in their constructors
  private readonly _tempPosition = new Vector3();

  constructor(scene: Scene, room: Room<any>, physics: Physics) {
    this.scene = scene;
    this.room = room;
    this.localSessionId = room.sessionId;
    this.physics = physics;

    this.tilePool = new TilePool(scene, physics);
    // Prewarm pool with some tiles to avoid initial stutter
    this.tilePool.prewarm(50);

    // Setup state listeners immediately - Colyseus onAdd fires for existing entities
    this.setupStateListeners();

    this.startInterpolationLoop();
  }

  /**
   * Set shadow generator for enabling shadow casting on dynamic objects
   */
  setShadowGenerator(shadowGenerator: ShadowGenerator): void {
    this.shadowGenerator = shadowGenerator;
    this.tilePool.setShadowGenerator(shadowGenerator);
  }

  /**
   * Set glow layer for enabling glow effects on player elements
   */
  setGlowLayer(glowLayer: GlowLayer | null): void {
    this.glowLayer = glowLayer;
  }

  /**
   * Set game camera for player position reconciliation
   */
  setGameCamera(gameCamera: GameCamera): void {
    this.gameCamera = gameCamera;
  }

  /**
   * Set sound system for audio feedback
   */
  setSound(sound: GameSound): void {
    this.sound = sound;
  }

  /**
   * Set scoreboard for goal score updates
   */
  setScoreboard(scoreboard: Scoreboard): void {
    this.scoreboard = scoreboard;

    // Initialize scoreboard with current state values (listen() only fires on changes)
    const blueScore = this.room.state.blueGoalScore ?? 0;
    const redScore = this.room.state.redGoalScore ?? 0;
    this.scoreboard.updateScores(blueScore, redScore);
  }

  /**
   * Set raycast for tile auto-release detection
   */
  setRaycast(raycast: Raycast): void {
    this.raycast = raycast;
  }

  /**
   * Set frame for slot fill state updates
   */
  setFrame(frame: Frame): void {
    this.frame = frame;

    // Apply any pending slot states that arrived before frame was ready
    if (this.pendingSlotStates) {
      for (const slotIndex of this.pendingSlotStates.halfFilledSlots) {
        this.frame.updateSlotFillState(slotIndex, 1);
      }
      for (const slotIndex of this.pendingSlotStates.completeSlots) {
        this.frame.updateSlotFillState(slotIndex, 2);
      }
      this.pendingSlotStates = null;
    }
  }

  /**
   * Set death countdown GUI for respawn countdown display
   */
  setDeathCountdownGUI(gui: DeathCountdownGUI): void {
    this.deathCountdownGUI = gui;
  }

  /**
   * Setup Colyseus state change listeners
   * Uses Colyseus Schema callbacks (onAdd/onRemove/listen) for proper state synchronization
   */
  private setupStateListeners(): void {
    const $ = getStateCallbacks(this.room);


    // Listen for players being added
    $(this.room.state.players).onAdd((player: any, sessionId: string) => {
      // Reuse temp Vector3 (renderers clone immediately, so safe to reuse)
      this._tempPosition.set(player.position.x, player.position.y, player.position.z);

      // Handle local player (SERVER-AUTHORITATIVE)
      // Track server position for reconciliation AND create mesh for rendering
      if (sessionId === this.localSessionId) {

        // Create renderer for local player vehicle (so we can see ourselves)
        this.localPlayer = new VehicleRenderer(
          this.scene,
          sessionId,
          player.displayName,
          this._tempPosition,
          true // isLocal = true (for debugging/identification)
        );

        // Enable shadow casting if shadow generator is available
        if (this.shadowGenerator) {
          this.localPlayer.enableShadowCasting(this.shadowGenerator);
        }

        // Enable glow effect on player elements
        if (this.glowLayer) {
          this.localPlayer.enableGlow(this.glowLayer);
        }

        // Listen to position changes from server
        // Pass raw position object to avoid Vector3 allocation (GC optimization)
        $(player).position.onChange(() => {
          // Update local player mesh target position for interpolation
          // Camera will follow the interpolated mesh position
          if (this.localPlayer) {
            this.localPlayer.updateTargetPosition(player.position);
          }
        });

        // Listen to body rotation changes (now includes Y-rotation from camera)
        $(player).bodyRotation.onChange(() => {
          if (this.localPlayer) {
            this.localPlayer.updateTargetRotation(player.bodyRotation);
          }
        });

        // Listen to steering changes for wheel animation
        $(player).listen('steering', (steering: number) => {
          if (this.localPlayer) {
            this.localPlayer.updateTargetSteering(steering);
          }
        });

        // Listen to health changes for health bar
        $(player).listen('health', (health: number) => {
          if (this.localPlayer) {
            this.localPlayer.updateHealth(health, 100); // maxHealth = 100
          }
        });

        // Listen to isDead changes for visibility (death/respawn)
        $(player).listen('isDead', (isDead: boolean) => {
          if (this.localPlayer) {
            this.localPlayer.setVisible(!isDead);
          }
          // Show/hide death countdown for local player
          if (this.deathCountdownGUI) {
            if (isDead) {
              this.deathCountdownGUI.start();
            } else {
              this.deathCountdownGUI.hide();
            }
          }
        });

        return; // Don't add to players map (we track separately)
      }

      // Create renderer for other player vehicles
      const playerRenderer = new VehicleRenderer(
        this.scene,
        sessionId,
        player.displayName,
        this._tempPosition,
        false // isLocal = false
      );

      // Enable shadow casting if shadow generator is available
      if (this.shadowGenerator) {
        playerRenderer.enableShadowCasting(this.shadowGenerator);
      }

      // Enable glow effect on player elements
      if (this.glowLayer) {
        playerRenderer.enableGlow(this.glowLayer);
      }

      this.players.set(sessionId, playerRenderer);

      // Listen to position changes
      $(player).position.onChange(() => {
        this.updatePlayerPosition(sessionId, player.position);
      });

      // Listen to body rotation changes (now includes Y-rotation from camera)
      $(player).bodyRotation.onChange(() => {
        this.updatePlayerRotation(sessionId, player.bodyRotation);
      });

      // Listen to steering changes for wheel animation
      $(player).listen('steering', (steering: number) => {
        const renderer = this.players.get(sessionId);
        if (renderer) {
          renderer.updateTargetSteering(steering);
        }
      });

      // Listen to health changes for health bar
      $(player).listen('health', (health: number) => {
        const renderer = this.players.get(sessionId);
        if (renderer) {
          renderer.updateHealth(health, 100); // maxHealth = 100
        }
      });

      // Listen to isDead changes for visibility (death/respawn)
      $(player).listen('isDead', (isDead: boolean) => {
        const renderer = this.players.get(sessionId);
        if (renderer) {
          renderer.setVisible(!isDead);
        }
      });
    });

    // Listen for players being removed
    $(this.room.state.players).onRemove((player: any, sessionId: string) => {
      const playerRenderer = this.players.get(sessionId);
      if (playerRenderer) {
        playerRenderer.dispose();
        this.players.delete(sessionId);
      }

      // Also remove local player if it's the local player
      if (sessionId === this.localSessionId && this.localPlayer) {
        this.localPlayer.dispose();
        this.localPlayer = null;
      }
    });

    // Listen for available tiles being added (key is availableId as string)
    // NEW ARCHITECTURE: availableId 0-799, frameSlotIndex = availableId % 400
    $(this.room.state.tiles).onAdd((tile: any, key: string) => {
      const availableId = parseInt(key, 10);
      const frameSlotIndex = tile.frameSlotIndex;

      // Reuse temp Vector3 (pool clones immediately, so safe to reuse)
      this._tempPosition.set(tile.position.x, tile.position.y, tile.position.z);
      const rotation = { x: tile.rotation.x, y: tile.rotation.y, z: tile.rotation.z, w: tile.rotation.w };
      const textureUrl = `/tiles/tile-${frameSlotIndex}.webp`;

      const tileRenderer = this.tilePool.acquire(
        availableId, // Use availableId as key
        this._tempPosition,
        rotation,
        textureUrl
      );

      // Listen to position changes
      $(tile).position.onChange(() => {
        this.updateTilePosition(availableId, tile.position);
      });

      // Listen to rotation changes
      $(tile).rotation.onChange(() => {
        this.updateTileRotation(availableId, tile.rotation);
      });

      // Listen to state changes
      $(tile).listen('state', (currentState: string) => {
        this.updateTileState(availableId, currentState, tile.ownedBy);
      });

      $(tile).listen('ownedBy', (currentOwner: string | null) => {
        this.updateTileState(availableId, tile.state, currentOwner);
      });
    });

    // Listen for available tiles being removed (consumed when puzzle solved)
    $(this.room.state.tiles).onRemove((tile: any, key: string) => {
      const availableId = parseInt(key, 10);
      this.tilePool.release(availableId);
    });

    // Listen for placed tiles being added (tiles in frame)
    // NEW ARCHITECTURE: placedTiles contains tiles visible in the frame
    $(this.room.state.placedTiles).onAdd((placedTile: any, key: string) => {
      const frameSlotIndex = parseInt(key, 10);

      // Update frame slot visual state (tint)
      if (this.frame) {
        this.frame.updateSlotFillState(frameSlotIndex, placedTile.fillCount);
      }

      // Reuse temp Vector3 (pool clones immediately, so safe to reuse)
      this._tempPosition.set(placedTile.position.x, placedTile.position.y, placedTile.position.z);
      const rotation = {
        x: placedTile.rotation.x,
        y: placedTile.rotation.y,
        z: placedTile.rotation.z,
        w: placedTile.rotation.w
      };
      const textureUrl = `/tiles/tile-${frameSlotIndex}.webp`;

      // Use a unique key for placed tiles (offset by 1000 to avoid collision)
      const placedTileKey = 1000 + frameSlotIndex;
      const tileRenderer = this.tilePool.acquire(
        placedTileKey,
        this._tempPosition,
        rotation,
        textureUrl
      );

      // Set scale based on fillCount (0.5 for half-filled, 1.0 for complete)
      const scale = placedTile.fillCount === 2 ? 1.0 : 0.5;
      tileRenderer.setScale(scale);

      // Mark as placed (no physics, static)
      tileRenderer.updateState('placed', null, placedTile.fillCount);

      // Store reference for later updates
      this.placedTileRenderers.set(frameSlotIndex, tileRenderer);


      // Listen to fillCount changes for scale updates
      $(placedTile).listen('fillCount', (fillCount: number) => {
        if (this.frame) {
          this.frame.updateSlotFillState(frameSlotIndex, fillCount);
        }
        // Update scale
        const renderer = this.placedTileRenderers.get(frameSlotIndex);
        if (renderer) {
          const newScale = fillCount === 2 ? 1.0 : 0.5;
          renderer.setScale(newScale);
        }
      });
    });

    // Listen for placed tiles being removed (shouldn't happen normally)
    $(this.room.state.placedTiles).onRemove((placedTile: any, key: string) => {
      const frameSlotIndex = parseInt(key, 10);
      if (this.frame) {
        this.frame.updateSlotFillState(frameSlotIndex, 0);
      }

      // Remove placed tile mesh
      const placedTileKey = 1000 + frameSlotIndex;
      this.tilePool.release(placedTileKey);
      this.placedTileRenderers.delete(frameSlotIndex);
    });

    // Listen for goal score changes
    $(this.room.state).listen('blueGoalScore', (score: number) => {
      if (this.scoreboard) {
        this.scoreboard.updateScores(score, this.room.state.redGoalScore || 0);
      }
    });

    $(this.room.state).listen('redGoalScore', (score: number) => {
      if (this.scoreboard) {
        this.scoreboard.updateScores(this.room.state.blueGoalScore || 0, score);
      }
    });

    // Slot fill states are NOT synced via schema (bandwidth optimization)
    // Instead, we receive initial states via 'slot_states' message
    // and live updates via 'tile_placed' message
    this.room.onMessage('slot_states', (data: { halfFilledSlots: number[]; completeSlots: number[] }) => {
      if (this.frame) {
        // Frame is ready, apply immediately
        for (const slotIndex of data.halfFilledSlots) {
          this.frame.updateSlotFillState(slotIndex, 1);
        }
        for (const slotIndex of data.completeSlots) {
          this.frame.updateSlotFillState(slotIndex, 2);
        }
      } else {
        // Frame not ready yet, cache for later
        this.pendingSlotStates = data;
      }
    });

    // Listen for tile_placed to update slot states in real-time
    this.room.onMessage('tile_placed', (data: { slotIndex: number; isComplete: boolean }) => {
      if (this.frame) {
        this.frame.updateSlotFillState(data.slotIndex, data.isComplete ? 2 : 1);
      }
    });

  }

  /**
   * Update player target position (for interpolation)
   * Passes raw position object to avoid Vector3 allocation (GC optimization)
   */
  private updatePlayerPosition(sessionId: string, position: any): void {
    const playerRenderer = this.players.get(sessionId);
    if (playerRenderer) {
      // Pass raw object - renderer handles conversion without allocation
      playerRenderer.updateTargetPosition(position);
    }
  }

  /**
   * Update player target rotation (for interpolation)
   */
  private updatePlayerRotation(sessionId: string, rotation: any): void {
    const playerRenderer = this.players.get(sessionId);
    if (playerRenderer) {
      playerRenderer.updateTargetRotation(rotation);
    }
  }


  /**
   * Update tile target position (for interpolation)
   * @param availableId - The tile's availableId (0-799)
   */
  private updateTilePosition(availableId: number, position: any): void {
    const tileRenderer = this.tilePool.getTile(availableId);
    if (tileRenderer) {
      tileRenderer.updateTargetPosition(position);
    }
  }

  /**
   * Update tile target rotation (for interpolation)
   * @param availableId - The tile's availableId (0-799)
   */
  private updateTileRotation(availableId: number, rotation: any): void {
    const tileRenderer = this.tilePool.getTile(availableId);
    if (tileRenderer) {
      tileRenderer.updateTargetRotation(rotation);
    }
  }

  /**
   * Update tile state (locked, charging, on_floor, etc.)
   * @param availableId - The tile's availableId (0-799)
   */
  private updateTileState(availableId: number, state: string, ownedBy: string | null): void {
    const tileRenderer = this.tilePool.getTile(availableId);
    if (tileRenderer) {
      // Play pickup sound when tile is locked to local player
      if (state === 'locked' && ownedBy === this.localSessionId && this.sound) {
        this.sound.play('tilePickup');
      }

      // Handle tile auto-release (charging → on_floor transition)
      if (state === 'on_floor' && this.raycast) {
        this.raycast.handleTileAutoRelease(availableId);
      }

      // fillCount no longer used for available tiles (placedTiles handles frame display)
      tileRenderer.updateState(state, ownedBy, 0);

      // Detach tile from camera if it was previously attached
      if (state !== 'held') {
        tileRenderer.detachFromCamera();
      }
    }
  }

  /**
   * Start interpolation loop (runs every frame)
   */
  private startInterpolationLoop(): void {
    this.scene.onBeforeRenderObservable.add(() => {
      // Update meshes first so the camera reads the latest positions
      this.interpolatePlayers();
      this.interpolateTiles();
      this.reconcileLocalPlayer();

      // Update shadow culling periodically
      this.updateShadowCasters();
    });
  }

  /**
   * Update camera to follow local player mesh (SERVER-AUTHORITATIVE)
   * Camera follows the interpolated mesh position for smooth sync
   */
  private reconcileLocalPlayer(): void {
    if (!this.localPlayer || !this.gameCamera) return;

    // Camera follows interpolated mesh position (not raw server position)
    // This prevents flicker since camera and visual mesh are in sync
    const meshPos = this.localPlayer.getMesh().position;
    this.gameCamera.setPosition(meshPos.x, meshPos.y, meshPos.z);
  }

  /**
   * Interpolate all player positions smoothly
   * Called every frame (60fps) for smooth rendering
   */
  private interpolatePlayers(): void {
    // Local player: NO interpolation (instant update to prevent visual lag)
    // When you see your own mesh, interpolation causes flicker at high speeds
    if (this.localPlayer) {
      this.localPlayer.interpolate(1.0); // No lerp - instant update
    }

    // Remote players: smooth interpolation (they don't see their own lag)
    this.players.forEach((playerRenderer) => {
      playerRenderer.interpolate(this.lerpFactor); // 40% lerp
    });
  }

  /**
   * Interpolate all tile positions and rotations smoothly
   * Called every frame (60fps) for smooth physics rendering
   * Server controls ALL tile positions (including charging)
   */
  private interpolateTiles(): void {
    this.tilePool.getActiveTiles().forEach((tileRenderer) => {
      tileRenderer.interpolate(this.lerpFactor);
    });
  }

  /**
   * Update shadow casters based on distance from camera
   * Throttled to run every 10 frames
   */
  private updateShadowCasters(): void {
    if (!this.shadowGenerator || !this.gameCamera) return;

    this.shadowUpdateCounter++;
    if (this.shadowUpdateCounter < 10) return;
    this.shadowUpdateCounter = 0;

    const cameraPos = this.gameCamera.getCamera().position;
    const thresholdSq = this.SHADOW_DISTANCE * this.SHADOW_DISTANCE;

    // Update players
    this.players.forEach((player, id) => {
      const distSq = Vector3.DistanceSquared(player.getMesh().position, cameraPos);
      const shouldCast = distSq < thresholdSq;

      if (shouldCast && !this.shadowCasters.has(id)) {
        player.enableShadowCasting(this.shadowGenerator!);
        this.shadowCasters.add(id);
      } else if (!shouldCast && this.shadowCasters.has(id)) {
        // Remove shadow caster - use getChassis() to get the actual Mesh
        this.shadowGenerator!.removeShadowCaster(player.getChassis());
        // Note: We might need to remove wheels/forks too, but for now chassis is the main cost
        this.shadowCasters.delete(id);
      }
    });

    // Tiles no longer cast shadows for performance (only players cast shadows)
  }

  /**
   * Get local player session ID
   */
  getLocalSessionId(): string {
    return this.localSessionId;
  }

  /**
   * Get local player renderer (for physics-based movement)
   */
  getLocalPlayer(): VehicleRenderer | null {
    return this.localPlayer;
  }

  /**
   * Get all rendered players
   */
  getPlayers(): Map<string, VehicleRenderer> {
    return this.players;
  }

  /**
   * Get all rendered tiles
   */
  getTiles(): Map<number, TileRenderer> {
    return this.tilePool.getActiveTiles();
  }

  /**
   * Get specific tile renderer by availableId
   */
  getTile(availableId: number): TileRenderer | undefined {
    return this.tilePool.getTile(availableId);
  }

  /**
   * Dispose state sync
   */
  dispose(): void {
    // Remove local player renderer
    if (this.localPlayer) {
      this.localPlayer.dispose();
      this.localPlayer = null;
    }

    // Remove all player renderers
    this.players.forEach((playerRenderer) => {
      playerRenderer.dispose();
    });
    this.players.clear();

    // Remove all placed tile renderers
    this.placedTileRenderers.forEach((renderer, frameSlotIndex) => {
      const placedTileKey = 1000 + frameSlotIndex;
      this.tilePool.release(placedTileKey);
    });
    this.placedTileRenderers.clear();

    // Remove all tile renderers
    this.tilePool.dispose();
  }
}
