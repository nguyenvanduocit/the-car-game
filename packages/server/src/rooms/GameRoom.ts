import '../config/encoder';
import {
  Room,
  Client,
  OnCreateException,
  OnJoinException,
  OnLeaveException,
  OnDisposeException,
  OnMessageException,
  SimulationIntervalException,
  TimedEventException,
  type RoomException,
} from '@colyseus/core';
import { GameRoomSchema } from '../schema/GameRoomSchema';
import { TileSchema } from '../schema/TileSchema';
import { PlayerSchema } from '../schema/PlayerSchema';
import { PlacedTileSchema } from '../schema/PlacedTileSchema';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PuzzleGenerator } from '../utils/PuzzleGenerator';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import {
  PhysicsConstants,
  TILE_CONFIG,
  FLOOR_CONFIG,
  TileState,
  PuzzleType,
  PlayerState,
  isFrameSlotEmpty,
  QuestionBank,
  getFrameSlotPosition,
  ARCH_DESCRIPTORS,
  WORLD_BOUNDS,
  PLAYER_CONFIG,
  TILE_ATTACH_POINT,
} from '@blockgame/shared';
import { nanoid } from 'nanoid';
import { db } from '../index';
import { loadRoomState, saveRoomState, type PersistedPlayer } from '../database/roomState';
import { getTopPlayers, updatePlayerScore } from '../database/leaderboard';
import { PhysicsMotionType } from '@babylonjs/core';
import { metricsCollector } from '../monitoring/MetricsCollector';

// Sleep thresholds moved to PhysicsConstants in @blockgame/shared
const MAX_CHARGE_TIME = 2000; // 2 seconds max charge time
const MAX_STRENGTH = 100; // Max shoot strength

// Railguard bounds - OUTSIDE walls to catch escaped entities
// NOTE: These are EMERGENCY bounds - physics walls handle normal bouncing
// Railguard only catches things that completely escaped the physics boundaries
const RAILGUARD_MARGIN = 10; // 10 units OUTSIDE the walls
const RAILGUARD_BOUNDS = {
  minX: WORLD_BOUNDS.minX - RAILGUARD_MARGIN, // -60 (walls at -50)
  maxX: WORLD_BOUNDS.maxX + RAILGUARD_MARGIN, // +60 (walls at +50)
  minZ: WORLD_BOUNDS.minZ - RAILGUARD_MARGIN, // -110 (walls at -100)
  maxZ: WORLD_BOUNDS.maxZ + RAILGUARD_MARGIN, // +110 (walls at +100)
  minY: -10, // Only catch things that fell WAY below floor
  maxY: 120, // Only catch things that went WAY above ceiling
};

/**
 * GameRoom - Main multiplayer game room
 * Handles player connections, game state, and physics updates
 */
export class GameRoom extends Room<GameRoomSchema> {
  maxClients = 300;
  autoDispose = false; // Keep room alive when all players leave (for state persistence)
  private physicsWorld: PhysicsWorld = new PhysicsWorld();
  private savedPlayerScores: Map<string, number> = new Map(); // displayName -> tilesPlaced

  // Active player tokens (prevents duplicate tabs)
  // Key: playerToken, Value: sessionId
  private activeTokens: Map<string, string> = new Map();

  // Note: Fly animation tracking removed - now client-side

  // Goal scoring debounce (prevent duplicate scores)
  // Track which tiles have scored in which goals (tileIndex -> Set of goal names)
  private tilesScored: Map<number, Set<string>> = new Map();

  // Tile damage cooldowns (prevent same tile hitting same player multiple times)
  // Key: "tileIndex-sessionId", Value: timestamp when cooldown expires
  private tileDamageCooldowns: Map<string, number> = new Map();
  private readonly TILE_DAMAGE_COOLDOWN_MS = 1000; // 1 second cooldown per tile-player pair

  // Performance monitoring
  private updatePhysicsFrameCount: number = 0;
  private lastUpdatePhysicsMetricsLog: number = 0;
  private physicsTimeSamples: number[] = [];
  private frameTimeSamples: number[] = [];

  // Reusable math objects (avoid GC pressure in hot loops)
  private _heldTileOffset = new Vector3(0, 0, 0);
  private _playerQuat = new Quaternion(0, 0, 0, 1);

  // Progressive tile spawning (performance optimization)
  // BANDWIDTH OPTIMIZATION: NOT_SPAWNED tiles are stored here (not synced to clients)
  // Only active tiles are in this.state.tiles (synced MapSchema)
  // NEW ARCHITECTURE: Key by availableId (0-799)
  private unspawnedTiles: Map<number, TileSchema> = new Map(); // availableId -> TileSchema (NOT synced)
  private readonly MAX_ACTIVE_TILES = 50; // Maximum tiles on floor at once
  private readonly TOTAL_AVAILABLE_TILES = 800; // 400 slots × 2 phases

  // Spawn queue for gradual tile spawning (PERFORMANCE OPTIMIZATION)
  // Instead of spawning immediately, queue spawns and spread across frames
  // This prevents frame spikes when multiple tiles are placed rapidly
  private spawnQueue: number[] = []; // availableId values only
  private readonly MAX_SPAWNS_PER_FRAME = 2; // Max tiles to spawn per physics frame

  async onCreate(options: any) {
    console.log('GameRoom created with options:', options);

    // Initialize QuestionBank on first room creation
    QuestionBank.initialize();

    // Set custom room ID if provided
    if (options.roomId) {
      this.roomId = options.roomId;
    }

    // Set state sync rate (PERFORMANCE OPTIMIZATION)
    // Reduced from 60Hz to 30Hz - client interpolation handles visual smoothness
    // This halves network bandwidth while maintaining smooth gameplay
    this.setPatchRate(1000 / PhysicsConstants.STATE_PATCH_RATE); // 33.33ms = 30Hz

    // Initialize game state
    this.setState(new GameRoomSchema());

    // Initialize frame slots (default pulled from shared config, currently 400 tiles)
    const tileCount = options.tileCount || TILE_CONFIG.defaultCount;
    this.state.initializeFrameSlots(tileCount);

    // Load all-time leaderboard from database (top 50)
    const allTimeTopPlayers = getTopPlayers(db, 50);
    this.state.loadAllTimeLeaderboard(allTimeTopPlayers);

    // Initialize physics
    await this.physicsWorld.initialize();
    console.log('[PHYSICS] Havok physics initialized on server');

    // Try to restore saved state, otherwise create new tiles
    const savedState = loadRoomState(db, this.roomId);
    if (savedState) {
      console.log(`[RESTORE] Restoring saved state for room ${this.roomId}`);
      this.restoreGameState(savedState, tileCount);

      // Restore goal scores
      this.state.blueGoalScore = savedState.blueGoalScore;
      this.state.redGoalScore = savedState.redGoalScore;

      // Cache player scores for reconnection
      savedState.players.forEach(p => {
        this.savedPlayerScores.set(p.displayName, p.tilesPlaced);
      });
      console.log(`[RESTORE] Cached ${savedState.players.length} player scores for reconnection`);
    } else {
      console.log('[RESTORE] No saved state found, creating new game');
      this.createTiles(tileCount);
    }

    // Setup message handlers
    this.setupMessageHandlers();

    // Setup goal trigger collision callbacks
    this.setupGoalTriggers();

    // Setup tile-player collision callbacks
    this.setupTilePlayerCollisions();

    // Setup physics update loop (SERVER-AUTHORITATIVE)
    // PERFORMANCE OPTIMIZATION: Reduced from 60Hz to 30Hz
    // Physics now has ~33ms budget per step instead of ~16ms
    // Client-side interpolation maintains visual smoothness at 60fps
    this.setSimulationInterval(
      (deltaTime) => this.updatePhysics(deltaTime),
      1000 / PhysicsConstants.PHYSICS_SIMULATION_RATE // 33.33ms = 30Hz
    );

    // Register room with metrics collector for PM2 monitoring
    metricsCollector.registerRoom(this);
  }

