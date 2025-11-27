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
BlockGame uses **server-authoritative architecture** - the server is the single source of truth for all game state.

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

**Communication Flow:**
```
Client → Server: Input messages (player_move, tile_click, puzzle_submit, tile_shoot)
Server → Client: State updates (via Colyseus state synchronization at 30Hz)
```

---

## Server Game Room Logic

### GameRoom Class (`packages/server/src/rooms/GameRoom.ts`)

The GameRoom is the heart of the multiplayer game, managing all game state and physics.

#### Key Configuration:
- `maxClients = 300` - supports up to 300 concurrent players
- `autoDispose = false` - room stays alive when empty for state persistence

#### Key Responsibilities:

**1. Room Lifecycle Management**
- State persistence via SQLite (save/restore game progress)
- Duplicate tab prevention via player tokens

**2. Physics Simulation (30Hz)**
- Uses `PhysicsWorld` class with Havok physics engine
- Ground plane at y=0 (100x200 units)
- Boundary walls + ceiling to contain players
- Ramps for jumping
- Goal arches with trigger planes for soccer gameplay
- Vehicle physics (box-shaped, 1.5x2x2.5 units)

**3. Two-Spawn Tile System**
- 800 available tiles (availableId: 0-799)
- Each tile targets one of 400 frame slots (frameSlotIndex: 0-399)
- Phase 1 tiles (0-399) fill first half of slot
- Phase 2 tiles (400-799) complete the slot
- Progressive spawning: Max 50 active tiles on floor
- Spawn queue (2 tiles/frame max) to prevent frame spikes
- States: `ON_FLOOR`, `LOCKED`, `CHARGING`

**4. Player Management**
- Vehicle-based players (monster truck style)
- Car controls: throttle (W/S) and steering (A/D)
- Health system with respawning
- Fork-based tile holding

**5. Combat System**
- Fork attacks (melee): 5 damage per click
- Tile collisions: Damage scales with velocity (min 20 units/s to trigger)
- Tile damage: 20 per hit
- Cooldown: 1 second per tile-player pair
- Respawn: Manual via respawn button

#### Important Methods:

**`onCreate(options)`**
- Initializes QuestionBank for puzzle validation
- Sets state sync rate to 30Hz
- Creates tiles with progressive spawning
- Restores saved state if available
- Sets up message handlers and collision callbacks
- Starts physics update loop at 30Hz

**`updatePhysics(deltaTime)`** - Physics loop (30Hz)
- Processes spawn queue (gradual tile spawning)
- Steps Havok physics simulation
- Checks goal trigger collisions
- Syncs player positions/rotations back to Colyseus state
- Updates tiles attached to players (LOCKED/CHARGING)
- Syncs tile transforms from physics
- Performance monitoring

**`shootTile(availableId, sessionId, direction, strength, source)`**
- Returns tile to floor state
- Validates player and tile existence
- Resolves shoot direction (server-authoritative)
- Spawns tile ahead of player (avoids immediate collision)
- Re-enables physics for tile
- Applies impulse (10-3000 based on charge time, quadratic scaling)
- Applies backforce to player (9-1000)

**Message Handlers:**
- `player_move` - Car controls (throttle + steering)
- `tile_click` - Lock tile and send puzzle
- `start_tile_charge` - Start charging tile (right mouse down)
- `tile_shoot` - Shoot charged tile (right mouse up)
- `puzzle_submit` - Validate answer using QuestionBank, place on success
- `puzzle_cancel` - Release tile (shoot away at 50% strength)
- `fork_attack` - Melee attack on another player
- `respawn` - Manual respawn request
- `ping` - Latency measurement

---

## Physics System

### PhysicsWorld Class (`packages/server/src/physics/PhysicsWorld.ts`)

Server-side physics using BabylonJS NullEngine + Havok WASM.

#### Key Components:

**1. Ground Plane**
- 100x200 units at y=0
- Static box body
- Material: friction=0.9, restitution=0.1

**2. Boundary Walls + Ceiling**
- 4 walls at world edges + ceiling
- 100 unit high walls
- Static boxes with restitution=0.5

**3. Ramps**
- Angled static boxes for jumping
- Low friction (0.1), high restitution (0.8)

**4. Goal Arches**
- Posts (cylinders) + crossbar
- High restitution (0.9) for bouncing
- Blue goal at z=-100, Red goal at z=+100

**5. Goal Triggers**
- Invisible trigger planes (isTrigger=true)
- Manual AABB collision check every frame

**6. Player Bodies**
- Box shape: 1.5x2x2.5 (vehicle chassis)
- Mass: 20, dynamic motion type
- Car physics: throttle force + steering angular velocity
- Center of mass offset to rear for realistic steering
- High damping for quick stopping (angular=2.0)

**7. Tile Bodies**
- Box shape: 1.2x0.4x1.2
- Mass: 12, dynamic motion type
- Material: friction=0.3, restitution=0.15
- Only active tiles have physics bodies (max 50)

### PhysicsConstants (`packages/server/src/physics/PhysicsConstants.ts`)

