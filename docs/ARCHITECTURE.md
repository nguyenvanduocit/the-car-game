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

```mermaid
graph TB
    subgraph Client["CLIENT (@blockgame/ui)"]
        BJS[BabylonJS<br/>Rendering]
        SS[StateSync<br/>Interpolation]
        PI[PlayerInput<br/>Controls]
    end

    subgraph Server["SERVER (@blockgame/server)"]
        GR[Colyseus<br/>GameRoom]
        PW[PhysicsWorld<br/>Havok]
        DB[SQLite DB<br/>Persistence]
    end

    subgraph Shared["@blockgame/shared"]
        Types[Types/Config]
    end

    Client <-->|WebSocket<br/>Colyseus| Server
    Client --> Shared
    Server --> Shared
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

```mermaid
graph TB
    subgraph GameRoom["GameRoom.ts"]
        subgraph State["GameRoomSchema"]
            players["players (Map)"]
            tiles["tiles (Map)"]
            placedTiles["placedTiles"]
            leaderboard["leaderboard"]
            goalScores["goalScores"]
        end

        subgraph Physics["PhysicsWorld"]
            playerBodies["playerBodies"]
            tileBodies["tileBodies"]
            boundaries["boundaries"]
            triggers["triggers"]
            step["step(dt)"]
        end

        subgraph DB["Database"]
            saveState["saveState()"]
            loadState["loadState()"]
            lb["leaderboard"]
        end

        subgraph Handlers["Message Handlers"]
            player_move["player_move → Car controls"]
            tile_click["tile_click → Lock tile, puzzle"]
            tile_charge["start_tile_charge → Charging"]
            tile_shoot["tile_shoot → Impulse, backforce"]
            puzzle_submit["puzzle_submit → Validate, place"]
            puzzle_cancel["puzzle_cancel → Release tile"]
            fork_attack["fork_attack → Melee attack"]
            respawn["respawn → Manual respawn"]
        end

        subgraph Loop["Update Loop (30Hz)"]
            step_physics["1. physicsWorld.step(dt)"]
            check_goals["2. checkGoalTriggers()"]
            sync_players["3. Sync player positions"]
            update_held["4. Update held tiles"]
            sync_tiles["5. Sync tile transforms"]
        end
    end
```

### State Schema Hierarchy

```mermaid
classDiagram
    class GameRoomSchema {
        +MapSchema~PlayerSchema~ players
        +MapSchema~TileSchema~ tiles
        +MapSchema~PlacedTileSchema~ placedTiles
        +ArraySchema~string~ frameSlots
        +ArraySchema~LeaderboardEntry~ leaderboard
        +number blueGoalScore
        +number redGoalScore
        +number createdAt
    }

    class PlayerSchema {
        +string sessionId
        +string displayName
        +Vector3Schema position
        +number rotation
        +QuaternionSchema bodyRotation
        +number steering
        +number health
        +boolean isDead
        +number tilesPlaced
        +PlayerState state
    }

    class TileSchema {
        +number availableId
        +number frameSlotIndex
        +uint8 phase
        +TileState state
        +Vector3Schema position
        +QuaternionSchema rotation
        +string ownedBy
    }

    class PlacedTileSchema {
        +number frameSlotIndex
        +uint8 fillCount
        +string completedBy
        +Vector3Schema position
        +QuaternionSchema rotation
    }

    GameRoomSchema --> PlayerSchema
    GameRoomSchema --> TileSchema
    GameRoomSchema --> PlacedTileSchema
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
│   │   ├── Vehicle.ts              # Vehicle renderer (monster truck)
│   │   ├── Tile.ts                 # Tile mesh with texture
│   │   ├── TilePool.ts             # Object pooling for tiles
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

```mermaid
graph TB
    subgraph Main["main.ts (BlockGame)"]
        subgraph Core["Core Components"]
            GameScene["GameScene<br/>engine, scene, camera"]
            ColyseusClient["ColyseusClient<br/>joinRoom(), send*()"]
            StateSync["StateSync<br/>room, players, tiles"]
        end

        subgraph Input["Input & Interaction"]
            PlayerInput["PlayerInput<br/>WASD, mouse"]
            Raycast["Raycast<br/>pickTile(), pointerLock"]
            Frame["Frame<br/>slots[], border, glow"]
        end

        subgraph RenderLoop["Render Loop (60fps)"]
            interp_players["1. interpolatePlayers()"]
            interp_tiles["2. interpolateTiles()"]
            reconcile["3. reconcileLocalPlayer()"]
            shadows["4. updateShadowCasters()"]
        end
    end
```