  /**
   * Create available tiles with random positions on floor
   * BANDWIDTH OPTIMIZATION: Only active tiles are synced to clients
   *
   * NEW ARCHITECTURE:
   * - Creates 800 available tiles (availableId 0-799)
   * - availableId 0-399 = phase 1 tiles (first half of each slot)
   * - availableId 400-799 = phase 2 tiles (second half of each slot)
   * - Only spawns phase 1 tiles initially
   */
  private createTiles(tileCount: number): void {
    console.log(`[TILES] Creating ${this.TOTAL_AVAILABLE_TILES} available tiles (${tileCount} slots × 2 phases)...`);

    const floorWidth = FLOOR_CONFIG.width;
    const floorLength = FLOOR_CONFIG.length;
    const spawnPadding = TILE_CONFIG.spawnPadding;

    // Clear unspawned storage
    this.unspawnedTiles.clear();

    let activeCount = 0;

    // Create all 800 available tiles (phase 1: 0-399, phase 2: 400-799)
    for (let availableId = 0; availableId < this.TOTAL_AVAILABLE_TILES; availableId++) {
      // Create tile with availableId as identifier
      const tile = new TileSchema(availableId);
      tile.rotation.set(0, 0, 0, 1);

      // LAZY PUZZLE GENERATION: Don't generate puzzle here
      // Puzzle is generated when player picks up tile (tile_click handler)

      // Only spawn phase 1 tiles initially (availableId 0-399)
      // Phase 2 tiles (400-799) start in pool
      const isPhase1 = availableId < tileCount;

      if (isPhase1 && activeCount < this.MAX_ACTIVE_TILES) {
        // Phase 1 tiles: spawn on floor with physics (drop from sky)
        const x = (Math.random() - 0.5) * floorWidth * spawnPadding;
        const y = 30; // High in sky - gravity will pull down
        const z = (Math.random() - 0.5) * floorLength * spawnPadding;

        tile.state = TileState.ON_FLOOR;
        tile.position.set(x, y, z);
        tile.isSleeping = false;

        // Add to synced state with availableId as key
        this.state.tiles.set(String(availableId), tile);

        // Create physics body (dynamic, gravity will pull it down)
        this.physicsWorld.ensureTileBody(availableId, tile.position, tile.rotation);
        activeCount++;
      } else {
        // Remaining tiles: stored server-side only (NOT synced to clients)
        tile.state = TileState.NOT_SPAWNED;
        tile.position.set(0, -1000, 0); // Position doesn't matter (not synced)
        tile.isSleeping = true;

        // Store in server-side map (NOT synced - saves bandwidth)
        this.unspawnedTiles.set(availableId, tile);
      }
    }

    console.log(`[TILES] Spawned ${activeCount} phase 1 tiles (synced), ${this.unspawnedTiles.size} in pool (not synced)`);
  }

  /**
   * Queue next tile for spawning (called when a tile is placed in frame)
   * PERFORMANCE OPTIMIZATION: Uses queue + gradual spawning to prevent frame spikes
   *
   * NEW ARCHITECTURE:
   * - When phase 1 tile solved (fillCount=1): spawn phase 2 tile for same slot
   * - When phase 2 tile solved (fillCount=2): spawn next tile from pool
   *
   * @param frameSlotIndex - If provided, spawn phase 2 tile for this slot
   */
  private spawnNextTile(frameSlotIndex?: number): void {
    // Priority 1: Phase 2 tile for half-filled slot
    if (frameSlotIndex !== undefined) {
      // Calculate phase 2 availableId for this slot
      const phase2AvailableId = frameSlotIndex + 400;

      // Check if phase 2 tile exists in pool
      if (this.unspawnedTiles.has(phase2AvailableId)) {
        this.spawnQueue.push(phase2AvailableId);
        console.log(`[SPAWN] Queued phase 2 tile ${phase2AvailableId} for slot ${frameSlotIndex} | Queue: ${this.spawnQueue.length}`);
        return;
      } else {
        console.log(`[SPAWN] Phase 2 tile ${phase2AvailableId} already spawned or consumed`);
      }
    }

    // Priority 2: Fresh tiles from unspawned pool (prefer phase 1 tiles)
    if (this.unspawnedTiles.size > 0) {
      // Find first available phase 1 tile (0-399)
      for (let availableId = 0; availableId < 400; availableId++) {
        if (this.unspawnedTiles.has(availableId)) {
          this.spawnQueue.push(availableId);
          console.log(`[SPAWN] Queued phase 1 tile ${availableId} | Queue: ${this.spawnQueue.length} | Pool: ${this.unspawnedTiles.size}`);
          return;
        }
      }

      // No phase 1 tiles left, find first phase 2 tile
      for (let availableId = 400; availableId < 800; availableId++) {
        if (this.unspawnedTiles.has(availableId)) {
          this.spawnQueue.push(availableId);
          console.log(`[SPAWN] Queued phase 2 tile ${availableId} | Queue: ${this.spawnQueue.length} | Pool: ${this.unspawnedTiles.size}`);
          return;
        }
      }
    }

    console.log('[SPAWN] No more tiles to spawn (pools empty)');
  }

  /**
   * Process spawn queue gradually (called each physics frame)
   * PERFORMANCE OPTIMIZATION: Spreads physics body creation across frames
   * to prevent frame spikes when multiple tiles are placed rapidly
   *
   * NEW ARCHITECTURE:
   * - All tiles come from unspawnedTiles pool (no returning to floor)
   * - Tiles are keyed by availableId (0-799)
   */
  private processSpawnQueue(): void {
    if (this.spawnQueue.length === 0) return;

    const floorWidth = FLOOR_CONFIG.width;
    const floorLength = FLOOR_CONFIG.length;
    const spawnPadding = TILE_CONFIG.spawnPadding;

    // Spawn up to MAX_SPAWNS_PER_FRAME tiles per physics frame
    let spawned = 0;
    while (this.spawnQueue.length > 0 && spawned < this.MAX_SPAWNS_PER_FRAME) {
      const availableId = this.spawnQueue.shift()!;

      // Get tile from unspawned pool
      const tile = this.unspawnedTiles.get(availableId);
      if (!tile) {
        console.error(`[SPAWN] Tile ${availableId} not found in unspawned pool!`);
        continue;
      }

      // Remove from unspawned storage
      this.unspawnedTiles.delete(availableId);

      // Random position high in sky (gravity will pull it down)
      const x = (Math.random() - 0.5) * floorWidth * spawnPadding;
      const y = 30; // High in sky
      const z = (Math.random() - 0.5) * floorLength * spawnPadding;

      // Update tile state
      tile.state = TileState.ON_FLOOR;
      tile.position.set(x, y, z);
      tile.rotation.set(0, 0, 0, 1);
      tile.isSleeping = false;
      tile.velocity.set(0, 0, 0);
      tile.angularVelocity.set(0, 0, 0);
      tile.ownedBy = null;

      // Add to synced state (this triggers onAdd on clients)
      this.state.tiles.set(String(availableId), tile);

      // Create physics body (dynamic, gravity will drop it)
      this.physicsWorld.ensureTileBody(availableId, tile.position, tile.rotation);

      console.log(`[SPAWN] Spawned tile ${availableId} (phase ${tile.phase}, slot ${tile.frameSlotIndex}) from sky at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) | Queue: ${this.spawnQueue.length} | Pool: ${this.unspawnedTiles.size}`);
      spawned++;
    }
  }