**Performance Settings:**
- `PHYSICS_SIMULATION_RATE = 30` Hz
- `STATE_PATCH_RATE = 30` Hz
- `VELOCITY_SYNC_THRESHOLD = 0.3 units/s`

**Player Physics:**
- `PLAYER_MASS = 20`
- `PLAYER_MOVEMENT_FORCE = 1000`
- `PLAYER_MAX_SPEED = 25 units/s`
- `PLAYER_STEERING_SPEED = 2.0 rad/s`
- `PLAYER_ANGULAR_DAMPING = 2.0`

**Tile Physics:**
- `TILE_MASS = 12`
- `TILE_FRICTION = 0.3`
- `TILE_RESTITUTION = 0.15`

**Shooting Mechanics:**
- `IMPULSE_BASE = 10`, `IMPULSE_MAX = 3000`
- `BACKFORCE_BASE = 9`, `BACKFORCE_MAX = 1000`
- `MIN_SHOT_VELOCITY_FOR_DAMAGE = 20 units/s`

---

## Client Game Entities

### GameScene Class (`packages/ui/src/game/Scene.ts`)

Main BabylonJS scene setup and rendering.

#### Key Features:
- BabylonJS Engine with audio
- Optimized lighting (hemispheric + directional)
- Gradient skybox
- Glow layer (intensity=0.5)
- Post-processing (FXAA, tone mapping)
- Shadow Generator (512x512 map)
- Performance monitoring (F3 toggle, F4 export CSV)
- Debug visualizations (F8 axes, F12 Inspector)

### VehicleRenderer Class (`packages/ui/src/game/Vehicle.ts`)

Visual representation of player vehicles (monster trucks).

#### Components:
- **Chassis**: Main body box (1.5x2x2.5)
- **Car Body Parts**: Cabin, hood, trunk, fenders, bumpers, lights, windshield
- **Wheels**: 4 cylinders with steering animation
- **Axles**: 2 cylinders connecting wheels
- **Forks**: 2 orange prongs for holding tiles
- **Ray Connector**: Cyan cylinder between fork tips (aim indicator)
- **Health Bar**: Billboard plane with gradient
- **Name Label**: Billboard text above vehicle

#### Key Methods:
- `updateTargetPosition/Rotation/Steering()` - Updates from server
- `interpolate(deltaTime)` - Smooth position/rotation with frame-rate independent smoothing
- `updateHealth(current, max)` - Updates health bar display
- `getTileAttachmentPosition()` - Position between forks for held tiles

### TileRenderer Class (`packages/ui/src/game/Tile.ts`)

Visual representation of tiles.

#### Features:
- Instanced mesh from TileMasterMesh (performance)
- State-based emissive glow:
  - ON_FLOOR: No glow
  - LOCKED: Yellow glow
  - CHARGING: Blue glow
- Client-side fly animation (cubic ease-out, 1.5s)

### PlayerInput Class (`packages/ui/src/game/PlayerInput.ts`)

#### Controls:
- **WASD**: Throttle (W/S) and steering (A/D)
- **Left Click**: Pick up tile (raycast from forks)
- **Right Click Hold**: Charge tile
- **Right Click Release**: Shoot tile
- **E Key**: Fork attack (melee)
- **Mouse**: Camera rotation

### Raycast Class (`packages/ui/src/game/Raycast.ts`)

- Fork-based raycasting (from fork tips, not camera)
- Detects tiles with state=ON_FLOOR
- Highlights selected tile with glow

---

## Network & State Synchronization

### ColyseusClient Class (`packages/ui/src/network/ColyseusClient.ts`)

#### Key Methods:
- `joinRoom(displayName)` - Connect and join game room
- `sendMovement(direction, rotation)` - Throttle + steering
- `sendTileClick(availableId)` - Pick up tile
- `sendPuzzleResult(availableId, answerIndex)` - Submit puzzle answer
- `sendStartTileCharge(availableId)` / `sendTileShoot(availableId, direction)` - Shooting
- `sendForkAttack(targetSessionId)` - Melee attack

### StateSync Class (`packages/ui/src/network/StateSync.ts`)

#### Responsibilities:
- Creates VehicleRenderer for each player
- Creates TileRenderer for each available tile
- Creates placed tile visuals from placedTiles map
- Updates target positions from server
- Interpolates positions (40% remote, 100% local)
- Updates health bars, leaderboard, goal scores
- Shadow culling (distance-based, every 10 frames)

#### Colyseus v0.16+ API:
```typescript
const $ = getStateCallbacks(room);

$(room.state.players).onAdd((player, sessionId) => { ... });
$(room.state.tiles).onAdd((tile, availableId) => { ... });
$(room.state.placedTiles).onAdd((placed, frameSlotIndex) => { ... });
$(player).listen('health', (value) => { ... });
```

---

## Shared Types & Configuration

### World Configuration (`packages/shared/src/config/world.ts`)

**Floor:**
- Width: 100, Length: 200, Y: 0

**Tiles:**
- Default count: 400 frame slots (800 available tiles)
- Mesh size: 1.2x0.4x1.2
- Spawn height: 30 (drop from sky)

