# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BlockGame is a first-person multiplayer puzzle game built with BabylonJS and Colyseus. Players navigate a room filled with tiles on the floor. When a player clicks on a tile, it appears in their hand and presents a puzzle. Only after solving the puzzle can they actually hold the tile. Players then carry tiles to a rectangular frame on the opposite side of the room, fitting small tile images together to complete a larger picture. The game includes a leaderboard.

## Scale & Capacity

- **Target capacity: ~200 concurrent users**
- All 200 users may be in the same game room simultaneously
- Server must handle physics simulation for all players at 20Hz
- Network state sync must efficiently broadcast to all connected clients
- Consider bandwidth and CPU implications when adding features

## Game Architecture

### Server Authoritative (CRITICAL)

This game uses **server authoritative architecture** - the server is the single source of truth for all game state.

**Server Responsibilities (GameRoom in @blockgame/server):**
- ✓ Owns and controls ALL game state (players, tiles, frame, leaderboard)
- ✓ Validates ALL client actions (tile clicks, puzzle results, frame placement)
- ✓ Runs physics simulation and position updates
- ✓ Broadcasts state changes to all clients
- ✓ Prevents cheating by validating all inputs

**Client Responsibilities (UI in @blockgame/ui):**
- ✓ Renders game state received from server
- ✓ Captures user input (movement, clicks, puzzle interactions)
- ✓ Sends input to server as messages
- ✓ Interpolates positions for smooth visuals (but never modifies authoritative state)
- ✓ Shows optimistic predictions (optional, for better UX)

**NEVER allow client to make authoritative decisions:**
- ❌ Client CANNOT decide if puzzle is solved (server validates)
- ❌ Client CANNOT decide if tile placement is valid (server validates)
- ❌ Client CANNOT modify player positions directly (server owns positions)
- ❌ Client CANNOT grant tiles to players (server owns tile ownership)

**Communication Flow:**
```
Client → Server: Input messages (player_move, tile_click, puzzle_submit, frame_place)
Server → Client: State updates (via Colyseus state synchronization)
```

**Example - Tile Click Flow:**
1. Client: User clicks tile → Send `tile_click` message to server
2. Server: Validate (is tile on floor? is player close enough?) → Lock tile to player
3. Server: Broadcast state change to all clients
4. Client: Render tile in player's hand (based on server state)

**Benefits:**
- Prevents cheating (all validation on server)
- Consistent game state across all clients
- Easy to debug (one source of truth)
- Scalable (server handles complexity)

### Physics Architecture (Server-Authoritative)

The game uses **server-side physics only** - client does NOT run physics simulation.

**Server Physics (@blockgame/server/src/physics/PhysicsWorld.ts):**
- ✅ Runs Havok physics engine (NullEngine + HavokPlugin)
- ✅ Ground plane (100x200 units at y=0) - prevents falling through floor
- ✅ Boundary walls (4 walls at world edges) - prevents escaping
- ✅ Player physics bodies (dynamic spheres with collision)
- ✅ Tile physics (simplified, may be expanded in future)
- ✅ Simulates at 20Hz (PhysicsConstants.SERVER_PHYSICS_RATE)
- ✅ Broadcasts positions to clients via Colyseus state sync

**Client Physics (@blockgame/ui/src/game/Physics.ts):**
- ❌ NO Havok initialization
- ❌ NO physics bodies
- ❌ NO physics simulation
- ✅ Stub class for compatibility only
- ✅ Raycasting uses BabylonJS geometry methods (no physics engine needed)

**Why Client Doesn't Need Physics:**
1. **Raycasting**: BabylonJS provides `scene.createPickingRay()` and `ray.intersectsMesh()` for clicking objects - these are pure geometry methods that don't require a physics engine
2. **Rendering**: Client renders positions from server state (interpolated for smoothness)
3. **No Duplication**: Server is the single source of truth for all physics
4. **Simpler**: Easier to iterate, no sync issues, less code

**Example - Player Movement:**
1. Client: Capture WASD input → Send `player_move` message to server (direction only)
2. Server: Calculate velocity → Apply to physics body → Havok simulates collision with ground/walls
3. Server: Broadcast updated position via Colyseus state sync
4. Client: Interpolate to server position for smooth rendering

## Core Development Principles

### 0. Performance is EVERYTHING (NON-NEGOTIABLE)
- **Performance is the #1 priority - NEVER sacrifice it for anything**
- **No "fancy" features, abstractions, or patterns that hurt performance**
- **Every line of code must consider its performance impact**
- **Rules:**
  - ❌ NEVER add code that reduces framerate or increases latency
  - ❌ NEVER introduce allocations in hot paths (game loop, render loop, physics tick)
  - ❌ NEVER use fancy patterns (observers, event emitters, proxies) if they add overhead
  - ❌ NEVER add abstraction layers that hurt performance
  - ✅ Prefer direct property access over getters/setters
  - ✅ Prefer simple loops over functional methods (map/filter/reduce) in hot paths
  - ✅ Cache calculations, avoid redundant work
  - ✅ Profile before and after changes