  /**
   * Restore game state from saved data
   * BANDWIDTH OPTIMIZATION: Only syncs active tiles
   *
   * NEW SIMPLIFIED ARCHITECTURE:
   * - Restores from slotFillCounts and slotCompletedBy arrays
   * - No more tiles array (deprecated)
   */
  private restoreGameState(savedState: { players: PersistedPlayer[]; slotFillCounts: number[]; slotCompletedBy: string[] }, tileCount: number): void {
    console.log(`[RESTORE] Restoring game state from saved data`);

    const floorWidth = FLOOR_CONFIG.width;
    const floorLength = FLOOR_CONFIG.length;
    const spawnPadding = TILE_CONFIG.spawnPadding;

    // Clear unspawned storage
    this.unspawnedTiles.clear();

    // Use slotFillCounts from saved state (or empty array for legacy data)
    const slotFillCounts: number[] = savedState.slotFillCounts.length > 0
      ? [...savedState.slotFillCounts]
      : new Array(tileCount).fill(0);

    // Use slotCompletedBy from saved state (or empty array for legacy data)
    const slotCompletedBy: string[] = savedState.slotCompletedBy.length > 0
      ? [...savedState.slotCompletedBy]
      : new Array(tileCount).fill('');

    // First pass: Restore placed tiles from slot arrays
    for (let frameSlotIndex = 0; frameSlotIndex < tileCount; frameSlotIndex++) {
      const fillCount = slotFillCounts[frameSlotIndex] || 0;

      if (fillCount > 0) {
        // Create PlacedTileSchema for this slot
        const placedTile = new PlacedTileSchema(frameSlotIndex, tileCount);
        placedTile.fillCount = fillCount;
        placedTile.completedBy = slotCompletedBy[frameSlotIndex] || '';

        // Add to placedTiles map
        this.state.placedTiles.set(String(frameSlotIndex), placedTile);

        // Mark frameSlots when complete
        if (fillCount === 2) {
          this.state.frameSlots[frameSlotIndex] = String(frameSlotIndex);
        }

        console.log(`[RESTORE] Restored placed tile for slot ${frameSlotIndex} (fillCount: ${fillCount})`);
      }
    }

    // Count restored slots
    const halfFilledCount = slotFillCounts.filter(c => c === 1).length;
    const completeCount = slotFillCounts.filter(c => c === 2).length;
    console.log(`[RESTORE] Restored ${this.state.placedTiles.size} placed tiles: ${halfFilledCount} half-filled, ${completeCount} complete`);

    // Second pass: Create available tiles based on what's been consumed
    // Phase 1 tiles (0-399): consumed if slot has fillCount >= 1
    // Phase 2 tiles (400-799): consumed if slot has fillCount >= 2
    let activeCount = 0;

    for (let availableId = 0; availableId < this.TOTAL_AVAILABLE_TILES; availableId++) {
      const frameSlotIndex = availableId % 400;
      const phase = availableId < 400 ? 1 : 2;
      const slotFillCount = slotFillCounts[frameSlotIndex] || 0;

      // Skip if this tile has been consumed
      // Phase 1 consumed if fillCount >= 1
      // Phase 2 consumed if fillCount >= 2
      if ((phase === 1 && slotFillCount >= 1) || (phase === 2 && slotFillCount >= 2)) {
        continue; // Tile already used
      }

      // Create available tile
      const tile = new TileSchema(availableId);
      tile.rotation.set(0, 0, 0, 1);

      // Determine if this tile should be spawned on floor
      // Only spawn phase 1 tiles initially, and phase 2 tiles for half-filled slots
      const shouldSpawnNow = (phase === 1) || (phase === 2 && slotFillCount === 1);

      if (shouldSpawnNow && activeCount < this.MAX_ACTIVE_TILES) {
        // Spawn on floor with physics
        const x = (Math.random() - 0.5) * floorWidth * spawnPadding;
        const y = 30; // High in sky
        const z = (Math.random() - 0.5) * floorLength * spawnPadding;

        tile.state = TileState.ON_FLOOR;
        tile.position.set(x, y, z);
        tile.isSleeping = false;

        // Add to synced state
        this.state.tiles.set(String(availableId), tile);

        // Create physics body
        this.physicsWorld.ensureTileBody(availableId, tile.position, tile.rotation);
        activeCount++;
      } else {
        // Store in pool (not synced)
        tile.state = TileState.NOT_SPAWNED;
        tile.position.set(0, -1000, 0);
        tile.isSleeping = true;

        this.unspawnedTiles.set(availableId, tile);
      }
    }

    console.log(`[RESTORE] Created ${activeCount} available tiles on floor, ${this.unspawnedTiles.size} in pool`);
    console.log(`[RESTORE] State restoration complete`);
  }

  /**
   * Save current room state to database
   *
   * NEW SIMPLIFIED ARCHITECTURE:
   * - slotFillCounts: Array of fill counts (0=empty, 1=half, 2=complete)
   * - slotCompletedBy: Array of player names who completed each slot
   */
  private saveCurrentRoomState(): void {
    const persistedPlayers: PersistedPlayer[] = [];
    const slotCount = this.state.frameSlots.length;
    const slotFillCounts: number[] = new Array(slotCount).fill(0);
    const slotCompletedBy: string[] = new Array(slotCount).fill('');

    // Derive slot data from placedTiles
    this.state.placedTiles.forEach((placedTile, key) => {
      const frameSlotIndex = parseInt(key, 10);
      slotFillCounts[frameSlotIndex] = placedTile.fillCount;
      slotCompletedBy[frameSlotIndex] = placedTile.completedBy || '';
    });

    // Persist player scores AND rebuild savedPlayerScores cache
    // Group by displayName to handle multiple sessions correctly
    const scoresByName = new Map<string, number>();

    this.state.players.forEach((player) => {
      const current = scoresByName.get(player.displayName) || 0;
      scoresByName.set(player.displayName, current + player.tilesPlaced);
    });

    // Clear and rebuild savedPlayerScores
    this.savedPlayerScores.clear();
    scoresByName.forEach((tilesPlaced, displayName) => {
      persistedPlayers.push({
        displayName: displayName,
        tilesPlaced: tilesPlaced,
      });

      this.savedPlayerScores.set(displayName, tilesPlaced);
    });

    // Save to database
    saveRoomState(db, this.roomId, persistedPlayers, slotFillCounts, slotCompletedBy, this.state.blueGoalScore, this.state.redGoalScore);
  }

  /**
   * Update all-time leaderboard when a player scores
   * Saves the player's score to database and refreshes the synced leaderboard
   */
  private updateAllTimeLeaderboard(playerName: string, tilesPlacedThisSession: number): void {
    // Save/update player in database (increments their all-time tiles_placed)
    // timePlayed is 0 for now since we're not tracking session time
    updatePlayerScore(db, playerName, tilesPlacedThisSession, 0);

    // Refresh the all-time leaderboard from database (top 50)
    const allTimeTopPlayers = getTopPlayers(db, 50);
    this.state.loadAllTimeLeaderboard(allTimeTopPlayers);
  }

  /**
   * Calculate a normalized forward direction vector from a yaw rotation (ArcRotate alpha)
   */
  private getForwardDirectionFromRotation(rotation: number): { x: number; y: number; z: number } {
    const forwardX = -Math.cos(rotation);
    const forwardZ = -Math.sin(rotation);
    return { x: forwardX, y: 0, z: forwardZ };
  }