**Player:**
- Max health: 100
- Tile damage: 20
- Fork damage: 5
- Spawn height: 30

### Tile States (`packages/shared/src/types/Tile.ts`)

```typescript
enum TileState {
  ON_FLOOR = 'on_floor',       // Physics-simulated, on floor
  LOCKED = 'locked',           // Held by player, puzzle shown
  CHARGING = 'charging',       // Held between forks, charging for shoot
}
```

### Player States (`packages/shared/src/types/Player.ts`)

```typescript
enum PlayerState {
  IDLE = 'idle',
  SOLVING_PUZZLE = 'solving_puzzle',
}
```

---

## Puzzles System

### Multiple Choice Puzzle (`packages/ui/src/puzzles/MultipleChoiceGUI.ts`)

**Flow:**
1. Server sends `show_puzzle` message with puzzle config
2. Client shows GUI with question and 4 options
3. User clicks option and submits
4. Client sends `puzzle_submit` with answerIndex
5. Server validates using QuestionBank
6. If correct: Creates PlacedTileSchema, removes from tiles, client plays fly animation
7. If wrong: Shoots tile away at 50% strength

---

## GUI Components

| Component | File | Purpose |
|-----------|------|---------|
| NameInputGUI | `gui/NameInputGUI.ts` | Login screen |
| LeaderboardGUI | `gui/LeaderboardGUI.ts` | Top players overlay |
| GameCompleteGUI | `gui/GameCompleteGUI.ts` | Victory screen |
| CompassGUI | `gui/CompassGUI.ts` | Orientation display |
| PlayGuideGUI | `gui/PlayGuideGUI.ts` | Help/tutorial |
| HelpGUI | `gui/HelpGUI.ts` | Controls help |
| EscMenuGUI | `gui/EscMenuGUI.ts` | Escape menu |
| DisconnectGUI | `gui/DisconnectGUI.ts` | Disconnect overlay |
| DeathCountdownGUI | `gui/DeathCountdownGUI.ts` | Respawn countdown |

---

## Data Flow & Communication Patterns

### Player Movement Flow

```
1. User presses WASD
2. PlayerInput captures input → throttle + steering
3. PlayerInput sends 'player_move' message to server
4. Server receives message → applyCarControls(throttle, steering)
5. Server updates physics (force + angular velocity)
6. Server syncs player position/rotation to Colyseus state (30Hz)
7. Colyseus broadcasts state change to all clients
8. Client StateSync receives update → updateTargetPosition/Rotation
9. Client interpolates VehicleRenderer (40% for remote, 100% for local)
10. Client renders updated player position at 60fps
```

### Tile Shooting Flow (Right-Click)

```
1. User aims at tile and holds right mouse button
2. Raycast detects tile under forks
3. Client sends 'start_tile_charge' message to server
4. Server locks tile to player (state = CHARGING)
5. Server positions tile between forks
6. User releases right mouse button
7. Client calculates shoot direction (camera forward)
8. Client sends 'tile_shoot' message with direction
9. Server calculates charge time (up to 2 seconds)
10. Server maps charge time to strength (1-100, quadratic)
11. Server spawns tile ahead of player
12. Server re-enables physics for tile
13. Server applies impulse (10-3000 based on strength)
14. Server applies backforce to player
15. Client interpolates tile movement (40%)
```

### Puzzle Completion Flow

```
1. User clicks tile on floor
2. Client sends 'tile_click' message to server
3. Server validates proximity and tile state
4. Server locks tile to player (state = LOCKED)
5. Server sends 'show_puzzle' message with puzzle config
6. Client shows MultipleChoiceGUI with question
7. User selects answer and clicks Submit
8. Client sends 'puzzle_submit' message with answerIndex
9. Server validates answer using QuestionBank
10. If correct:
    a. Server removes tile from tiles map
    b. Server creates/updates PlacedTileSchema in placedTiles
    c. Server sends 'tile_placed' message to client
    d. Client plays fly animation locally (1.5s cubic ease-out)
    e. Server updates player.tilesPlaced
    f. Server updates leaderboard
11. If wrong:
    a. Server shoots tile away at 50% strength
    b. Client closes puzzle GUI
```

### Goal Scoring Flow

```
1. Player shoots tile through goal arch
2. Server physics detects tile entered trigger zone
3. PhysicsWorld fires goal trigger callback
4. GameRoom.handleGoalScored() increments blue/red score
5. GameRoom debounces (prevents duplicate scoring)
6. GameRoom broadcasts 'goal_scored' event
7. Client StateSync receives score update
8. Client Scoreboard updates 3D text displays
```

### Combat Flow

```
1. User presses E key near another player
2. Client sends 'fork_attack' message with targetSessionId
3. Server validates distance (<10 units)
4. Server applies damage (5 per click)
5. Server updates player.health
6. Client receives health update
7. Client VehicleRenderer updates health bar
8. If health <= 0:
    a. Server sets player.isDead = true
    b. Client shows death countdown GUI
    c. User clicks respawn
    d. Server respawns player at random position
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
