# BlockGame Architecture Overview

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Server Architecture](#server-architecture)
3. [Client Architecture](#client-architecture)
4. [Data Flow](#data-flow)
5. [State Synchronization](#state-synchronization)
6. [Physics Architecture](#physics-architecture)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BLOCKGAME ARCHITECTURE                        │
│                        (Server-Authoritative Model)                     │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐              ┌─────────────────────┐
│      CLIENT(s)      │              │       SERVER        │
│   @blockgame/ui     │◀────────────▶│   @blockgame/server │
│                     │   WebSocket  │                     │
│  ┌───────────────┐  │   (Colyseus) │  ┌───────────────┐  │
│  │   BabylonJS   │  │              │  │   Colyseus    │  │
│  │  (Rendering)  │  │              │  │   GameRoom    │  │
│  └───────────────┘  │              │  └───────────────┘  │
│  ┌───────────────┐  │              │  ┌───────────────┐  │
│  │   StateSync   │  │              │  │ PhysicsWorld  │  │
│  │(Interpolation)│  │              │  │   (Havok)     │  │
│  └───────────────┘  │              │  └───────────────┘  │
│  ┌───────────────┐  │              │  ┌───────────────┐  │
│  │  PlayerInput  │  │              │  │  SQLite DB    │  │
│  │  (Controls)   │  │              │  │ (Persistence) │  │
│  └───────────────┘  │              │  └───────────────┘  │
└─────────────────────┘              └─────────────────────┘
           │                                    │
           └────────────┬───────────────────────┘
                        │
              ┌─────────▼─────────┐
              │  @blockgame/shared│
              │   (Types/Config)  │
              └───────────────────┘
```

### Key Principles

| Principle | Description |
|-----------|-------------|
| **Server Authoritative** | Server owns ALL game state. Client renders server state. |
| **Single Source of Truth** | No client-side prediction for tiles. Server validates everything. |
| **Two-Spawn System** | 800 available tiles (0-799), each fills half of 400 frame slots. |
| **30Hz Physics** | Server runs Havok at 30Hz, syncs at 30Hz (patch rate). |

---

## Server Architecture

### Package Structure

```
packages/server/
├── src/
│   ├── index.ts                    # Entry point, Colyseus server setup
│   ├── config/
│   │   └── encoder.ts              # Encoder buffer configuration
│   ├── database/
│   │   ├── init.ts                 # SQLite initialization
│   │   ├── leaderboard.ts          # Leaderboard queries
│   │   └── roomState.ts            # Room state persistence
│   ├── monitoring/
│   │   ├── MetricsCollector.ts     # PM2 metrics aggregation
│   │   └── PM2Metrics.ts           # PM2 integration
│   ├── physics/
│   │   ├── PhysicsConstants.ts     # Physics tuning values
│   │   └── PhysicsWorld.ts         # Havok physics simulation
│   ├── rooms/
│   │   └── GameRoom.ts             # Main game room logic
│   ├── schema/
│   │   ├── GameRoomSchema.ts       # Root state schema
│   │   ├── PlayerSchema.ts         # Player state
│   │   ├── TileSchema.ts           # Available tile state
│   │   ├── PlacedTileSchema.ts     # Placed tile in frame
│   │   ├── LeaderboardSchema.ts    # Leaderboard entries
│   │   ├── Vector3Schema.ts        # 3D vector
│   │   ├── QuaternionSchema.ts     # Rotation quaternion
│   │   └── PuzzleConfigSchema.ts   # Puzzle configuration
│   └── utils/
│       └── PuzzleGenerator.ts      # Puzzle generation
```

### GameRoom Component Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│                           GameRoom.ts                                  │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐ │
│  │  GameRoomSchema  │    │   PhysicsWorld   │    │    Database     │ │
│  │                  │    │                  │    │                 │ │
│  │ • players (Map)  │    │ • playerBodies   │    │ • saveState()   │ │
│  │ • tiles (Map)    │    │ • tileBodies     │    │ • loadState()   │ │
│  │ • placedTiles    │    │ • boundaries     │    │ • leaderboard   │ │
│  │ • leaderboard    │    │ • triggers       │    │                 │ │
│  │ • goalScores     │    │ • step(dt)       │    └─────────────────┘ │
│  └──────────────────┘    └──────────────────┘                        │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Message Handlers                              │ │
│  ├─────────────────────────────────────────────────────────────────┤ │
│  │ • player_move      → Apply car controls (throttle + steering)   │ │
│  │ • tile_click       → Lock tile, send puzzle                     │ │
│  │ • start_tile_charge→ Start charging for shoot                   │ │
│  │ • tile_shoot       → Apply impulse, backforce                   │ │
│  │ • puzzle_submit    → Validate answer, place tile                │ │
│  │ • puzzle_cancel    → Release tile, shoot away                   │ │
│  │ • fork_attack      → Combat melee attack                        │ │
│  │ • respawn          → Manual respawn request                     │ │
│  │ • ping             → Latency measurement                        │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Update Loop (30Hz)                            │ │
│  ├─────────────────────────────────────────────────────────────────┤ │
│  │ updatePhysics(deltaTime):                                        │ │
│  │   1. physicsWorld.step(dt)        # Havok simulation            │ │
│  │   2. checkGoalTriggers()          # Goal scoring                │ │
│  │   3. Sync player positions        # Physics → Schema            │ │
│  │   4. Update held tiles            # Follow player position      │ │
│  │   5. Sync tile transforms         # Physics → Schema            │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

### State Schema Hierarchy

```
GameRoomSchema (Root)
│
├── players: MapSchema<PlayerSchema>
│   ├── sessionId: string
│   ├── displayName: string
│   ├── position: Vector3Schema { x, y, z }
│   ├── rotation: number (camera Y-axis)
│   ├── bodyRotation: QuaternionSchema { x, y, z, w }
│   ├── steering: number (-1 to 1)
│   ├── health: number
│   ├── isDead: boolean
│   ├── tilesPlaced: number
│   └── state: PlayerState enum
│
├── tiles: MapSchema<TileSchema>  (Available tiles on floor)
│   ├── availableId: number (0-799, PRIMARY KEY)
│   ├── frameSlotIndex: number (0-399, target slot)
│   ├── phase: uint8 (1 = first half, 2 = second half)
│   ├── state: TileState enum (ON_FLOOR, LOCKED, CHARGING)
│   ├── position: Vector3Schema
│   ├── rotation: QuaternionSchema
│   └── ownedBy: string | null (sessionId)
│
├── placedTiles: MapSchema<PlacedTileSchema>  (Tiles in frame)
│   ├── frameSlotIndex: number (0-399, PRIMARY KEY)
│   ├── fillCount: uint8 (1 = half, 2 = complete)
│   ├── completedBy: string (player names)
│   ├── position: Vector3Schema
│   └── rotation: QuaternionSchema
│
├── frameSlots: ArraySchema<string> (400 slots, "" = empty)
│
├── leaderboard: ArraySchema<LeaderboardEntrySchema>
├── allTimeLeaderboard: ArraySchema<AllTimeLeaderboardEntrySchema>
│
├── blueGoalScore: number
├── redGoalScore: number
└── createdAt: number
```

---

## Client Architecture

### Package Structure

```
packages/ui/
├── src/
│   ├── main.ts                     # Entry point, BlockGame class
│   ├── game/
│   │   ├── Scene.ts                # BabylonJS scene setup
│   │   ├── Camera.ts               # Third-person ArcRotate camera
│   │   ├── Floor.ts                # Ground rendering
│   │   ├── Frame.ts                # Picture frame rendering
│   │   ├── Physics.ts              # Client-side prediction physics
│   │   ├── Player.ts               # Player mesh (legacy)
│   │   ├── Vehicle.ts              # Vehicle renderer (monster truck)
│   │   ├── Tile.ts                 # Tile mesh with texture
│   │   ├── TilePool.ts             # Object pooling for tiles
│   │   ├── TileMasterMesh.ts       # Instanced tile rendering
│   │   ├── Raycast.ts              # Click detection
│   │   ├── PlayerInput.ts          # WASD/mouse controls
│   │   ├── Sound.ts                # Sound effects
│   │   ├── Scoreboard.ts           # Goal score display
│   │   └── LeaderboardWall.ts      # 3D leaderboard in world
│   ├── gui/
│   │   ├── NameInputGUI.ts         # Login screen
│   │   ├── LeaderboardGUI.ts       # 2D leaderboard overlay
│   │   ├── GameCompleteGUI.ts      # Victory screen
│   │   ├── CompassGUI.ts           # Direction compass
│   │   ├── PlayGuideGUI.ts         # Help/tutorial
│   │   ├── HelpGUI.ts              # Controls help
│   │   ├── EscMenuGUI.ts           # Escape menu
│   │   ├── DisconnectGUI.ts        # Disconnect overlay
│   │   └── DeathCountdownGUI.ts    # Respawn countdown
│   ├── network/
│   │   ├── ColyseusClient.ts       # WebSocket connection
│   │   └── StateSync.ts            # State → Rendering sync
│   └── puzzles/
│       ├── MultipleChoiceGUI.ts    # Quiz puzzle UI
│       └── MemoryCardsGUI.ts       # Memory game UI
```

### Client Component Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│                              main.ts                                   │
│                           (BlockGame class)                            │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │
│  │  GameScene   │  │ColyseusClient│  │   StateSync  │                │
│  │              │  │              │  │              │                │
│  │ • engine     │  │ • client     │  │ • room       │                │
│  │ • scene      │  │ • room       │  │ • players    │                │
│  │ • camera     │  │ • connected  │  │ • tiles      │                │
│  │ • floor      │  │              │  │ • localPlayer│                │
│  │ • physics    │  │ • joinRoom() │  │              │                │
│  │ • sound      │  │ • send*()    │  │ • interp()   │                │
│  └──────────────┘  └──────────────┘  └──────────────┘                │
│                                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │
│  │ PlayerInput  │  │   Raycast    │  │    Frame     │                │
│  │              │  │              │  │              │                │
│  │ • WASD       │  │ • pickTile() │  │ • slots[]    │                │
│  │ • mouse      │  │ • pickSlot() │  │ • border     │                │
│  │ • throttle   │  │ • pointerLock│  │ • glow       │                │
│  │ • steering   │  │              │  │              │                │
│  └──────────────┘  └──────────────┘  └──────────────┘                │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                     Render Loop (60fps)                         │  │
│  ├────────────────────────────────────────────────────────────────┤  │
│  │ onBeforeRender:                                                 │  │
│  │   1. interpolatePlayers()      # Smooth position/rotation      │  │
│  │   2. interpolateTiles()        # Smooth tile transforms        │  │
│  │   3. reconcileLocalPlayer()    # Camera follows mesh           │  │
│  │   4. updateShadowCasters()     # Distance-based shadow culling │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Player Movement Flow

```
CLIENT                                          SERVER
──────                                          ──────

1. PlayerInput captures WASD
   └─▶ throttle: -1 to 1 (W/S)
   └─▶ steering: -1 to 1 (A/D)
                    │
                    ▼
2. ColyseusClient.sendMovement()
   └─▶ { direction: {x: throttle, z: steering}, rotation }
                    │
         ──────────┼────────────▶
                    │
                    ▼
                                3. GameRoom.onMessage('player_move')
                                   └─▶ physicsWorld.applyCarControls()
                                                    │
                                                    ▼
                                4. updatePhysics() (30Hz)
                                   ├─▶ updatePlayerControls(dt)
                                   │   ├─▶ Steering momentum (smooth turn)
                                   │   └─▶ Throttle force (forward/back)
                                   └─▶ Havok physics.step()
                                                    │
                                                    ▼
                                5. Sync physics → PlayerSchema
                                   ├─▶ position = body.position
                                   └─▶ bodyRotation = body.quaternion
                                                    │
         ◀──────────┼────────────
                    │
                    ▼
6. StateSync receives onChange
   └─▶ player.updateTargetPosition()
                    │
                    ▼
7. Render loop interpolation
   └─▶ localPlayer.interpolate(1.0)  # Instant (no lag)
   └─▶ remotePlayer.interpolate(0.4) # Smooth lerp
                    │
                    ▼
8. Camera follows mesh
   └─▶ gameCamera.setPosition(meshPos)
```

### Tile Interaction Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Left Click     │     │  Right Click    │     │ Puzzle Complete │
│  (Pick up tile) │     │  (Charge/Shoot) │     │  (Auto-place)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ tile_click      │     │ start_tile_charge│     │ puzzle_submit   │
│ availableId     │     │ availableId      │     │ availableId,    │
│                 │     │                  │     │ answerIndex     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ TileState.LOCKED│     │TileState.CHARGING│    │  Server         │
│ • ownedBy = sid │     │ • ownedBy = sid  │     │  validates      │
│ • show puzzle   │     │ • chargingStart  │     │  QuestionBank   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │               ┌───────┴───────┐               ▼
         │               ▼               ▼       ┌───────────────┐
         │      ┌────────────┐  ┌────────────┐  │ Correct?      │
         │      │ Hold (auto)│  │tile_shoot  │  │               │
         │      │ > 2 sec    │  │(mouse up)  │  │ YES → PLACED  │
         │      │ auto-shoot │  │            │  │ NO  → shootTile│
         │      └─────┬──────┘  └─────┬──────┘  └───────┬───────┘
         │            │               │                 │
         │            └───────┬───────┘                 │
         │                    ▼                         │
         │           ┌────────────────┐                 │
         │           │  shootTile()   │                 │
         │           │ • returnToFloor│                 │
         │           │ • applyImpulse │                 │
         │           │ • backforce    │                 │
         │           └────────────────┘                 │
         │                                              │
         ▼                                              ▼
┌─────────────────────────────┐    ┌─────────────────────────────┐
│ LOCKED/CHARGING: tile       │    │ PLACED: Client fly animation│
│ follows player position     │    │ • Remove from tiles map     │
│ via updatePhysics() loop    │    │ • Add to placedTiles map    │
│                             │    │ • Update leaderboard        │
└─────────────────────────────┘    └─────────────────────────────┘
```

---

## State Synchronization

### Colyseus Patch Rate

| Setting | Value | Description |
|---------|-------|-------------|
| Server Physics | **30 Hz** | `setSimulationInterval(cb, 33.33ms)` |
| Patch Rate | **30 Hz** | `setPatchRate(33.33ms)` |
| Client Interpolation | Per frame | `scene.onBeforeRenderObservable` |

### State Change Listeners (Client)

```typescript
// Colyseus v0.16+ API (REQUIRED - old API doesn't work)
const $ = getStateCallbacks(room);

// Players
$(room.state.players).onAdd((player, sessionId) => {
  // Create VehicleRenderer
  $(player).position.onChange(() => updateTargetPosition());
  $(player).bodyRotation.onChange(() => updateTargetRotation());
  $(player).listen('steering', (value) => updateTargetSteering());
  $(player).listen('health', (value) => updateHealth());
});

// Available Tiles
$(room.state.tiles).onAdd((tile, availableId) => {
  // Acquire from TilePool
  $(tile).position.onChange(() => updateTilePosition());
  $(tile).rotation.onChange(() => updateTileRotation());
  $(tile).listen('state', (state) => updateTileState());
});

// Placed Tiles
$(room.state.placedTiles).onAdd((placedTile, frameSlotIndex) => {
  // Create tile in frame
  $(placedTile).listen('fillCount', (count) => updateFillState());
});

// Goal scores
$(room.state).listen('blueGoalScore', (score) => updateScoreboard());
$(room.state).listen('redGoalScore', (score) => updateScoreboard());
```

### Interpolation Strategy

The client uses **exponential smoothing** with `deltaTime` for frame-rate independent interpolation.

```typescript
// Frame-rate independent exponential smoothing
const factor = 1 - Math.exp(-smoothingSpeed * deltaTime);
currentPosition += (targetPosition - currentPosition) * factor;
```

| Entity | Smoothing Speed | Feel |
|--------|-----------------|------|
| Local player position | 18/sec | Very responsive |
| Remote player position | 12/sec | Smooth |
| Rotation (all) | 15/sec | Medium |
| Steering (wheels) | 20/sec | Responsive |
| Tiles | 15/sec | Medium |

---

## Physics Architecture

### Server Physics (Authoritative)

```
┌───────────────────────────────────────────────────────────────────────┐
│                    SERVER PHYSICS (PhysicsWorld.ts)                    │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Engine: NullEngine (headless BabylonJS)                               │
│  Plugin: HavokPlugin (WASM physics)                                    │
│  Rate:   30 Hz (33.33ms per step)                                      │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                    Static Bodies                                │   │
│  ├────────────────────────────────────────────────────────────────┤   │
│  │ • groundBody     - 100x200 units, y=0                          │   │
│  │ • boundaryBodies - 4 walls (N/S/E/W) + ceiling                 │   │
│  │ • rampBodies     - 2 ramps (launch pads)                       │   │
│  │ • archBodies     - 2 goals (blue/red posts+crossbar)           │   │
│  │ • goalTriggers   - 2 trigger volumes (isTrigger=true)          │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                    Dynamic Bodies                               │   │
│  ├────────────────────────────────────────────────────────────────┤   │
│  │ • playerBodies   - Box shape (1.5x2x2.5), mass=20              │   │
│  │                    Rear-biased center of mass for steering     │   │
│  │                                                                 │   │
│  │ • tileBodies     - Box shape (1.2x0.4x1.2), mass=12            │   │
│  │                    Only active tiles have bodies (max 50)      │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘
```

### Physics Constants

```typescript
// Server tick rates
PHYSICS_SIMULATION_RATE: 30    // Hz
STATE_PATCH_RATE: 30           // Hz

// Player vehicle physics
PLAYER_MASS: 20.0
PLAYER_MOVEMENT_FORCE: 1000.0
PLAYER_MAX_SPEED: 25.0
PLAYER_LINEAR_DAMPING: 0.5
PLAYER_ANGULAR_DAMPING: 2.0
PLAYER_STEERING_SPEED: 2.0      // Radians/sec
PLAYER_MAX_STEERING_ANGLE: 1.5  // Max turn rate

// Tile physics
TILE_MASS: 12.0
TILE_FRICTION: 0.3
TILE_RESTITUTION: 0.15

// Shooting mechanics
IMPULSE_BASE: 10                // Min impulse (strength=1)
IMPULSE_MAX: 3000               // Max impulse (strength=100)
BACKFORCE_BASE: 9               // Min recoil
BACKFORCE_MAX: 1000             // Max recoil

// Combat
MIN_SHOT_VELOCITY_FOR_DAMAGE: 20.0  // units/s threshold
```

---

## Key File Locations

| Component | File |
|-----------|------|
| Game room logic | `packages/server/src/rooms/GameRoom.ts` |
| Physics simulation | `packages/server/src/physics/PhysicsWorld.ts` |
| State schema | `packages/server/src/schema/GameRoomSchema.ts` |
| Client scene | `packages/ui/src/game/Scene.ts` |
| State sync | `packages/ui/src/network/StateSync.ts` |
| World config | `packages/shared/src/config/world.ts` |
| Physics constants | `packages/server/src/physics/PhysicsConstants.ts` |