- **If a "clean code" pattern hurts performance, use the ugly fast version**
- **200 concurrent users means every microsecond matters**
- **When in doubt, choose the faster option**

### 1. Evidence-Based Code - Masterpiece Quality
- **Every line of code must be a fully verified masterpiece**
- **NEVER assume APIs, functions, types, or methods exist based on general knowledge**
- **ALWAYS verify existence and correctness before writing code:**
  - Read actual library source code or TypeScript definitions
  - Check official documentation with WebFetch/WebSearch
  - Verify function signatures, parameter types, and return types
  - Sample actual usage examples from the library
  - Check node_modules for type definitions and implementation details
- **For external libraries (BabylonJS, Colyseus, etc.):**
  - Look up actual type definitions in node_modules/@types or package types
  - Find real examples in library documentation
  - Verify method names, properties, and their exact signatures
  - Don't guess parameter order or optional parameters
- **If you cannot verify something exists, either:**
  - Research it thoroughly first (WebFetch docs, read type files)
  - Ask the user for clarification
  - Use a different verified approach
- **Quality standard:** Every function call, type reference, and API usage must have evidence it's correct

### 2. KISS - Simplicity Above All
- **Simplicity, readability, and maintainability are the top priorities**
- Write straightforward, obvious code that anyone can understand
- Avoid clever tricks, complex abstractions, or premature optimizations
- If you can't explain it simply, simplify the implementation

### 3. YAGNI (You Aren't Gonna Need It)
- **Don't build features, abstractions, or utilities until they're actually needed**
- Resist the temptation to add "future-proofing" code
- Wait for concrete use cases before creating abstractions
- Delete unused code immediately

### 4. DRY (Don't Repeat Yourself)
- **Eliminate duplication only when it improves clarity**
- Extract repeated logic into functions/components when you have 3+ occurrences
- Don't abstract too early - some duplication is acceptable during exploration
- Shared logic must have a clear, single purpose

### 5. Engineer are not always right (engineer is the user of Claude Code)
- Dont asume that engineer are always right, sometime, my requirement or direction is lack of context. you have to:
  - Verify entineer's request
  - Collecting context
  - Ensure that engineer's request is correct and complete
  - Ensure that engineer fully aware of the context and the requirements and what is going on

### 6. Iteration-First Development
- Every change must be easy to iterate, modify, and evolve
- Write code that can be changed quickly without cascading effects
- Avoid tight coupling that makes iteration difficult
- Prefer small, incremental changes over large rewrites
- Design for fast feedback loops
- If a change is hard to iterate on, simplify it first
- Key question: "How easy would it be to change this tomorrow?"

### 7. First Principles Thinking (When Analyzing Issues)
- **Break down every problem to its fundamental truths before attempting solutions**
- **NEVER jump to solutions based on surface-level symptoms**
- **Analysis process:**
  1. **Identify the actual problem** - What exactly is happening? What should be happening?
  2. **Question assumptions** - What are we assuming? Are those assumptions valid?
  3. **Find root causes** - Keep asking "why?" until you reach fundamental truths
  4. **Separate facts from opinions** - What do we actually know vs. what do we think?
  5. **Build up from fundamentals** - Construct the solution from verified truths
- **Example approach:**
  - ❌ "The player isn't moving → let me check the movement code"
  - ✅ "The player isn't moving → What does 'moving' require? → Server must receive input → Server must update position → Client must receive update → Client must render. Let me verify each step."
- **Key questions to ask:**
  - "What is the simplest explanation for this behavior?"
  - "What fundamental mechanism is this supposed to use?"
  - "What would need to be true for this to work?"
  - "Am I solving the symptom or the actual problem?"
- **Avoid:**
  - Pattern matching to similar-looking past issues
  - Applying fixes without understanding why they work
  - Adding workarounds instead of fixing root causes

## Development Workflow

### Type Safety Verification (MANDATORY)
- **ALWAYS run typecheck after making code changes**
- **Fix ALL type errors before considering the task complete**
- **Type errors must be fixed, not ignored with `@ts-ignore` or `any` types**
- Typechecking commands:
  - **From root:** `bun run typecheck` (checks both server and UI)
  - **Server only:** `bun run typecheck:server` or `cd packages/server && bun run typecheck`
  - **UI only:** `bun run typecheck:ui` or `cd packages/ui && bun run typecheck`
- **The code change is NOT complete until typecheck passes with zero errors**

### Colyseus State Management (CRITICAL)
This project uses **Colyseus v0.16.22**, which requires the modern state callback API:

**ALWAYS use `getStateCallbacks()` for listening to state changes:**

```typescript
import { getStateCallbacks } from 'colyseus.js';

const $ = getStateCallbacks(room);

// Listen to ArraySchema changes (e.g., leaderboard)
$(room.state.leaderboard).onAdd(() => { /* ... */ });
$(room.state.leaderboard).onRemove(() => { /* ... */ });

// Listen to specific field changes
$(room.state).listen('isComplete', (value, prevValue) => {
  if (value === true) { /* ... */ }
});

// Listen to MapSchema changes (e.g., players)
$(room.state.players).onAdd((player, sessionId) => {
  $(player).listen('x', (x, prevX) => { /* ... */ });
});
```

**NEVER use the old API** (pre-0.15):
```typescript
// ❌ WRONG - This will cause "not a function" errors
room.state.onChange((changes) => { /* ... */ });
room.state.leaderboard.onAdd(() => { /* ... */ }); // Without getStateCallbacks
```

### Documentation
- **Store all documentation generated during the coding process in the `docs/` directory.**
- This includes implementation plans, research notes, bug fix analysis, and phase documentation.
- Use clear, descriptive filenames (e.g., `FEATURE_NAME_PLAN.md`, `BUG_FIX_ANALYSIS.md`).

## Project Structure

This is a monorepo managed by Bun workspaces with three main packages:

```
blockgame/
├── packages/
│   ├── server/              # Colyseus game server (@blockgame/server)
│   │   ├── src/
│   │   │   ├── index.ts     # Server entry point
│   │   │   ├── database/    # SQLite database and leaderboard
│   │   │   ├── physics/     # Havok physics integration
│   │   │   ├── rooms/       # Colyseus room logic (GameRoom)
│   │   │   ├── schema/      # Colyseus state schemas
│   │   │   └── utils/       # Puzzle generation utilities
│   │   └── tests/           # Server tests (unit, integration)
│   │
│   ├── ui/                  # BabylonJS client (@blockgame/ui)
│   │   ├── src/
│   │   │   ├── main.ts      # Client entry point
│   │   │   ├── game/        # BabylonJS game entities (Scene, Player, Tile, Floor, Frame, Camera, Physics, Raycast, Input)
│   │   │   ├── gui/         # BabylonJS GUI components (NameInput, Leaderboard, GameComplete)
│   │   │   ├── network/     # Colyseus client and state sync
│   │   │   └── puzzles/     # Puzzle implementations (MemoryCards)
│   │   └── public/          # Static assets
│   │
│   └── shared/              # Shared types and utilities (@blockgame/shared)
│       └── src/
│           └── types/       # Shared TypeScript types
│
├── specs/                   # Feature specifications
│   └── 001-babylonjs-colyseus-sample/
│       ├── spec.md          # Feature specification
│       ├── plan.md          # Implementation plan
│       ├── tasks.md         # Task breakdown
│       ├── data-model.md    # Data modeling
│       ├── research.md      # Research notes
│       ├── quickstart.md    # Quick start guide
│       ├── checklists/      # Quality checklists
│       └── contracts/       # Schema examples
│
├── .specify/                # Specify framework configuration
│   ├── memory/              # AI memory and context
│   ├── templates/           # Spec templates
│   └── scripts/             # Automation scripts
│
├── package.json             # Root workspace configuration
├── bun.lock                 # Bun lockfile
├── CLAUDE.md                # Project-wide AI instructions
├── README.md                # Project documentation
├── PHASE4_IMPLEMENTATION.md # Implementation notes
└── PHASE7_PHASE8_IMPLEMENTATION.md
```

### Package Dependencies

- **@blockgame/server**: Colyseus server with Havok physics
  - `@colyseus/core`, `@colyseus/ws-transport`
  - `@babylonjs/havok` (server-side physics)
  - `nanoid` (ID generation)

- **@blockgame/ui**: BabylonJS client
  - `@babylonjs/core`, `@babylonjs/gui`
  - `@babylonjs/havok` (client-side physics)
  - `colyseus.js` v0.16.22 (client library)
  - Uses `rolldown-vite` for fast builds

- **@blockgame/shared**: Shared types
  - No runtime dependencies, types only

### Scripts

From root directory:
- `bun run dev:server` - Start server with hot reload
- `bun run dev:ui` - Start UI dev server
- `bun run dev` - Start both server and UI
- `bun run build` - Build both packages
- `bun run test` - Run all tests
- `bun run typecheck` - Typecheck all packages (server + UI)
- `bun run typecheck:server` - Typecheck server only
- `bun run typecheck:ui` - Typecheck UI only

## Game logic

`@docs/GAME_LOGIC.md`

## Architecture

`@docs/ARCHITECTURE.md`