---

## Data Flow

### Player Movement Flow

```mermaid
sequenceDiagram
    participant PI as PlayerInput
    participant CC as ColyseusClient
    participant GR as GameRoom
    participant PW as PhysicsWorld
    participant SS as StateSync
    participant VR as VehicleRenderer

    PI->>PI: Capture WASD (throttle, steering)
    PI->>CC: sendMovement({direction, rotation})
    CC->>GR: player_move message
    GR->>PW: applyCarControls(throttle, steering)

    loop 30Hz Physics Loop
        PW->>PW: updatePlayerControls(dt)
        PW->>PW: Havok physics.step()
        GR->>GR: Sync physics → PlayerSchema
    end

    GR-->>SS: State broadcast (30Hz)
    SS->>VR: updateTargetPosition()

    loop 60fps Render
        VR->>VR: interpolate(deltaTime)
    end
```

### Tile Interaction Flow

```mermaid
flowchart TB
    subgraph UserActions["User Actions"]
        LC[Left Click<br/>Pick up tile]
        RC[Right Click<br/>Charge/Shoot]
        PS[Puzzle Submit]
    end

    subgraph Messages["Client Messages"]
        tile_click[tile_click<br/>availableId]
        start_charge[start_tile_charge<br/>availableId]
        tile_shoot[tile_shoot<br/>availableId, direction]
        puzzle_submit[puzzle_submit<br/>availableId, answerIndex]
    end

    subgraph States["Tile States"]
        LOCKED[LOCKED<br/>ownedBy = sessionId<br/>show puzzle]
        CHARGING[CHARGING<br/>ownedBy = sessionId<br/>chargingStart]
        PLACED[PLACED<br/>fly animation<br/>update leaderboard]
    end

    LC --> tile_click --> LOCKED
    RC --> start_charge --> CHARGING

    CHARGING -->|Hold > 2s| tile_shoot
    CHARGING -->|Mouse up| tile_shoot
    tile_shoot --> shootTile[shootTile<br/>returnToFloor<br/>applyImpulse<br/>backforce]

    PS --> puzzle_submit --> validate{Server validates}
    validate -->|Correct| PLACED
    validate -->|Wrong| shootTile
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
  $(player).position.onChange(() => updateTargetPosition());
  $(player).bodyRotation.onChange(() => updateTargetRotation());
  $(player).listen('steering', (value) => updateTargetSteering());
  $(player).listen('health', (value) => updateHealth());
});

// Available Tiles
$(room.state.tiles).onAdd((tile, availableId) => {
  $(tile).position.onChange(() => updateTilePosition());
  $(tile).rotation.onChange(() => updateTileRotation());
  $(tile).listen('state', (state) => updateTileState());
});

// Placed Tiles
$(room.state.placedTiles).onAdd((placedTile, frameSlotIndex) => {
  $(placedTile).listen('fillCount', (count) => updateFillState());
});
```

### Interpolation Strategy

```mermaid
graph LR
    Server[Server State<br/>30Hz] -->|Target Position| Interpolation
    Interpolation -->|Smooth Movement| Render[Render<br/>60fps]

    subgraph Interpolation["Exponential Smoothing"]
        formula["factor = 1 - exp(-speed * deltaTime)<br/>current += (target - current) * factor"]
    end
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

```mermaid
graph TB
    subgraph PhysicsWorld["PhysicsWorld.ts"]
        Engine["NullEngine (headless)"]
        Plugin["HavokPlugin (WASM)"]
        Rate["30 Hz (33.33ms/step)"]

        subgraph Static["Static Bodies"]
            ground["groundBody<br/>100x200 units, y=0"]
            walls["boundaryBodies<br/>4 walls + ceiling"]
            ramps["rampBodies<br/>2 launch pads"]
            arches["archBodies<br/>blue/red goals"]
            triggers["goalTriggers<br/>isTrigger=true"]
        end

        subgraph Dynamic["Dynamic Bodies"]
            players["playerBodies<br/>Box 1.5x2x2.5, mass=20<br/>Rear-biased CoM"]
            tiles["tileBodies<br/>Box 1.2x0.4x1.2, mass=12<br/>Max 50 active"]
        end
    end
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