  /**
   * Infer the horizontal direction from the current tile offset (player → tile).
   * Returns null if the tile is too close to the player center.
   */
  private getDirectionFromTileOffset(
    player: PlayerSchema,
    tile: TileSchema
  ): { x: number; y: number; z: number } | null {
    const dx = tile.position.x - player.position.x;
    const dz = tile.position.z - player.position.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-3) {
      return null;
    }
    return { x: dx / length, y: 0, z: dz / length };
  }

  private normalizeDirection(direction: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const magnitude = Math.hypot(direction.x, direction.y, direction.z);
    if (magnitude < 1e-3) {
      return { x: 0, y: 0, z: 1 };
    }
    return {
      x: direction.x / magnitude,
      y: direction.y / magnitude,
      z: direction.z / magnitude,
    };
  }

  /**
   * Resolve the impulse direction. Horizontal aim always follows the tile offset / player rotation,
   * but we allow the client to add vertical adjustment if needed.
   */
  private resolveShootDirection(
    fallbackDirection: { x: number; y: number; z: number },
    requested?: { x: number; y: number; z: number }
  ): { x: number; y: number; z: number } {
    const forward = this.normalizeDirection(fallbackDirection);

    if (!requested) {
      return forward;
    }

    const requestedNormalized = this.normalizeDirection(requested);
    const horizontalAlignment = requestedNormalized.x * forward.x + requestedNormalized.z * forward.z;

    if (horizontalAlignment < 0.25) {
      console.warn(`[TILE_SHOOT] Requested direction misaligned (dot=${horizontalAlignment.toFixed(2)}). Using fallback direction.`);
      return forward;
    }

    // Keep horizontal from forward, but allow requested vertical influence
    const combined = {
      x: forward.x,
      y: requestedNormalized.y,
      z: forward.z,
    };

    return this.normalizeDirection(combined);
  }

  /**
   * Shoot a charged tile (shared logic for manual and auto-release)
   * SERVER-AUTHORITATIVE: All tile shooting goes through this method
   * @param availableId - The available tile's ID (0-799)
   */
  private shootTile(
    availableId: number,
    sessionId: string,
    direction: { x: number; y: number; z: number } | undefined,
    strength: number,
    source: 'manual' | 'auto' | 'puzzle_failed'
  ): void {
    const player = this.state.getPlayer(sessionId);
    const tile = this.state.getTile(availableId);

    if (!player) {
      console.warn(`[TILE_SHOOT] Cannot shoot tile ${availableId}: player ${sessionId} not found`);
      return;
    }

    if (!tile) {
      console.warn(`[TILE_SHOOT] Cannot shoot tile ${availableId}: tile not found`);
      return;
    }

    const tileOffsetDirection = this.getDirectionFromTileOffset(player, tile);
    const fallbackDirection = tileOffsetDirection ?? this.getForwardDirectionFromRotation(player.rotation);
    const tileOffsetDistance = tileOffsetDirection
      ? Math.hypot(
        tile.position.x - player.position.x,
        tile.position.z - player.position.z
      )
      : null;

    // Return tile to floor state (handles both CHARGING and LOCKED states)
    tile.returnToFloor();

    const actualDirection = this.resolveShootDirection(fallbackDirection, direction);

    // CRITICAL: Spawn tile AHEAD of player far enough to avoid overlapping player sphere.
    const tileHalfDepth = TILE_CONFIG.meshSize.depth / 2;
    const SAFE_DISTANCE_BUFFER = 0.35;
    const minSpawnDistance = PLAYER_CONFIG.radius + tileHalfDepth + SAFE_DISTANCE_BUFFER;
    const attachmentDistance = tileOffsetDistance ?? minSpawnDistance;
    const SPAWN_FORWARD_DISTANCE = Math.max(attachmentDistance, minSpawnDistance);
    const SPAWN_HEIGHT_OFFSET = 0.3;
    const spawnPos = {
      x: player.position.x + actualDirection.x * SPAWN_FORWARD_DISTANCE,
      y: player.position.y - SPAWN_HEIGHT_OFFSET,
      z: player.position.z + actualDirection.z * SPAWN_FORWARD_DISTANCE
    };

    // CRITICAL: Update BOTH physics body AND schema position
    tile.position.x = spawnPos.x;
    tile.position.y = spawnPos.y;
    tile.position.z = spawnPos.z;

    // Re-enable physics simulation
    this.physicsWorld.enableTilePhysics(availableId);

    // Apply impulse to shoot forward
    this.physicsWorld.applyTileImpulse(availableId, actualDirection, strength);

    // Apply backforce to player (Newton's third law)
    this.physicsWorld.applyPlayerBackforce(sessionId, actualDirection, strength);
  }

  /**
   * Setup message handlers for client communication
   */
  private setupMessageHandlers(): void {
    // Player movement input (SERVER-AUTHORITATIVE)
    // Client sends movement direction (normalized), server applies force
    this.onMessage('player_move', (client, message) => {
      const player = this.state.getPlayer(client.sessionId);
      if (!player) return;

      // Extract car controls from message
      // direction.x = throttle (-1 to 1)
      // direction.z = steering (-1 to 1)
      const throttle = message.direction.x;
      const steering = message.direction.z;

      // Apply car physics (forward force + steering)
      this.physicsWorld.applyCarControls(client.sessionId, throttle, steering);

      // Player rotation is now controlled by physics (not camera)
      // Camera rotation (message.rotation) is ignored for car direction
    });

    // Tile click (start puzzle)
    // NEW ARCHITECTURE: tileIndex is now availableId (0-799)
    this.onMessage('tile_click', (client, message) => {
      const player = this.state.getPlayer(client.sessionId);
      const availableId = message.tileIndex; // Client sends availableId as tileIndex
      const tile = this.state.getTile(availableId);

      if (!player || !tile) return;
      if (tile.state !== TileState.ON_FLOOR) {
        console.log(`[TILE] Player ${client.sessionId} tried to click tile ${availableId} but it's ${tile.state}`);
        return; // Tile must be on floor
      }

      // LAZY PUZZLE GENERATION: Generate puzzle now if not already set
      // Use tile.phase to determine which question set (phase 1: 0-399, phase 2: 400-799)
      if (!tile.puzzle || !tile.puzzle.questionId) {
        // For phase-based puzzles, questionId = availableId
        tile.puzzle = PuzzleGenerator.generatePuzzle(tile.frameSlotIndex, tile.phase - 1);
        console.log(`[TILE] Generated puzzle for tile ${availableId} (phase ${tile.phase}, slot ${tile.frameSlotIndex}) on pickup`);
      }

      // Lock tile to player (keep physics body, just control position)
      tile.lockToPlayer(client.sessionId);
      player.startPuzzle();

      console.log(`[TILE] Player ${client.sessionId} (${player.displayName}) locked tile ${availableId} (phase ${tile.phase}, slot ${tile.frameSlotIndex}) for puzzle`);

      // Send puzzle config to client
      client.send('show_puzzle', {
        tileIndex: availableId,
        puzzle: tile.puzzle,
      });
    });

    // Start charging tile (right mouse button down)
    // NEW ARCHITECTURE: tileIndex is now availableId (0-799)
    this.onMessage('start_tile_charge', (client, message) => {
      const player = this.state.getPlayer(client.sessionId);
      const availableId = message.tileIndex;
      const tile = this.state.getTile(availableId);

      if (!player || !tile) return;

      // Validate tile is on floor
      if (tile.state !== TileState.ON_FLOOR) {
        console.log(`[TILE_CHARGE] Player ${client.sessionId} tried to charge tile ${availableId} but it's ${tile.state}`);
        return;
      }

      // Start charging (keep physics body, just control position)
      tile.startCharging(client.sessionId);

      console.log(`[TILE_CHARGE] Player ${client.sessionId} (${player.displayName}) started charging tile ${availableId}`);
    });

    // Shoot charged tile (right mouse button up - MANUAL RELEASE)
    // NEW ARCHITECTURE: tileIndex is now availableId (0-799)
    this.onMessage('tile_shoot', (client, message) => {
      const player = this.state.getPlayer(client.sessionId);
      const availableId = message.tileIndex;
      const tile = this.state.getTile(availableId);

      if (!player || !tile) return;

      // Validate tile is charging
      if (tile.state !== TileState.CHARGING) {
        console.log(`[TILE_SHOOT] Player ${client.sessionId} tried to shoot tile ${availableId} but it's ${tile.state}`);
        return;
      }

      // Validate player owns the tile
      if (tile.ownedBy !== client.sessionId) {
        console.log(`[TILE_SHOOT] Player ${client.sessionId} tried to shoot tile ${availableId} but doesn't own it`);
        return;
      }

      // Calculate charge duration (server-authoritative)
      const chargeDuration = tile.chargingStartTime ? Date.now() - tile.chargingStartTime : 0;

      // Map duration to strength (1-100)
      const MIN_STRENGTH = 1;
      const rawStrength = (chargeDuration / MAX_CHARGE_TIME) * (MAX_STRENGTH - MIN_STRENGTH) + MIN_STRENGTH;
      const strength = Math.max(MIN_STRENGTH, Math.min(MAX_STRENGTH, Math.round(rawStrength)));

      // Use consolidated shootTile method
      this.shootTile(availableId, client.sessionId, message.direction, strength, 'manual');
    });

    // Puzzle result submission
    // NEW ARCHITECTURE: tileIndex is now availableId (0-799)
    this.onMessage('puzzle_submit', (client, message) => {
      const player = this.state.getPlayer(client.sessionId);
      const availableId = message.tileIndex;
      const tile = this.state.getTile(availableId);

      if (!player || !tile) return;
      if (tile.ownedBy !== client.sessionId) return; // Must own the tile

      // SERVER-AUTHORITATIVE VALIDATION using QuestionBank
      let isCorrect = false;

      if (tile.puzzle.type === 'multiple_choice' && tile.puzzle.questionId) {
        // Convert questionId from string to number for validation
        const questionIdNum = parseInt(tile.puzzle.questionId, 10);
        isCorrect = QuestionBank.validateAnswer(questionIdNum, message.answerIndex);
        console.log(`[PUZZLE] Validating answer for question ${tile.puzzle.questionId} (phase ${tile.phase}): ${isCorrect ? 'CORRECT' : 'WRONG'} (answer: ${message.answerIndex})`);
      } else {
        // Fallback for other puzzle types or legacy data
        console.warn(`[PUZZLE] No questionId found, using client success flag (not recommended)`);
        isCorrect = message.success === true;
      }

      if (isCorrect) {
        // Puzzle solved - place tile in frame
        // NEW ARCHITECTURE: placeTileInFrame takes availableId, removes tile, creates/updates placedTile
        const result = this.state.placeTileInFrame(availableId, client.sessionId);

        if (result.success) {
          // Remove physics body (tile is now removed, placedTile is in frame)
          this.physicsWorld.removeTileBody(availableId);

          // Clean up tilesScored entry (tile is consumed, prevent memory leak)
          this.tilesScored.delete(availableId);

          console.log(`[PUZZLE] Player ${client.sessionId} (${player.displayName}) solved tile ${availableId} (phase ${tile.phase}, slot ${result.frameSlotIndex}). Complete: ${result.isComplete}`);

          // Send success to local player (for success sound)
          client.send('puzzle_success', {
            tileIndex: availableId,
            slotIndex: result.frameSlotIndex,
            isComplete: result.isComplete,
          });

          // Broadcast placement to ALL clients (triggers fly animation)
          this.broadcast('tile_placed', {
            tileIndex: availableId,
            slotIndex: result.frameSlotIndex,
            sessionId: client.sessionId,
            isComplete: result.isComplete,
          });

          // Spawn logic depends on fill state
          if (!result.isComplete) {
            // Half-filled - spawn phase 2 tile for same slot
            this.spawnNextTile(result.frameSlotIndex);
          } else {
            // Complete - spawn next tile from pool
            this.spawnNextTile();
          }

          // Save room state after tile placement
          this.saveCurrentRoomState();

          // Update all-time leaderboard (persist to database)
          this.updateAllTimeLeaderboard(player.displayName, 1);
        } else {
          // Placement rejected (shouldn't happen normally)
          console.error(`[PUZZLE] Failed to place tile ${availableId}`);
          tile.returnToFloor();
          player.cancelPuzzle();
          client.send('puzzle_failed', { tileIndex: availableId });
        }
      } else {
        // Puzzle failed - shoot tile away with 50% strength
        const PUZZLE_FAIL_STRENGTH = 50;

        // Shoot tile in player's facing direction (server will resolve yaw)
        this.shootTile(availableId, client.sessionId, undefined, PUZZLE_FAIL_STRENGTH, 'puzzle_failed');

        player.cancelPuzzle();
        console.log(`[PUZZLE] Player ${client.sessionId} (${player.displayName}) failed puzzle for tile ${availableId} (phase ${tile.phase}) - tile shot away`);
        client.send('puzzle_failed', { tileIndex: availableId });
      }
    });

    // Puzzle cancel (user closed dialog)
    // NEW ARCHITECTURE: tileIndex is now availableId (0-799)
    this.onMessage('puzzle_cancel', (client, message) => {
      const player = this.state.getPlayer(client.sessionId);
      const availableId = message.tileIndex;
      const tile = this.state.getTile(availableId);

      if (!player || !tile) return;
      if (tile.ownedBy !== client.sessionId) return;

      // Shoot tile away with 50% strength (same as puzzle failed)
      const PUZZLE_FAIL_STRENGTH = 50;

      // Shoot tile in player's facing direction (server will resolve yaw)
      this.shootTile(availableId, client.sessionId, undefined, PUZZLE_FAIL_STRENGTH, 'puzzle_failed');

      player.cancelPuzzle();

      console.log(`[PUZZLE] Player ${client.sessionId} (${player.displayName}) cancelled puzzle for tile ${availableId} - tile shot away`);
    });

    // Frame placement (legacy handler - tiles now auto-place after puzzle success)
    // NEW ARCHITECTURE: tileIndex is now availableId (0-799)
    this.onMessage('frame_place', (client, message) => {
      const player = this.state.getPlayer(client.sessionId);

      if (!player) {
        client.send('placement_failed', { reason: 'player_not_found' });
        return;
      }

      const availableId = message.tileIndex;
      const tile = this.state.getTile(availableId);

      if (!tile) {
        client.send('placement_failed', { reason: 'tile_not_found' });
        return;
      }

      // Attempt to place tile in frame (takes availableId now)
      const result = this.state.placeTileInFrame(availableId, client.sessionId);

      if (result.success) {
        // Remove physics body immediately when flying starts
        this.physicsWorld.removeTileBody(availableId);

        // Clean up tilesScored entry (tile is consumed, prevent memory leak)
        this.tilesScored.delete(availableId);

        console.log(`[FRAME] Player ${client.sessionId} (${player.displayName}) placed tile ${availableId} in slot ${result.frameSlotIndex}. Complete: ${result.isComplete}`);

        this.broadcast('tile_placed', {
          tileIndex: availableId,
          slotIndex: result.frameSlotIndex,
          sessionId: client.sessionId,
          isComplete: result.isComplete,
        });

        // Spawn logic
        if (!result.isComplete) {
          this.spawnNextTile(result.frameSlotIndex);
        } else {
          this.spawnNextTile();
        }

        // Save room state and update all-time leaderboard
        this.saveCurrentRoomState();
        this.updateAllTimeLeaderboard(player.displayName, 1);
      } else {
        const reason = 'invalid_placement';
        console.log(`[FRAME] Player ${client.sessionId} (${player.displayName}) failed to place tile ${availableId} - reason: ${reason}`);
        client.send('placement_failed', { reason });
      }
    });

    // Fork attack (melee attack on another player)
    this.onMessage('fork_attack', (client, message) => {
      const attacker = this.state.getPlayer(client.sessionId);
      const target = this.state.getPlayer(message.targetSessionId);

      if (!attacker || !target) {
        console.warn(`[COMBAT] Fork attack failed: attacker or target not found`);
        return;
      }

      // Verify that attacker and target are close enough (anti-cheat)
      const distance = Math.sqrt(
        Math.pow(attacker.position.x - target.position.x, 2) +
        Math.pow(attacker.position.y - target.position.y, 2) +
        Math.pow(attacker.position.z - target.position.z, 2)
      );

      // Max attack range (fork length + player size, roughly 10 units)
      if (distance > 10) {
        console.warn(`[COMBAT] Fork attack rejected: distance too far (${distance.toFixed(2)})`);
        return;
      }

      // Apply damage
      this.applyDamage(target, PLAYER_CONFIG.forkDamage, client.sessionId);
    });

    // Manual respawn request (from ESC menu)
    this.onMessage('respawn', (client) => {
      const player = this.state.getPlayer(client.sessionId);
      if (!player) {
        console.warn(`[RESPAWN] Player ${client.sessionId} not found`);
        return;
      }

      console.log(`[RESPAWN] Player ${client.sessionId} requested manual respawn`);
      this.respawnPlayer(player);
    });

    // Ping/pong for latency measurement (client sends timestamp, server echoes it back)
    this.onMessage('ping', (client, message: { timestamp: number }) => {
      client.send('pong', { timestamp: message.timestamp });
    });
  }

  /**
   * Physics update loop (called 30x per second - OPTIMIZED from 60Hz)
   */
  private updatePhysics(deltaTime: number): void {
    const updateStartTime = performance.now();

    // Process spawn queue gradually (PERFORMANCE OPTIMIZATION)
    // Spreads physics body creation across frames to prevent spikes
    this.processSpawnQueue();

    // Step Havok physics simulation (handles collisions and bouncing)
    const physicsStepStart = performance.now();
    this.physicsWorld.step(deltaTime / 1000);
    const physicsStepTime = performance.now() - physicsStepStart;

    // Check for goal trigger collisions (manual check needed for ANIMATED tiles)
    const goalTriggersStart = performance.now();
    this.physicsWorld.checkGoalTriggers();
    const goalTriggersTime = performance.now() - goalTriggersStart;

    // Sync physics positions and rotations back to Colyseus state
    // BANDWIDTH OPTIMIZATION: Only sync position if changed significantly
    const playerSyncStart = performance.now();
    const posThreshold = PhysicsConstants.POSITION_SYNC_THRESHOLD;

    this.state.players.forEach((player) => {
      // Car rotation is now controlled by steering physics (angular velocity)
      // Camera rotation (player.rotation) does NOT affect car direction

      const physicsPos = this.physicsWorld.getPlayerPosition(player.sessionId);
      if (physicsPos) {
        // Only sync if position changed significantly (reduces idle player traffic)
        const posChanged =
          Math.abs(player.position.x - physicsPos.x) > posThreshold ||
          Math.abs(player.position.y - physicsPos.y) > posThreshold ||
          Math.abs(player.position.z - physicsPos.z) > posThreshold;

        if (posChanged) {
          player.position.x = physicsPos.x;
          player.position.y = physicsPos.y;
          player.position.z = physicsPos.z;
        }
      }

      // Sync body rotation (now includes Y-rotation from camera)
      // NOTE: No threshold for player rotation - users expect immediate response
      // Threshold is only used for tiles where physics jitter is the concern
      const physicsRot = this.physicsWorld.getPlayerRotation(player.sessionId);
      if (physicsRot) {
        player.bodyRotation.set(physicsRot.x, physicsRot.y, physicsRot.z, physicsRot.w);
      }

      // Sync steering value for wheel animation
      player.steering = this.physicsWorld.getPlayerSteering(player.sessionId);

      // RAILGUARD: Clamp player position if out of bounds
      this.clampPlayerToBounds(player);
    });
    const playerSyncTime = performance.now() - playerSyncStart;

    // Update tiles attached to player (LOCKED for puzzle, CHARGING for shooting)
    // Both states follow player position - unified server-side attachment
    const heldTileUpdateStart = performance.now();
    this.state.tiles.forEach((tile) => {
      const shouldFollowPlayer =
        (tile.state === TileState.LOCKED || tile.state === TileState.CHARGING)
        && tile.ownedBy;

      if (shouldFollowPlayer && tile.ownedBy) {
        const player = this.state.getPlayer(tile.ownedBy);
        if (player) {
          // UNIFIED POSITION CALCULATION for both LOCKED and CHARGING
          // Use TILE_ATTACH_POINT from shared config to place tile between forks

          // Reuse offset vector (avoid GC pressure)
          this._heldTileOffset.set(
            TILE_ATTACH_POINT.x,
            TILE_ATTACH_POINT.y,
            TILE_ATTACH_POINT.z
          );

          // Reuse quaternion from player rotation
          this._playerQuat.set(
            player.bodyRotation.x,
            player.bodyRotation.y,
            player.bodyRotation.z,
            player.bodyRotation.w
          );

          // Rotate offset by player rotation
          // applyRotationQuaternionInPlace modifies the vector in place
          this._heldTileOffset.applyRotationQuaternionInPlace(this._playerQuat);

          // Calculate new position
          const newX = player.position.x + this._heldTileOffset.x;
          const newY = player.position.y + this._heldTileOffset.y;
          const newZ = player.position.z + this._heldTileOffset.z;

          // Update schema position (batched via .set() method)
          tile.position.set(newX, newY, newZ);

          // Update tile rotation to match player rotation
          tile.rotation.set(
            player.bodyRotation.x,
            player.bodyRotation.y,
            player.bodyRotation.z,
            player.bodyRotation.w
          );

          // NOTE: We DO update physics body position here to keep it in sync
          // This ensures the physics body is always at the "held" position
          // Use disablePreStep for instant position control (no interpolation)

          // Move tile using position control (DYNAMIC + disablePreStep=false)
          // This gives instant position sync without motion type switching
          this.physicsWorld.moveTileHeld(
            tile.availableId,
            { x: newX, y: newY, z: newZ },
            tile.rotation
          );

          // Auto-release logic ONLY for CHARGING state
          if (tile.state === TileState.CHARGING) {
            const chargeDuration = tile.chargingStartTime ? Date.now() - tile.chargingStartTime : 0;
            if (chargeDuration >= MAX_CHARGE_TIME) {
              // Shoot in player's facing direction with max strength
              this.shootTile(tile.availableId, tile.ownedBy, undefined, MAX_STRENGTH, 'auto');
            }
          }
        }
      }
    });
    const heldTileUpdateTime = performance.now() - heldTileUpdateStart;

    // Ensure tile bodies exist for tiles that need physics
    // ON_FLOOR: normal physics simulation
    // LOCKED/CHARGING: kinematic-like (position controlled, but still has collision)
    // PLACED: no physics body needed (static in frame)


    const linearVelocity = Vector3.Zero();
    const angularVelocity = Vector3.Zero();

    // Sync tile transforms from physics back into state
    const tileSyncStart = performance.now();
    this.physicsWorld.forEachTileBody((availableId, data) => {
      // Physics bodies are keyed by availableId
      const tile = this.state.getTile(availableId);
      if (!tile) {
        this.physicsWorld.removeTileBody(availableId);
        return;
      }

      // Skip physics sync for PLACED tiles (should never happen as tiles are removed when placed)
      if (tile.state === TileState.PLACED) {
        return;
      }

      // Skip physics sync for LOCKED/CHARGING tiles (position controlled by "follow player" logic)
      if (tile.state === TileState.LOCKED || tile.state === TileState.CHARGING) {
        return;
      }

      // BANDWIDTH OPTIMIZATION: Check sleep state FIRST to skip sync for sleeping tiles
      // ~80% of tiles are sleeping, so this skips most position/rotation updates
      data.body.getLinearVelocityToRef(linearVelocity);
      data.body.getAngularVelocityToRef(angularVelocity);

      const isSleeping =
        linearVelocity.lengthSquared() < PhysicsConstants.TILE_LINEAR_SLEEP_THRESHOLD_SQ &&
        angularVelocity.lengthSquared() < PhysicsConstants.TILE_ANGULAR_SLEEP_THRESHOLD_SQ;

      const wasSleeping = tile.isSleeping;
      tile.isSleeping = isSleeping;

      // Skip position/rotation sync if tile was already sleeping and still is
      // This eliminates ~80% of transform syncs for stationary tiles
      if (wasSleeping && isSleeping) {
        return;
      }

      // Sync position and rotation for active/newly-sleeping tiles
      const node = data.node;
      const posThreshold = PhysicsConstants.POSITION_SYNC_THRESHOLD;
      const posChanged =
        Math.abs(tile.position.x - node.position.x) > posThreshold ||
        Math.abs(tile.position.y - node.position.y) > posThreshold ||
        Math.abs(tile.position.z - node.position.z) > posThreshold;

      if (posChanged) {
        tile.position.set(node.position.x, node.position.y, node.position.z);
      }

      // BANDWIDTH OPTIMIZATION: Only sync rotation if changed significantly
      const rotThreshold = PhysicsConstants.ROTATION_SYNC_THRESHOLD;
      if (node.rotationQuaternion) {
        const rotChanged =
          Math.abs(tile.rotation.x - node.rotationQuaternion.x) > rotThreshold ||
          Math.abs(tile.rotation.y - node.rotationQuaternion.y) > rotThreshold ||
          Math.abs(tile.rotation.z - node.rotationQuaternion.z) > rotThreshold ||
          Math.abs(tile.rotation.w - node.rotationQuaternion.w) > rotThreshold;

        if (rotChanged) {
          tile.rotation.set(
            node.rotationQuaternion.x,
            node.rotationQuaternion.y,
            node.rotationQuaternion.z,
            node.rotationQuaternion.w
          );
        }
      }

      // BANDWIDTH OPTIMIZATION: Only sync velocity if changed significantly
      const velThreshold = PhysicsConstants.VELOCITY_SYNC_THRESHOLD;
      const angVelThreshold = PhysicsConstants.ANGULAR_VELOCITY_SYNC_THRESHOLD;

      const linearChanged =
        Math.abs(tile.velocity.x - linearVelocity.x) > velThreshold ||
        Math.abs(tile.velocity.y - linearVelocity.y) > velThreshold ||
        Math.abs(tile.velocity.z - linearVelocity.z) > velThreshold;

      const angularChanged =
        Math.abs(tile.angularVelocity.x - angularVelocity.x) > angVelThreshold ||
        Math.abs(tile.angularVelocity.y - angularVelocity.y) > angVelThreshold ||
        Math.abs(tile.angularVelocity.z - angularVelocity.z) > angVelThreshold;

      if (linearChanged) {
        tile.velocity.set(linearVelocity.x, linearVelocity.y, linearVelocity.z);
      }
      if (angularChanged) {
        tile.angularVelocity.set(angularVelocity.x, angularVelocity.y, angularVelocity.z);
      }

      if (!isSleeping) {
        tile.updatePhysics();
      }

      // RAILGUARD: Clamp tile position if out of bounds
      this.clampTileToBounds(tile, availableId);
    });
    const tileSyncTime = performance.now() - tileSyncStart;

    // Note: Fly animation is now client-side (removed server-side animation loop)
    // Client receives tile_placed message and animates locally

    const totalUpdateTime = performance.now() - updateStartTime;

    // Track timing samples (keep last 60 frames = 2 seconds @ 30Hz)
    this.physicsTimeSamples.push(physicsStepTime);
    if (this.physicsTimeSamples.length > 60) {
      this.physicsTimeSamples.shift();
    }

    this.frameTimeSamples.push(totalUpdateTime);
    if (this.frameTimeSamples.length > 60) {
      this.frameTimeSamples.shift();
    }

    // Periodic cleanup of expired tileDamageCooldowns (every 60 frames = 2 sec @ 30Hz)
    // Prevents memory leak from accumulated cooldown entries
    if (this.updatePhysicsFrameCount % 60 === 0) {
      const now = Date.now();
      for (const [key, expiry] of this.tileDamageCooldowns) {
        if (now > expiry) this.tileDamageCooldowns.delete(key);
      }
    }

    // Track frame count for metrics (verbose logging removed - use PM2 monitoring instead)
    this.updatePhysicsFrameCount++;
  }

  /**
   * Setup goal trigger collision callbacks
   * Registers callback with PhysicsWorld for goal trigger detection
   */
  private setupGoalTriggers(): void {
    // Register callback with PhysicsWorld's goal trigger system
    // This handles both observable-based and manual check-based detection
    this.physicsWorld.setGoalTriggerCallback((event) => {
      const { goalName, tileIndex } = event;

      // Determine which goal was scored based on goal name
      if (goalName.includes('blue_goal')) {
        this.handleGoalScored('blue', tileIndex);
      } else if (goalName.includes('red_goal')) {
        this.handleGoalScored('red', tileIndex);
      }
    });

    console.log('[GOAL] Goal trigger collision callbacks setup complete');
  }

  /**
   * Setup tile-player collision detection for combat system
   * Registers callback with PhysicsWorld for tile-player collision detection
   */
  private setupTilePlayerCollisions(): void {
    this.physicsWorld.setTilePlayerCollisionCallback((event) => {
      const { tileIndex, playerSessionId, impactVelocity } = event;
      const player = this.state.getPlayer(playerSessionId);

      if (!player) return;

      // Check cooldown - prevent same tile from damaging same player multiple times
      const cooldownKey = `${tileIndex}-${playerSessionId}`;
      const now = Date.now();
      const cooldownExpiry = this.tileDamageCooldowns.get(cooldownKey);

      if (cooldownExpiry && now < cooldownExpiry) {
        // Still in cooldown, skip damage
        return;
      }

      // Set cooldown for this tile-player pair
      this.tileDamageCooldowns.set(cooldownKey, now + this.TILE_DAMAGE_COOLDOWN_MS);

      // Scale damage based on impact velocity
      // Base damage at threshold velocity, max damage at high velocity (100+ unit/s)
      const velocityScale = Math.min(impactVelocity / 100, 1.0); // Cap at 1.0 (100%)
      const damage = PLAYER_CONFIG.tileDamage * velocityScale;

      console.log(`[COMBAT] Tile ${tileIndex} hit player ${playerSessionId} for ${damage.toFixed(1)} damage (velocity: ${impactVelocity.toFixed(2)})`);

      // Apply damage
      this.applyDamage(player, damage, 'tile');
    });

    console.log('[COMBAT] Tile-player collision callbacks setup complete');
  }

  /**
   * Apply damage to a player
   * @param player The player to damage
   * @param damage Amount of damage to apply
   * @param source Source of damage (sessionId of attacker or 'tile')
   */
  private applyDamage(player: PlayerSchema, damage: number, source: string): void {
    // Players are immune to damage while solving a puzzle
    if (player.state === PlayerState.SOLVING_PUZZLE) {
      return;
    }

    player.health = Math.max(0, player.health - damage);

    console.log(`[COMBAT] Player ${player.sessionId} took ${damage.toFixed(1)} damage from ${source}. Health: ${player.health.toFixed(1)}/${PLAYER_CONFIG.maxHealth}`);

    // Check if player died
    if (player.health <= 0) {
      this.handlePlayerDeath(player, source);
    }
  }

  /**
   * Handle player death
   * @param player The player who died
   * @param killer Source of death (sessionId of killer or 'tile')
   */
  private handlePlayerDeath(player: PlayerSchema, killer: string): void {
    console.log(`[COMBAT] Player ${player.sessionId} died. Killed by: ${killer}`);

    // Immediately mark as dead and remove physics body
    player.isDead = true;
    this.physicsWorld.removePlayerBody(player.sessionId);

    // Respawn player after a delay
    this.clock.setTimeout(() => {
      this.respawnPlayer(player);
    }, 3000); // 3 second respawn delay
  }

  /**
   * Respawn player at random position with full health
   * @param player The player to respawn
   */
  private respawnPlayer(player: PlayerSchema): void {
    // Reset health and mark as alive
    player.health = PLAYER_CONFIG.maxHealth;
    player.isDead = false;

    // Random spawn position
    const floorWidth = FLOOR_CONFIG.width;
    const floorLength = FLOOR_CONFIG.length;
    const spawnPadding = 0.8;

    const x = (Math.random() - 0.5) * floorWidth * spawnPadding;
    const y = PLAYER_CONFIG.spawnHeight; // Drop from sky
    const z = (Math.random() - 0.5) * floorLength * spawnPadding;

    player.position.set(x, y, z);
    player.rotation = Math.random() * Math.PI * 2;

    // Create physics body at new position (was removed in handlePlayerDeath)
    this.physicsWorld.createPlayerBody(player.sessionId, { x, y, z });

    console.log(`[COMBAT] Player ${player.sessionId} respawned at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
  }

  /**
   * Handle goal scored by a tile
   * @param goalName - 'blue' or 'red'
   * @param tileIndex - Index of the tile that scored
   */
  private handleGoalScored(goalName: 'blue' | 'red', tileIndex: number): void {
    // Debounce: Check if this tile already scored in this goal
    if (!this.tilesScored.has(tileIndex)) {
      this.tilesScored.set(tileIndex, new Set());
    }

    const tileGoals = this.tilesScored.get(tileIndex)!;
    const fullGoalName = goalName === 'blue' ? 'blue_goal_trigger' : 'red_goal_trigger';

    if (tileGoals.has(fullGoalName)) {
      // Already scored in this goal, ignore duplicate
      return;
    }

    // Mark this tile as having scored in this goal
    tileGoals.add(fullGoalName);

    // Increment appropriate goal score
    if (goalName === 'blue') {
      this.state.incrementBlueGoalScore();
    } else {
      this.state.incrementRedGoalScore();
    }

    const score = goalName === 'blue' ? this.state.blueGoalScore : this.state.redGoalScore;

    // Broadcast goal scored event
    this.broadcast('goal_scored', {
      goal: goalName,
      tileIndex: tileIndex,
      score: score,
    });

    // Save state after goal
    this.saveCurrentRoomState();

    console.log(`[GOAL] ${goalName.toUpperCase()} goal scored by tile ${tileIndex}! Score: ${score}`);
  }

  onJoin(client: Client, options: any) {
    const displayName = options.displayName || `Player${Math.floor(Math.random() * 10000)}`;
    const playerToken = options.playerToken;

    console.log(`[JOIN] Player ${client.sessionId}(${displayName}) attempting to join...`);

    // Check for duplicate name (case-insensitive)
    const nameLower = displayName.toLowerCase();
    let duplicateFound = false;
    this.state.players.forEach((player) => {
      if (player.displayName.toLowerCase() === nameLower) {
        duplicateFound = true;
      }
    });

    if (duplicateFound) {
      console.log(`[JOIN] Rejected ${client.sessionId}: name "${displayName}" already in use`);
      throw new Error(`Name "${displayName}" is already in use. Please choose a different name.`);
    }

    console.log(`[JOIN] Player ${client.sessionId}(${displayName}) joined`);

    // Check for duplicate session (same browser, new tab)
    if (playerToken && this.activeTokens.has(playerToken)) {
      const oldSessionId = this.activeTokens.get(playerToken)!;
      const oldClient = this.clients.find((c) => c.sessionId === oldSessionId);
      if (oldClient) {
        console.log(`[JOIN] Duplicate session detected for token ${playerToken.slice(0, 8)}... - kicking old session ${oldSessionId}`);
        oldClient.leave(4001, 'Duplicate session - new tab opened');
      }
    }

    // Track this token
    if (playerToken) {
      this.activeTokens.set(playerToken, client.sessionId);
    }

    // Add player to game state
    const player = this.state.addPlayer(client.sessionId, displayName);

    // Restore player score if reconnecting
    const savedScore = this.savedPlayerScores.get(displayName);
    if (savedScore !== undefined) {
      player.tilesPlaced = savedScore;
      console.log(`[JOIN] Restored player ${displayName} score: ${savedScore} tiles placed`);

      // CRITICAL: Update leaderboard after restoring score
      // Without this, client sees stale leaderboard (score = 0) until next state change
      this.state.updateLeaderboard();
    }

    // Create physics body for player
    this.physicsWorld.createPlayerBody(client.sessionId, {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
    });

    // Send welcome message with player info
    client.send('joined', {
      sessionId: client.sessionId,
      player: player,
    });

    // Send initial slot fill states (derived from placedTiles)
    // Client uses this for initial state + tile_placed broadcasts for live updates
    const halfFilledSlots: number[] = [];
    const completeSlots: number[] = [];
    this.state.placedTiles.forEach((placedTile, key) => {
      const frameSlotIndex = parseInt(key, 10);
      if (placedTile.fillCount === 1) {
        halfFilledSlots.push(frameSlotIndex);
      } else if (placedTile.fillCount === 2) {
        completeSlots.push(frameSlotIndex);
      }
    });
    client.send('slot_states', { halfFilledSlots, completeSlots });

    console.log(`[JOIN] Total players: ${this.state.players.size}`);
  }

  async onLeave(client: Client, consented: boolean) {
    const player = this.state.getPlayer(client.sessionId);
    const playerName = player?.displayName || 'Unknown';

    console.log(`[LEAVE] Player ${client.sessionId}(${playerName}) left (consented: ${consented})`);

    // Immediately remove player on disconnect (no reconnection - simpler and safer)
    // Remove physics body
    this.physicsWorld.removePlayerBody(client.sessionId);

    // Clean up activeTokens to prevent memory leak
    for (const [token, sessionId] of this.activeTokens) {
      if (sessionId === client.sessionId) {
        this.activeTokens.delete(token);
        break;
      }
    }

    // Clean up tileDamageCooldowns to prevent memory leak
    const sessionId = client.sessionId;
    for (const key of this.tileDamageCooldowns.keys()) {
      if (key.endsWith(`-${sessionId}`)) {
        this.tileDamageCooldowns.delete(key);
      }
    }

    // Remove player from game state (also returns any tiles owned by this player to floor)
    this.state.removePlayer(client.sessionId);

    console.log(`[LEAVE] Total players: ${this.state.players.size} `);

    // Room stays alive even when empty (autoDispose = false) for state persistence
    if (this.state.players.size === 0) {
      console.log('[LEAVE] Room is now empty but staying alive for state persistence');
    }
  }

  /**
   * RAILGUARD: Clamp player position if out of world bounds
   * Teleports player back inside if they escape through walls/floor
   */
  private clampPlayerToBounds(player: PlayerSchema): void {
    let clamped = false;
    let newX = player.position.x;
    let newY = player.position.y;
    let newZ = player.position.z;

    // Clamp X
    if (newX < RAILGUARD_BOUNDS.minX) {
      newX = RAILGUARD_BOUNDS.minX;
      clamped = true;
    } else if (newX > RAILGUARD_BOUNDS.maxX) {
      newX = RAILGUARD_BOUNDS.maxX;
      clamped = true;
    }

    // Clamp Y (prevent falling through floor or going through ceiling)
    if (newY < RAILGUARD_BOUNDS.minY) {
      newY = RAILGUARD_BOUNDS.minY;
      clamped = true;
    } else if (newY > RAILGUARD_BOUNDS.maxY) {
      newY = RAILGUARD_BOUNDS.maxY;
      clamped = true;
    }

    // Clamp Z
    if (newZ < RAILGUARD_BOUNDS.minZ) {
      newZ = RAILGUARD_BOUNDS.minZ;
      clamped = true;
    } else if (newZ > RAILGUARD_BOUNDS.maxZ) {
      newZ = RAILGUARD_BOUNDS.maxZ;
      clamped = true;
    }

    if (clamped) {
      console.warn(`[RAILGUARD] Player ${player.sessionId} out of bounds at (${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)}) → clamped to (${newX.toFixed(1)}, ${newY.toFixed(1)}, ${newZ.toFixed(1)})`);
      player.position.set(newX, newY, newZ);

      // Also update physics body position to prevent it from bouncing back out
      // Remove and recreate physics body at new position
      this.physicsWorld.removePlayerBody(player.sessionId);
      this.physicsWorld.createPlayerBody(player.sessionId, { x: newX, y: newY, z: newZ });
    }
  }

  /**
   * RAILGUARD: Clamp tile position if out of world bounds
   * Teleports tile back inside if it escapes through walls/floor
   */
  private clampTileToBounds(tile: TileSchema, availableId: number): void {
    let clamped = false;
    let newX = tile.position.x;
    let newY = tile.position.y;
    let newZ = tile.position.z;

    // Clamp X
    if (newX < RAILGUARD_BOUNDS.minX) {
      newX = RAILGUARD_BOUNDS.minX;
      clamped = true;
    } else if (newX > RAILGUARD_BOUNDS.maxX) {
      newX = RAILGUARD_BOUNDS.maxX;
      clamped = true;
    }

    // Clamp Y (prevent falling through floor or going through ceiling)
    if (newY < RAILGUARD_BOUNDS.minY) {
      newY = RAILGUARD_BOUNDS.minY;
      clamped = true;
    } else if (newY > RAILGUARD_BOUNDS.maxY) {
      newY = RAILGUARD_BOUNDS.maxY;
      clamped = true;
    }

    // Clamp Z
    if (newZ < RAILGUARD_BOUNDS.minZ) {
      newZ = RAILGUARD_BOUNDS.minZ;
      clamped = true;
    } else if (newZ > RAILGUARD_BOUNDS.maxZ) {
      newZ = RAILGUARD_BOUNDS.maxZ;
      clamped = true;
    }

    if (clamped) {
      console.warn(`[RAILGUARD] Tile ${availableId} out of bounds at (${tile.position.x.toFixed(1)}, ${tile.position.y.toFixed(1)}, ${tile.position.z.toFixed(1)}) → clamped to (${newX.toFixed(1)}, ${newY.toFixed(1)}, ${newZ.toFixed(1)})`);
      tile.position.set(newX, newY, newZ);

      // Teleport physics body to new position
      this.physicsWorld.teleportTileBody(availableId, { x: newX, y: newY, z: newZ }, tile.rotation);
    }
  }

  onDispose() {
    console.log('GameRoom disposed');

    // Unregister from metrics collector
    metricsCollector.unregisterRoom(this.roomId);

    this.physicsWorld.dispose();
  }

  /**
   * Handle uncaught exceptions in room lifecycle methods
   * Covers: onCreate, onJoin, onLeave, onDispose, onMessage, setSimulationInterval, clock timers
   */
  onUncaughtException(
    error: RoomException<this>,
    methodName: 'onCreate' | 'onAuth' | 'onJoin' | 'onLeave' | 'onDispose' | 'onMessage' | 'setSimulationInterval' | 'setInterval' | 'setTimeout'
  ): void {
    // Log with context based on exception type
    if (error instanceof OnMessageException) {
      console.error(`[ERROR] Exception in onMessage handler "${error.type}":`, error.message);
      console.error(`  Client: ${error.client.sessionId}`);
      console.error(`  Payload:`, JSON.stringify(error.payload).slice(0, 200)); // Truncate large payloads
      console.error(`  Cause:`, error.cause);
    } else if (error instanceof OnJoinException) {
      console.error(`[ERROR] Exception in onJoin:`, error.message);
      console.error(`  Client: ${error.client.sessionId}`);
      console.error(`  Options:`, JSON.stringify(error.options).slice(0, 200));
      console.error(`  Cause:`, error.cause);
    } else if (error instanceof OnLeaveException) {
      console.error(`[ERROR] Exception in onLeave:`, error.message);
      console.error(`  Client: ${error.client.sessionId}`);
      console.error(`  Consented: ${error.consented}`);
      console.error(`  Cause:`, error.cause);
    } else if (error instanceof OnCreateException) {
      console.error(`[ERROR] Exception in onCreate:`, error.message);
      console.error(`  Options:`, JSON.stringify(error.options).slice(0, 200));
      console.error(`  Cause:`, error.cause);
    } else if (error instanceof OnDisposeException) {
      console.error(`[ERROR] Exception in onDispose:`, error.message);
      console.error(`  Cause:`, error.cause);
    } else if (error instanceof SimulationIntervalException) {
      console.error(`[ERROR] Exception in simulation interval (physics loop):`, error.message);
      console.error(`  Cause:`, error.cause);
    } else if (error instanceof TimedEventException) {
      console.error(`[ERROR] Exception in timed event (${methodName}):`, error.message);
      console.error(`  Args:`, error.args);
      console.error(`  Cause:`, error.cause);
    } else {
      // Fallback for any unknown exception type
      console.error(`[ERROR] Uncaught exception in ${methodName}:`, error.message);
      console.error(`  Cause:`, error.cause);
    }

    // Log stack trace for debugging
    if (error.stack) {
      console.error(`  Stack:`, error.stack);
    }
  }

  // ============================================================================
  // Public Metrics API (for PM2 monitoring)
  // ============================================================================

  /**
   * Get number of active tiles on floor (for PM2 metrics)
   */
  public getActiveTileCount(): number {
    let count = 0;
    this.state.tiles.forEach((tile) => {
      if (tile.state === TileState.ON_FLOOR) count++;
    });
    return count;
  }

  /**
   * Get size of unspawned tile pool (for PM2 metrics)
   */
  public getPoolSize(): number {
    return this.unspawnedTiles.size;
  }

  /**
   * Get average physics step time in ms (for PM2 metrics)
   */
  public getAvgPhysicsTime(): number {
    if (this.physicsTimeSamples.length === 0) return 0;
    return this.physicsTimeSamples.reduce((a, b) => a + b, 0) / this.physicsTimeSamples.length;
  }

  /**
   * Get average frame time in ms (for PM2 metrics)
   */
  public getAvgFrameTime(): number {
    if (this.frameTimeSamples.length === 0) return 0;
    return this.frameTimeSamples.reduce((a, b) => a + b, 0) / this.frameTimeSamples.length;
  }

  /**
   * Get current server FPS (for PM2 metrics)
   */
  public getCurrentFPS(): number {
    const avgFrameTime = this.getAvgFrameTime();
    return avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
  }
}
