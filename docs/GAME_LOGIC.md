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

### Server-Authoritative Design (CRITICAL)
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
- Interpolates positions for smooth visuals at 60fps (but never modifies authoritative state)
- No client-side physics - pure rendering

**Communication Flow:**
```
Client → Server: Input messages (player_move, tile_click, puzzle_submit, tile_shoot)
Server → Client: State updates (via Colyseus state synchronization at 30Hz)
```

---

## Server Game Room Logic

### GameRoom Class (`packages/server/src/rooms/GameRoom.ts`)

The GameRoom is the heart of the multiplayer game, managing all game state and physics.

#### Key Responsibilities:

**1. Room Lifecycle Management**
- `maxClients = 50` - supports up to 50 concurrent players
- `autoDispose = false` - room stays alive when empty for state persistence
- State persistence via SQLite (save/restore game progress)

**2. Physics Simulation (30Hz)**
- Uses `PhysicsWorld` class with Havok physics engine
- Ground plane at y=0 (100x200 units)
- Boundary walls to contain players
- Ramps for jumping
- Goal arches with trigger planes for soccer gameplay
- Vehicle physics (box-shaped, 1.5x2x2.5 units)

**3. Tile Management**
- Progressive spawning: Max 50 active tiles on floor
- Remaining tiles in pool (spawned when tiles are placed)
- Spawn queue (2 tiles/frame max) to prevent frame spikes
- States: `NOT_SPAWNED`, `ON_FLOOR`, `LOCKED`, `CHARGING`, `FLYING`, `PLACED`

**4. Player Management**
- Vehicle-based players (monster truck style)
- Car controls: throttle (W/S) and steering (A/D)
- Body rotation synced from client camera (Y-axis)
- Health system with respawning
- Fork-based tile holding (visual attachment point)

**5. Combat System**
- Fork attacks (melee): 25 damage
- Tile collisions: Damage scales with velocity (min 20 units/s to trigger)
- Cooldown: 1 second per tile-player pair
- Respawn: 3 second delay after death

#### Important Methods:

**`onCreate(options)`**
- Initializes QuestionBank for puzzle validation
- Sets state sync rate to 30Hz (optimized from 60Hz)
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
- Updates fly animations (smooth lerp to frame slots)
- Performance monitoring (avg physics time, frame time, FPS)

