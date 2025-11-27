# BlockGame - Complete Game Logic Documentation

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Server Game Room Logic](#server-game-room-logic)
3. [Physics System](#physics-system)
4. [Client Game Entities](#client-game-entities)
5. [Network & State Synchronization](#network--state-synchronization)
6. [Shared Types & Configuration](#shared-types--configuration)
7. [Puzzles System](#puzzles-system)
8. [GUI Components](#gui-components)
9. [Data Flow & Communication Patterns](#data-flow--communication-patterns)

---

## Architecture Overview

### Server-Authoritative Design

```mermaid
graph LR
    subgraph Client
        Input[User Input]
        Render[Rendering]
    end

    subgraph Server
        State[Game State]
        Physics[Physics]
        Validation[Validation]
    end

    Input -->|Messages| Server
    Server -->|State Sync| Render
    Physics --> State
    Validation --> State
```

**Server Responsibilities:**
- Owns and controls ALL game state (players, tiles, frame, leaderboard)
- Validates ALL client actions (tile clicks, puzzle results, frame placement)
- Runs physics simulation at 30Hz using BabylonJS Havok on NullEngine
- Broadcasts state changes to all clients via Colyseus (30Hz patch rate)
- Prevents cheating by validating all inputs

**Client Responsibilities:**
- Renders game state received from server
- Captures user input (WASD movement, mouse clicks, puzzle interactions)
- Sends input to server as messages
- Interpolates positions for smooth visuals at 60fps
- Runs fly animations locally (client-side)

---

## Server Game Room Logic

### GameRoom Class (`packages/server/src/rooms/GameRoom.ts`)

The GameRoom is the heart of the multiplayer game, managing all game state and physics.

#### Configuration
- `maxClients = 300` - supports up to 300 concurrent players
- `autoDispose = false` - room stays alive when empty for state persistence

#### Two-Spawn Tile System

```mermaid
graph TB
    subgraph AvailableTiles["800 Available Tiles"]
        Phase1["Phase 1 (0-399)<br/>First half of each slot"]
        Phase2["Phase 2 (400-799)<br/>Second half of each slot"]
    end

    subgraph FrameSlots["400 Frame Slots"]
        Slot0["Slot 0"]
        Slot1["Slot 1"]
        SlotN["Slot N..."]
        Slot399["Slot 399"]
    end

    Phase1 -->|fillCount: 1| FrameSlots
    Phase2 -->|fillCount: 2| FrameSlots

    subgraph PlacedTile["PlacedTileSchema"]
        half["fillCount=1<br/>Half filled"]
        complete["fillCount=2<br/>Complete"]
    end
```

#### Message Handlers

```mermaid
graph LR
    subgraph Messages["Client Messages"]
        pm[player_move]
        tc[tile_click]
        stc[start_tile_charge]
        ts[tile_shoot]
        ps[puzzle_submit]
        pc[puzzle_cancel]
        fa[fork_attack]
        rs[respawn]
    end

    subgraph Actions["Server Actions"]
        car[Apply car controls]
        lock[Lock tile + puzzle]
        charge[Start charging]
        impulse[Apply impulse]
        validate[Validate + place]
        release[Release tile]
        damage[Apply damage]
        spawn[Respawn player]
    end

    pm --> car
    tc --> lock
    stc --> charge
    ts --> impulse
    ps --> validate
    pc --> release
    fa --> damage
    rs --> spawn
```

#### Physics Update Loop (30Hz)

```mermaid
flowchart TD
    A[updatePhysics] --> B[Process spawn queue]
    B --> C[physicsWorld.step]
    C --> D[Check goal triggers]
    D --> E[Sync player positions]
    E --> F[Update held tiles]
    F --> G[Sync tile transforms]
    G --> H[Performance monitoring]
```

---

## Physics System

### PhysicsWorld Class (`packages/server/src/physics/PhysicsWorld.ts`)

Server-side physics using BabylonJS NullEngine + Havok WASM.

```mermaid
graph TB
    subgraph Engine["Physics Engine"]
        NE[NullEngine<br/>Headless BabylonJS]
        HP[HavokPlugin<br/>WASM Physics]
    end

    subgraph Static["Static Bodies"]
        ground[Ground<br/>100x200 units]
        walls[Walls<br/>4 boundaries + ceiling]
        ramps[Ramps<br/>Launch pads]
        goals[Goals<br/>Blue + Red arches]
        triggers[Triggers<br/>Goal detection]
    end

    subgraph Dynamic["Dynamic Bodies"]
        players[Players<br/>Box 1.5x2x2.5<br/>Mass: 20]
        tiles[Tiles<br/>Box 1.2x0.4x1.2<br/>Mass: 12]
    end

    NE --> HP
    HP --> Static
    HP --> Dynamic
```

### Physics Constants

| Category | Constant | Value |
|----------|----------|-------|
| **Tick Rate** | PHYSICS_SIMULATION_RATE | 30 Hz |
| **Tick Rate** | STATE_PATCH_RATE | 30 Hz |
| **Player** | PLAYER_MASS | 20.0 |
| **Player** | PLAYER_MOVEMENT_FORCE | 1000.0 |
| **Player** | PLAYER_MAX_SPEED | 25.0 units/s |
| **Player** | PLAYER_ANGULAR_DAMPING | 2.0 |
| **Tile** | TILE_MASS | 12.0 |
| **Tile** | TILE_FRICTION | 0.3 |
| **Shooting** | IMPULSE_MAX | 3000 |
| **Combat** | MIN_SHOT_VELOCITY_FOR_DAMAGE | 20.0 units/s |

---

## Client Game Entities

### VehicleRenderer Class

```mermaid
graph TB
    subgraph Vehicle["Monster Truck"]
        Chassis[Chassis<br/>1.5x2x2.5]
        Body[Car Body<br/>Cabin, hood, fenders]
        Wheels[4 Wheels<br/>Animated steering]
        Forks[Fork Prongs<br/>Tile holder]
        HealthBar[Health Bar<br/>Billboard]
        NameLabel[Name Label<br/>Billboard]
    end

    subgraph Methods["Key Methods"]
        updateTarget[updateTargetPosition/Rotation]
        interpolate[interpolate deltaTime]
        updateHealth[updateHealth current, max]
        getAttach[getTileAttachmentPosition]
    end
```

### TileRenderer States

```mermaid
stateDiagram-v2
    [*] --> ON_FLOOR: Spawned
    ON_FLOOR --> LOCKED: Left click
    ON_FLOOR --> CHARGING: Right click
    LOCKED --> ON_FLOOR: Puzzle cancel
    LOCKED --> PLACED: Puzzle correct
    CHARGING --> ON_FLOOR: Shoot
    PLACED --> [*]: In frame
```

### PlayerInput Controls

| Input | Action |
|-------|--------|
| W/S | Throttle (forward/back) |
| A/D | Steering (left/right) |
| Left Click | Pick up tile |
| Right Click Hold | Charge tile |
| Right Click Release | Shoot tile |
| E Key | Fork attack (melee) |
| Mouse | Camera rotation |

---

## Network & State Synchronization

### ColyseusClient Methods

```mermaid
graph LR
    subgraph Send["Client → Server"]
        sendMovement[sendMovement<br/>direction, rotation]
        sendTileClick[sendTileClick<br/>availableId]
        sendPuzzle[sendPuzzleResult<br/>availableId, answerIndex]
        sendCharge[sendStartTileCharge<br/>availableId]
        sendShoot[sendTileShoot<br/>availableId, direction]
        sendFork[sendForkAttack<br/>targetSessionId]
    end
```

### StateSync Callbacks (Colyseus v0.16+)

```mermaid
graph TB
    subgraph Callbacks["State Callbacks"]
        players["$(room.state.players).onAdd"]
        tiles["$(room.state.tiles).onAdd"]
        placed["$(room.state.placedTiles).onAdd"]
    end

    subgraph Listeners["Property Listeners"]
        pos["position.onChange"]
        rot["bodyRotation.onChange"]
        steer["listen 'steering'"]
        health["listen 'health'"]
        state["listen 'state'"]
        fill["listen 'fillCount'"]
    end

    players --> pos
    players --> rot
    players --> steer
    players --> health
    tiles --> state
    placed --> fill
```

---

## Shared Types & Configuration

### Tile States

```mermaid
stateDiagram-v2
    ON_FLOOR: ON_FLOOR<br/>Physics simulated
    LOCKED: LOCKED<br/>Puzzle shown
    CHARGING: CHARGING<br/>Between forks

    ON_FLOOR --> LOCKED: tile_click
    ON_FLOOR --> CHARGING: start_tile_charge
    LOCKED --> ON_FLOOR: puzzle_cancel
    CHARGING --> ON_FLOOR: tile_shoot
```

### Player States

```mermaid
stateDiagram-v2
    IDLE: IDLE<br/>Normal gameplay
    SOLVING_PUZZLE: SOLVING_PUZZLE<br/>Puzzle GUI shown

    IDLE --> SOLVING_PUZZLE: Lock tile
    SOLVING_PUZZLE --> IDLE: Complete/Cancel
```

### World Configuration

| Config | Value |
|--------|-------|
| Floor Size | 100 x 200 units |
| Frame Slots | 400 |
| Available Tiles | 800 (2 per slot) |
| Max Active Tiles | 50 on floor |
| Player Max Health | 100 |
| Tile Damage | 20 |
| Fork Damage | 5 |

---

## Puzzles System

### Multiple Choice Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant QB as QuestionBank

    C->>S: tile_click(availableId)
    S->>S: Lock tile to player
    S->>C: show_puzzle(config)
    C->>C: Display MultipleChoiceGUI

    C->>S: puzzle_submit(availableId, answerIndex)
    S->>QB: Validate answer

    alt Correct
        S->>S: Remove from tiles
        S->>S: Create PlacedTileSchema
        S->>C: tile_placed event
        C->>C: Fly animation (1.5s)
    else Wrong
        S->>S: shootTile(50% strength)
        C->>C: Close puzzle GUI
    end
```

---

## GUI Components

| Component | Purpose |
|-----------|---------|
| NameInputGUI | Login screen |
| LeaderboardGUI | Top players overlay |
| GameCompleteGUI | Victory screen |
| CompassGUI | Direction display |
| HelpGUI | Controls help |
| EscMenuGUI | Escape menu |
| DisconnectGUI | Disconnect overlay |
| DeathCountdownGUI | Respawn countdown |
| MultipleChoiceGUI | Quiz puzzle |
| MemoryCardsGUI | Memory game |

---

## Data Flow & Communication Patterns

### Player Movement Flow

```mermaid
sequenceDiagram
    participant PI as PlayerInput
    participant CC as ColyseusClient
    participant GR as GameRoom
    participant PW as PhysicsWorld
    participant SS as StateSync
    participant VR as VehicleRenderer

    PI->>PI: WASD → throttle, steering
    PI->>CC: sendMovement()
    CC->>GR: player_move
    GR->>PW: applyCarControls()

    loop 30Hz
        PW->>PW: physics.step()
        GR->>GR: Sync → Schema
    end

    GR-->>SS: State broadcast
    SS->>VR: updateTarget()

    loop 60fps
        VR->>VR: interpolate()
    end
```

### Tile Shooting Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant P as Physics

    U->>C: Right mouse down
    C->>S: start_tile_charge
    S->>S: state = CHARGING

    Note over S: Charging (max 2s)

    U->>C: Right mouse up
    C->>S: tile_shoot(direction)
    S->>S: Calculate strength (quadratic)
    S->>P: Apply impulse (10-3000)
    S->>P: Apply backforce to player
    S->>S: state = ON_FLOOR

    S-->>C: State update
    C->>C: Interpolate tile
```

### Goal Scoring Flow

```mermaid
sequenceDiagram
    participant P as Player
    participant PW as PhysicsWorld
    participant GR as GameRoom
    participant C as Client

    P->>PW: Shoot tile through goal
    PW->>PW: Tile enters trigger zone
    PW->>GR: Goal trigger callback
    GR->>GR: Increment blue/red score
    GR->>GR: Debounce (prevent duplicate)
    GR-->>C: goal_scored event
    C->>C: Update Scoreboard
```

### Combat Flow

```mermaid
sequenceDiagram
    participant A as Attacker
    participant S as Server
    participant V as Victim

    A->>S: fork_attack(targetId)
    S->>S: Validate distance (<10 units)
    S->>S: Apply damage (5 per click)
    S-->>V: health update

    alt Health <= 0
        S->>S: isDead = true
        S-->>V: Show death countdown
        V->>S: respawn
        S->>S: Random position
    end
```

---

## Key File Locations

| Component | Path |
|-----------|------|
| Server GameRoom | `packages/server/src/rooms/GameRoom.ts` |
| Physics World | `packages/server/src/physics/PhysicsWorld.ts` |
| Physics Constants | `packages/server/src/physics/PhysicsConstants.ts` |
| Game Room Schema | `packages/server/src/schema/GameRoomSchema.ts` |
| Tile Schema | `packages/server/src/schema/TileSchema.ts` |
| Placed Tile Schema | `packages/server/src/schema/PlacedTileSchema.ts` |
| Player Schema | `packages/server/src/schema/PlayerSchema.ts` |
| Client Scene | `packages/ui/src/game/Scene.ts` |
| Vehicle Renderer | `packages/ui/src/game/Vehicle.ts` |
| Tile Renderer | `packages/ui/src/game/Tile.ts` |
| Player Input | `packages/ui/src/game/PlayerInput.ts` |
| Raycast | `packages/ui/src/game/Raycast.ts` |
| Colyseus Client | `packages/ui/src/network/ColyseusClient.ts` |
| State Sync | `packages/ui/src/network/StateSync.ts` |
| World Config | `packages/shared/src/config/world.ts` |