**`shootTile(tileIndex, sessionId, direction, strength, source)`**
- Returns tile to floor state
- Validates player and tile existence
- Resolves shoot direction (server-authoritative)
- Spawns tile ahead of player (avoids immediate collision)
- Re-enables physics for tile
- Applies impulse (10-3000 based on charge time, quadratic scaling)
- Applies backforce to player (Newton's third law: 9-1800)

**`setupMessageHandlers()`** - Registers handlers for client messages:
- `player_move` - Car controls (throttle + steering)
- `tile_click` - Lock tile and show puzzle
- `start_tile_charge` - Start charging tile (right mouse down)
- `tile_shoot` - Shoot charged tile (right mouse up)
- `puzzle_submit` - Validate answer using QuestionBank, auto-place on success
- `puzzle_cancel` - Release tile (shoot away at 50% strength)
- `fork_attack` - Melee attack on another player
- Video controls: `video_play`, `video_pause`, `video_next`, `video_previous`

**`setupGoalTriggers()` / `handleGoalScored()`**
- Registers callback with PhysicsWorld
- Detects when tiles enter goal trigger zones
- Debounces (prevents duplicate scoring)
- Increments blue/red goal scores
- Broadcasts `goal_scored` event
- Saves room state

**`onJoin(client, options)`**
- Adds player to game state
- Restores player score if reconnecting (by displayName)
- Creates physics body for player
- Updates leaderboard
- Sends welcome message

**`onLeave(client, consented)`**
- Removes physics body
- Removes player from game state (returns owned tiles to floor)
- Room stays alive for state persistence

---

## Physics System

### PhysicsWorld Class (`packages/server/src/physics/PhysicsWorld.ts`)

Server-side physics using BabylonJS NullEngine + Havok WASM.

#### Key Components:

**1. Ground Plane**
- 100x200 units at y=0 (top surface)
- Static box body
- Material: friction=0.9, restitution=0.1 (realistic floor)

**2. Boundary Walls**
- 4 walls at world edges (from `WORLD_BOUNDARY_SEGMENTS`)
- Static boxes with high restitution (0.5) for bouncing

**3. Ramps**
- Angled static boxes for jumping
- Low friction (0.1), high restitution (0.8)
- Positioned via `RAMP_DESCRIPTORS`

**4. Goal Arches**
- Posts (cylinders) + crossbar for visual boundaries
- High restitution (0.9) for bouncing
- Positioned via `ARCH_DESCRIPTORS`

**5. Goal Triggers**
- Invisible trigger planes (isTrigger=true)
- Manual AABB collision check every frame (for ANIMATED tiles)
- Observable-based detection for DYNAMIC tiles

**6. Player Bodies**
- Box shape: 1.5x2x2.5 (vehicle chassis)
- Mass: 20, dynamic motion type
- Car physics: throttle force + steering angular velocity
- Center of mass offset to rear (~35% of length) for realistic steering pivot
- High friction (0.9), low restitution (0.1)
- High damping for quick stopping (linear=0.5, angular=0.3)

**7. Tile Bodies**
- Box shape: 1.2x0.4x1.2 (floor tile dimensions)
- Mass: 12, dynamic motion type
- Material: friction=0.3, restitution=0.15
- Damping: linear=0.4, angular=0.45
- States:
  - ON_FLOOR: Normal physics simulation
  - LOCKED/CHARGING: `disablePreStep=false` (position controlled, follows player)
  - FLYING/PLACED: No physics body (removed)

#### Important Methods:

**`initialize()`**
- Loads Havok WASM from local file
- Creates NullEngine (headless, no rendering)
- Enables physics with gravity (-9.81 m/s²)
- Creates boundaries, ramps, arches, goal triggers
- Sets up collision callbacks

**`step(deltaTime)`**
- Clamps deltaTime (0.001-0.066s) to prevent instability
- Updates player controls (steering momentum + throttle)
- Steps physics engine using private API `_step()`
- Tracks performance metrics

**`createPlayerBody(sessionId, position)`**
- Creates box body for vehicle
- Sets mass properties with custom inertia tensor
- Offsets center of mass to rear axle
- Enables collision callbacks

**`applyCarControls(sessionId, throttle, steering)`**
- Updates target steering (momentum-based, 2.0 rad/s speed)
- Stores throttle value
- Actual force application happens in `updatePlayerControls()`

**`updatePlayerControls(deltaTime)`**
- Interpolates current steering towards target (smooth steering wheel turn)
- Applies steering as angular velocity (max 1.5 rad/s)
- Calculates forward direction from current rotation
- Applies throttle force in forward direction (600 N)
- Caps max speed (15 units/s)

**`ensureTileBody(tileIndex, position, rotation)`**
- Creates dynamic box body for tile
- Sets mass properties with custom inertia tensor
- Material: medium friction, low restitution
- Enables collision callbacks (for goal triggers + tile-player damage)

**`moveTileHeld(tileIndex, position, rotation)`**
- For LOCKED/CHARGING tiles following player
- Sets `disablePreStep=false` (body syncs FROM node, not physics engine)
- Gives instant position control without physics simulation
- Zeroes velocities to prevent drift

**`enableTilePhysics(tileIndex)`**
- Re-enables physics simulation after being held
- Sets `disablePreStep=true` (body controlled by physics engine again)
- Called before applying impulse for shooting

**`applyTileImpulse(tileIndex, direction, strength)`**
- Maps strength (1-100) to impulse (10-3000) using quadratic scaling
- Applies impulse at tile center
- Formula: `impulseStrength = BASE + (t² * (MAX - BASE))` where `t = (strength-1)/99`

**`applyPlayerBackforce(sessionId, direction, strength)`**
- Maps strength (1-100) to backforce (9-1800) using quadratic scaling
- Backforce scaled by momentum conservation: `m_tile/m_player = 12/20 = 0.6`
- Applies impulse in opposite direction

**`checkGoalTriggers()`**
- Manual AABB check for all tiles vs all goal triggers
- Needed because ANIMATED (kinematic) tiles don't fire collision events
- Called every physics frame

### PhysicsConstants (`packages/server/src/physics/PhysicsConstants.ts`)

Centralized physics tuning values:

**Performance Settings:**
- `PHYSICS_SIMULATION_RATE = 30` Hz (server physics step rate)
- `STATE_PATCH_RATE = 30` Hz (Colyseus state sync rate)
- `MIN_DELTA_TIME = 0.001s`, `MAX_DELTA_TIME = 0.066s` (clamping)
- `VELOCITY_SYNC_THRESHOLD = 0.3 units/s` (bandwidth optimization)
- `ANGULAR_VELOCITY_SYNC_THRESHOLD = 0.2 rad/s` (bandwidth optimization)

**Player Physics:**
- `PLAYER_MASS = 20`
- `PLAYER_MOVEMENT_FORCE = 600` (throttle force)
- `PLAYER_MAX_SPEED = 15 units/s`
- `PLAYER_STEERING_SPEED = 2.0 rad/s` (steering wheel turn rate)
- `PLAYER_MAX_STEERING_ANGLE = 1.5 rad/s` (max turn rate)
- `PLAYER_LINEAR_DAMPING = 0.5`, `PLAYER_ANGULAR_DAMPING = 0.3`
- `PLAYER_FRICTION = 0.9`, `PLAYER_RESTITUTION = 0.1`

**Tile Physics:**
- `TILE_MASS = 12`
- `TILE_FRICTION = 0.3`, `TILE_RESTITUTION = 0.15`
- `TILE_LINEAR_DAMPING = 0.4`, `TILE_ANGULAR_DAMPING = 0.45`

**Shooting Mechanics:**
- `IMPULSE_BASE = 10`, `IMPULSE_MAX = 3000` (tile impulse range)
- `BACKFORCE_BASE = 9`, `BACKFORCE_MAX = 1000` (player backforce range)
- `MIN_SHOT_VELOCITY_FOR_DAMAGE = 20 units/s` (threshold to trigger damage)

**Material Properties:**
- Ground: friction=0.9, restitution=0.1
- Walls: friction=0.2, restitution=0.5
- Ramps: friction=0.1, restitution=0.8
- Arches: friction=0.3, restitution=0.9

---

## Client Game Entities

### GameScene Class (`packages/ui/src/game/Scene.ts`)

Main BabylonJS scene setup and rendering.

#### Key Responsibilities:

**1. Engine & Scene Setup**
- Creates BabylonJS Engine with audio enabled
- Creates Scene with rendering pipeline
- Optimized lighting (2 lights: hemispheric + directional)
- Unicorn gradient skybox (5-color smooth gradient)
- Glow layer (subtle, intensity=0.5)
- Post-processing (FXAA, tone mapping, contrast=1.05, exposure=0.75)

**2. Lighting System**
- Hemispheric Light: Ambient with pink tint (intensity=0.5)
- Directional Light: Main light with shadows (intensity=0.7)
- Shadow Generator: 512x512 map (optimized from 1024), Poisson sampling
- Clear color: Soft pink (0.95, 0.7, 0.85)

**3. Scene Objects**
- Floor (100x200 grid)
- Ramps (angled boxes for jumping)
- Goal arches (posts + crossbar, blue/red)
- Goal trigger visualizations (semi-transparent planes, 20% opacity)
- Scoreboard (3D text displays for goal scores)

**4. Performance Monitoring**
- FPS counter
- Draw calls tracking
- Active meshes count
- Memory usage
- Frame time average
- F3 to toggle overlay, F4 to export CSV

**5. Debug Visualizations**
- Coordinate axes at floor center
- Grid lines (optional)
- Player body axes (F8 to toggle)
- BabylonJS Inspector (F12 or Ctrl+Shift+I)

### VehicleRenderer Class (`packages/ui/src/game/Vehicle.ts`)

Visual representation of player vehicles (monster trucks).

#### Key Components:

**1. Root Transform**
- TransformNode at physics center (tracks world position)
- All parts parented to root with correct offsets

**2. Chassis**
- Main body box (1.5x2x2.5)
- Invisible (serves as root for car parts)
- Offset upward by +0.15 to sit on wheels

**3. Car Body Parts**
- **Cabin**: Passenger area (narrower than chassis, 1.25x height)
- **Hood**: Short front section (0.2x depth)
- **Trunk**: Long rear section (0.45x depth) - pickup bed
- **Fenders**: 4 boxes above wheels
- **Bumpers**: Front and rear (dark grey)
- **Headlights**: Emissive yellow (front)
- **Taillights**: Emissive red (rear)
- **Windshield**: Slanted glass (alpha=0.7)

**4. Wheels** (4 cylinders)
- Front wheels: Parented to steering knuckles (for steering animation)
- Back wheels: Parented to root
- Diameter: 0.8, width: 0.3
- Rotated 90° around Z (horizontal cylinders)
- Rotation tracks distance traveled for animation

**5. Axles** (2 cylinders)
- Front axle connects front wheels
- Back axle connects back wheels
- Diameter: 0.1, length: 1.4

**6. Forks** (2 boxes)
- Left and right prongs extending forward
- Bright orange with emissive glow
- Positioned at `FORK_METRICS.offsetZ = 1.75` (front of car)

**7. Ray Connector**
- Cyan glowing cylinder between fork tips
- Shows player where they're aiming
- Semi-transparent (alpha=0.5)

**8. Health Bar**
- Plane mesh above vehicle (billboard mode)
- Background: Black with white border
- Foreground: Green→Yellow→Red gradient based on health
- Text: Current health value

**9. Name Label**
- Plane mesh above health bar (billboard mode)
- White text with black outline
- Shows player display name

#### Important Methods:

**`constructor(scene, sessionId, displayName, position, isLocal)`**
- Generates random color from sessionId hash
- Creates root, chassis, body parts, wheels, axles, forks
- Creates health bar and name label
- Initializes interpolation state

**`updateTargetPosition(position)` / `updateTargetRotation(rotation)` / `updateTargetSteering(steering)`**
- Updates target values for interpolation
- Called by StateSync when server sends updates

**`interpolate(factor)`**
- Lerps position towards target (factor=0.4 for remote, 1.0 for local)
- Lerps Y-rotation (yaw only)
- Lerps steering for wheel animation
- Applies steering angle to front knuckles (max 0.5 radians visual)
- Rotates wheels based on distance traveled
- Updates root transform (position + rotation)

**`updateHealth(currentHealth, maxHealth)`**
- Scales health bar foreground width
- Changes color: Green (>50%) → Yellow (25-50%) → Red (<25%)
- Updates health text

**`getTileAttachmentPosition()` / `getForwardDirection()`**
- Returns world position between forks
- Used by server to position held tiles

**`getLeftForkTip()` / `getRightForkTip()`**
- Returns world position of fork tips
- Used by Raycast for tile selection

### TileRenderer Class (`packages/ui/src/game/Tile.ts`)

Visual representation of tiles (puzzle pieces).

#### Key Components:

**1. Mesh**
- Box shape (1.2x0.4x1.2) created from TileMasterMesh
- Instanced mesh for performance (Multi-Material Instancing)
- Texture applied via atlas UVs or separate master meshes

**2. Material**
- Shared base material (memory optimization)
- Bright diffuse (1.5, 1.5, 1.5) for visibility
- Strong ambient response (0.8, 0.8, 0.8)
- Moderate specular (0.6, 0.6, 0.6)
- State-based emissive color:
  - ON_FLOOR: No glow (0, 0, 0)
  - LOCKED: Yellow/orange glow (0.3, 0.3, 0)
  - CHARGING: Blue/cyan glow (0, 0.2, 0.4)
  - FLYING: Green glow (0, 0.3, 0.1)
  - PLACED: White glow (0.15, 0.15, 0.15)

**3. Interpolation State**
- Target position/rotation from server
- Current position/rotation (interpolated)
- Dirty flag (skip interpolation when static)
- Thresholds: position=0.01 units, rotation=0.9999 dot product

**4. Fly Animation**
- Smooth cubic ease-out (1.5 seconds)
- Lerps position from start to frame slot
- Slerps rotation to 90° around X + 90° around Z (frame orientation)
- Callback on completion

### PlayerInput Class (`packages/ui/src/game/PlayerInput.ts`)

Captures user input and sends to server.

#### Key Responsibilities:

**1. Car Controls**
- WASD: Forward/backward (throttle) and left/right (steering)
- W/S: Throttle (-1 to +1)
- A/D: Steering (-1 to +1)
- Server applies force based on throttle and steering

**2. Tile Interaction**
- Left Click: Tile pickup (raycast from fork tips)
- Right Click (Hold): Charge tile for shooting
- Right Click (Release): Shoot charged tile
- Direction calculated from camera forward

**3. Combat**
- E Key: Fork attack (melee attack on nearby player)

**4. Camera Controls**
- Mouse movement: Rotates camera around player
- Scroll wheel: Adjusts camera distance (optional)

### Raycast Class (`packages/ui/src/game/Raycast.ts`)

Handles raycasting for tile selection and interaction.

#### Key Responsibilities:

**1. Fork-Based Raycasting**
- Raycasts from left and right fork tips (not camera)
- Direction: Camera forward
- Detects tiles on floor (state=ON_FLOOR)
- Returns closest tile hit by either fork

**2. Tile Selection**
- Highlights selected tile (glow effect)
- Shows distance to player
- Updates every frame

**3. Auto-Release Detection**
- Detects when charging tile is no longer aimed at
- Automatically sends `tile_shoot` to server (prevents stuck tiles)

---

## Network & State Synchronization

### ColyseusClient Class (`packages/ui/src/network/ColyseusClient.ts`)

Manages Colyseus connection and message sending.

#### Key Methods:

**`joinRoom(displayName)`**
- Connects to server via WebSocket
- Joins or creates room with name
- Waits for initial state sync
- Returns Room instance

**`sendMovement(direction, rotation)`**
- Sends `player_move` message (throttle + steering)
- Direction.x = throttle (-1 to 1)
- Direction.z = steering (-1 to 1)
- Rotation = camera alpha (for body rotation sync)

**`sendTileClick(tileIndex)`**
- Sends `tile_click` message
- Server validates proximity and tile state

**`sendPuzzleResult(tileIndex, success, answerIndex)`**
- Sends `puzzle_submit` message
- Server validates answer using QuestionBank
- Auto-places tile on success

**`sendStartTileCharge(tileIndex)` / `sendTileShoot(tileIndex, direction)`**
- Sends `start_tile_charge` and `tile_shoot` messages
- Server calculates charge time and applies impulse

**`sendForkAttack(targetSessionId)`**
- Sends `fork_attack` message
- Server validates distance and applies damage

### StateSync Class (`packages/ui/src/network/StateSync.ts`)

Synchronizes Colyseus state with BabylonJS scene.

#### Key Responsibilities:

**1. Player Synchronization**
- Creates VehicleRenderer for each player (including local)
- Updates target position/rotation from server
- Interpolates position (40% for remote, 100% for local)
- Updates health bars

**2. Tile Synchronization**
- Uses TilePool for efficient tile management (object pooling)
- Creates TileRenderer for each tile
- Updates target position/rotation from server
- Interpolates position (40% for all tiles)
- Updates tile state (locked, charging, flying, placed)

**3. Leaderboard Synchronization**
- Listens for leaderboard changes
- Updates LeaderboardGUI

**4. Goal Score Synchronization**
- Listens for blue/red goal score changes
- Updates Scoreboard (3D text displays)

**5. Shadow Optimization**
- Culls shadow casters based on distance from camera
- Threshold: 25 units
- Updated every 10 frames

#### Important Methods:

**`setupStateListeners()`**
- Uses Colyseus v0.16.22 callback API (`getStateCallbacks`)
- Listens for player add/remove
- Listens for tile add/remove
- Listens for position/rotation changes
- Listens for state changes (locked, charging, etc.)
- Listens for goal score changes

**`interpolatePlayers()`**
- Local player: 100% interpolation (instant update, prevents flicker)
- Remote players: 40% interpolation (smooth movement)
- Called every frame before render

**`interpolateTiles()`**
- All tiles: 40% interpolation
- ON_FLOOR tiles: No interpolation (updated directly)
- PLACED tiles: No interpolation (static in frame)
- Called every frame before render

**`reconcileLocalPlayer()`**
- Camera follows local player mesh position
- Prevents flicker by syncing camera with visual mesh (not raw server position)

---

## Shared Types & Configuration

### Physics Types (`packages/shared/src/types/Physics.ts`)

**World Configuration:**
- `GROUND_PLANE_DESCRIPTOR`: Floor dimensions and position
- `WORLD_BOUNDARY_SEGMENTS`: Boundary wall positions
- `RAMP_DESCRIPTORS`: Ramp positions and rotations
- `ARCH_DESCRIPTORS`: Goal arch positions and sizes
- `GOAL_TRIGGER_DESCRIPTORS`: Trigger plane positions

**Vehicle Metrics:**
- `CHASSIS_METRICS`: Width=1.5, Height=1.0, Depth=2.5
- `WHEEL_METRICS`: Radius=0.4, Width=0.3, OffsetX=0.7, OffsetZ=1.1
- `FORK_METRICS`: Width=0.2, Height=0.15, Length=1.0, Spacing=0.8, OffsetZ=1.75
- `VEHICLE_LAYOUT`: Positions of parts relative to physics center

**Tile Configuration:**
- `TILE_CONFIG`: Mesh size (1.2x0.4x1.2), spawn padding, spawn height
- `TILE_ATTACH_POINT`: Position between forks (0, -0.15, 1.75)

**Player Configuration:**
- `PLAYER_CONFIG`: Radius, height, spawn height, max health
- `PLAYER_CONFIG.forkDamage = 25`
- `PLAYER_CONFIG.tileDamage = 10`

### Tile States (`packages/shared/src/types/Tile.ts`)

```typescript
enum TileState {
  NOT_SPAWNED = 'not_spawned', // Not yet spawned (in pool)
  ON_FLOOR = 'on_floor',       // Physics-simulated, on floor
  LOCKED = 'locked',           // Held by player, puzzle shown
  CHARGING = 'charging',       // Held between forks, charging for shoot
  FLYING = 'flying',           // Flying to frame slot (animation)
  PLACED = 'placed',           // Placed in frame (static)
}
```

### Puzzle Types (`packages/shared/src/types/Puzzle.ts`)

```typescript
enum PuzzleType {
  MULTIPLE_CHOICE = 'multiple_choice', // Question with 4 options
  MEMORY_CARDS = 'memory_cards',       // Card matching (deprecated)
}
```

---

## Puzzles System

### Multiple Choice Puzzle (`packages/ui/src/puzzles/MultipleChoiceGUI.ts`)

**Flow:**
1. Server sends `show_puzzle` message with puzzle config
2. Client shows GUI with question and 4 options
3. User clicks option
4. Client sends `puzzle_submit` with answerIndex
5. Server validates using QuestionBank
6. If correct: Auto-places tile in frame (starts fly animation)
7. If wrong: Shoots tile away at 50% strength

**GUI Components:**
- Background: Semi-transparent black panel
- Question text: Large white text
- 4 option buttons: Blue buttons with white text
- Submit button: Green button (appears after selection)
- Cancel button: Red button (shoots tile away)

---

## GUI Components

### NameInputGUI (`packages/ui/src/gui/NameInputGUI.ts`)
Initial screen asking for player name.

### LeaderboardGUI (`packages/ui/src/gui/LeaderboardGUI.ts`)
Shows top players by tiles placed.

### GameCompleteGUI (`packages/ui/src/gui/GameCompleteGUI.ts`)
Shows when all tiles are placed.

### CompassGUI (`packages/ui/src/gui/CompassGUI.ts`)
Shows player's orientation and position.

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

### Tile Interaction Flow (Right-Click Shoot)

```
1. User aims at tile and holds right mouse button
2. Raycast detects tile under forks
3. Client sends 'start_tile_charge' message to server
4. Server locks tile to player (state = CHARGING)
5. Server positions tile between forks (server-authoritative)
6. Server syncs tile position/state to Colyseus state (30Hz)
7. Client StateSync receives update → updateState(CHARGING)
8. Client shows blue glow on tile
9. User releases right mouse button
10. Client calculates shoot direction (camera forward)
11. Client sends 'tile_shoot' message with direction
12. Server calculates charge time (up to 2 seconds)
13. Server maps charge time to strength (1-100, quadratic)
14. Server spawns tile ahead of player (avoids collision)
15. Server re-enables physics for tile
16. Server applies impulse (10-3000 based on strength)
17. Server applies backforce to player (Newton's third law)
18. Server syncs tile velocity/position to Colyseus state
19. Client interpolates tile movement (40%)
20. Client renders tile flying through air
```

### Puzzle Completion Flow

```
1. User clicks tile on floor
2. Client sends 'tile_click' message to server
3. Server validates proximity and tile state
4. Server locks tile to player (state = LOCKED)
5. Server sends 'show_puzzle' message to client with puzzle config
6. Client shows MultipleChoiceGUI with question
7. User selects answer and clicks Submit
8. Client sends 'puzzle_submit' message with answerIndex
9. Server validates answer using QuestionBank
10. If correct:
    a. Server calculates frame slot position
    b. Server starts fly animation (state = FLYING)
    c. Server removes physics body
    d. Server sends 'puzzle_success' message to client
    e. Client starts fly animation (cubic ease-out, 1.5s)
    f. Server syncs fly progress to Colyseus state (30Hz)
    g. Client interpolates tile position during flight
    h. When complete, server sets state = PLACED
    i. Server increments player.tilesPlaced
    j. Server updates leaderboard
    k. Server checks game completion
    l. If all slots filled, server broadcasts 'game_complete'
11. If wrong:
    a. Server shoots tile away at 50% strength
    b. Server sends 'puzzle_failed' message to client
    c. Client closes puzzle GUI
```

### Goal Scoring Flow

```
1. Player shoots tile through goal arch
2. Server physics simulation detects tile entered trigger zone
3. PhysicsWorld calls checkGoalTriggers() (manual AABB check)
4. PhysicsWorld fires goal trigger callback
5. GameRoom.handleGoalScored() increments blue/red score
6. GameRoom debounces (prevents duplicate scoring)
7. GameRoom broadcasts 'goal_scored' event
8. GameRoom saves room state to database
9. Client StateSync receives blueGoalScore/redGoalScore update
10. Client Scoreboard updates 3D text displays
11. Client plays goal sound effect
```

### Combat Flow

```
1. User presses E key near another player
2. Client sends 'fork_attack' message with targetSessionId
3. Server validates distance (<10 units)
4. Server applies damage (25 for fork attack)
5. Server updates player.health
6. Server syncs health to Colyseus state
7. Client StateSync receives health update
8. Client VehicleRenderer updates health bar
9. If health <= 0:
    a. Server calls handlePlayerDeath()
    b. Server schedules respawn (3 seconds)
    c. Server respawns player at random position
    d. Server recreates physics body
    e. Server resets health to maxHealth (100)
```

### State Persistence Flow

```
1. Tile is placed in frame (or goal is scored)
2. Server calls saveCurrentRoomState()
3. Server serializes game state:
   - FLYING and PLACED tiles (with frameSlotIndex, completedBy, puzzle)
   - Player scores (grouped by displayName)
   - Goal scores
   - Game completion status
4. Server saves to SQLite database (game.db)
5. When server restarts or new player joins:
   a. Server calls loadRoomState() in onCreate()
   b. Server restores placed tiles to frame positions
   c. Server creates remaining tiles on floor
   d. Server restores goal scores
   e. Server caches player scores for reconnection
6. When player reconnects:
   a. Server checks savedPlayerScores by displayName
   b. Server restores player.tilesPlaced
   c. Server updates leaderboard
```

---

## Performance Optimizations

**Server-Side:**
- Physics simulation: 30Hz (down from 60Hz) - ~33ms budget per step
- State sync rate: 30Hz (matches physics rate)
- Velocity sync threshold: Only sync when change > 0.3 units/s
- Progressive tile spawning: Max 50 active tiles, gradual spawning (2/frame)
- Dirty flag: Skip interpolation when entity is static

**Client-Side:**
- Interpolation: 40% for remote players/tiles, 100% for local player
- Shadow culling: Only cast shadows within 25 units of camera
- Shadow update throttling: Every 10 frames
- Object pooling: TilePool reuses TileRenderer instances
- Master mesh instancing: Tiles share base material and geometry
- Arm update throttling: LOCKED/CHARGING tiles update every 2 frames (30Hz)

---

## Key File Locations

| Component | Path |
|-----------|------|
| Server GameRoom | `packages/server/src/rooms/GameRoom.ts` |
| Physics World | `packages/server/src/physics/PhysicsWorld.ts` |
| Physics Constants | `packages/server/src/physics/PhysicsConstants.ts` |
| Colyseus State Schema | `packages/server/src/schema/GameState.ts` |
| Client Scene | `packages/ui/src/game/Scene.ts` |
| Vehicle Renderer | `packages/ui/src/game/Vehicle.ts` |
| Tile Renderer | `packages/ui/src/game/Tile.ts` |
| Player Input | `packages/ui/src/game/PlayerInput.ts` |
| Raycast | `packages/ui/src/game/Raycast.ts` |
| Colyseus Client | `packages/ui/src/network/ColyseusClient.ts` |
| State Sync | `packages/ui/src/network/StateSync.ts` |
| Shared Types | `packages/shared/src/types/` |
| World Config | `packages/shared/src/config/world.ts` |
