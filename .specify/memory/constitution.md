<!--
Sync Impact Report:
Version: 1.0.0 → 1.0.1
Rationale: Clarify UI technology - BabylonJS GUI (not HTML/CSS overlays)

Modified Principles: V. Bun-Native Development (Technical Constraints section)
Change: Line 88 - Clarified that UI uses BabylonJS GUI, not HTML/CSS overlays
Impact: Aligns constitution with spec.md, plan.md, research.md decisions
Templates Status: No template changes needed (spec/plan already use BabylonJS GUI)

Follow-up TODOs: None

Previous Sync Impact Report:
Version: 0.0.0 → 1.0.0
Rationale: Initial constitution creation for BlockGame project

Modified Principles: N/A (initial creation)
Added Sections:
  - Core Principles (5 principles defined)
  - Technical Constraints
  - Quality Standards
  - Governance

Templates Status:
  ✅ plan-template.md - Constitution Check section present, compatible
  ✅ spec-template.md - User story prioritization aligns with Event-Driven Development
  ✅ tasks-template.md - Independent user story structure matches principles

Follow-up TODOs: None
-->

# BlockGame Constitution

## Core Principles

### I. Event-Driven Development (NON-NEGOTIABLE)

This is a time-boxed event game for a company birthday celebration. Every decision MUST prioritize:
- **Playability on event day**: Features must be complete, tested, and fun before the deadline
- **Event-first scope**: If a feature risks event readiness, cut the feature, not the testing
- **Fixed deadline over feature completeness**: Better to have 3 polished, working puzzles than 10 broken ones

**Rationale**: This is not a long-term product. The event date is absolute. Scope is negotiable.

### II. Multiplayer-First Design

All game mechanics MUST support multiple concurrent players via Colyseus:
- **Server authority**: Game state (tile ownership, puzzle completion, leaderboard) managed server-side
- **Optimistic client updates**: UI responds immediately, server validates and reconciles
- **Graceful degradation**: If a player disconnects, their tiles/progress remain in game state
- **No single-player shortcuts**: Even testing requires multiplayer infrastructure

**Rationale**: The game's core value is collaborative/competitive puzzle-solving. Single-player bypasses would create untested code paths.

### III. Visual Clarity Over Realism

Minecraft-style block aesthetic MUST be maintained consistently:
- **Block-based geometry**: All 3D models use simple cubes/rectangular prisms with hard edges
- **Flat textures**: No gradients, realistic lighting, or complex materials
- **High contrast**: Tiles, puzzles, and UI elements must be instantly distinguishable
- **Spatial simplicity**: Room layout should be immediately understandable from first-person view

**Rationale**: Players have limited time to learn controls. Visual simplicity reduces cognitive load and keeps focus on puzzle-solving.

### IV. Puzzle-Driven Progression

The tile-collection mechanic MUST create meaningful gameplay:
- **Puzzle validates ownership**: Players cannot hold a tile without solving its puzzle
- **Independent puzzle instances**: Each player gets their own puzzle for the same tile (no blocking)
- **Progressive difficulty optional**: All puzzles can be equal difficulty (event time is limited)
- **Leaderboard as motivation**: Real-time tile placement count drives competition

**Rationale**: Puzzles are the core engagement loop. Bypassing puzzle validation breaks game balance.

### V. Bun-Native Development

Leverage Bun's capabilities to minimize dependencies and complexity:
- **Use Bun APIs directly**: `Bun.serve()` for WebSockets, `bun:sqlite` for persistence, `Bun.file` for assets
- **Avoid npm alternatives**: No Express, no better-sqlite3, no ws library, no dotenv
- **Hot reload for iteration**: Use `bun --hot` during development for rapid testing
- **Monorepo without tooling**: Bun workspace support only, no Lerna/Nx/Turborepo

**Rationale**: Bun simplifies the stack and reduces failure points. Event timeline doesn't allow debugging dependency conflicts.

## Technical Constraints

### Technology Stack (FIXED)

**Backend** (packages/server or blockgame/):
- Runtime: Bun (NOT Node.js)
- Multiplayer: Colyseus framework
- Database: bun:sqlite for leaderboard/state persistence
- Testing: bun test

**Frontend** (@blockgame/ui/):
- 3D Engine: BabylonJS (first-person camera, mesh interactions)
- Build Tool: Vite (rolldown-vite for fast HMR)
- Colyseus Client: WebSocket connection to backend
- UI: BabylonJS GUI for all game UI (@babylonjs/gui - no HTML/TSX components for buttons, dialogs, overlays)

**Prohibited**:
- React/Vue/Angular unless already scaffolded in package.json
- Express, Fastify, or other HTTP frameworks (use Bun.serve)
- PostgreSQL, MySQL, MongoDB (use bun:sqlite)
- Jest, Vitest (use bun test)

### Performance Targets

Given the event context (likely 10-30 concurrent players):
- **Server response**: <100ms for tile interactions
- **Client FPS**: Stable 30+ FPS on mid-range laptops (BabylonJS optimization required)
- **WebSocket latency**: <50ms for state updates (local network event setup assumed)
- **Puzzle load time**: <1s to display puzzle UI overlay

### Scope Boundaries

**In Scope**:
- First-person 3D navigation in a single room
- Click tile → show puzzle → solve → hold tile
- Carry tile to central frame → snap to grid
- Real-time leaderboard (tiles placed per player)
- 5-20 unique puzzles (quality over quantity)

**Out of Scope** (unless event needs change):
- Multiple rooms/levels
- Player customization (avatars, colors)
- Puzzle editor/authoring tool
- Mobile/touch support (desktop event assumed)
- Voice chat, text chat
- Save/load game sessions (single event session)

## Quality Standards

### Testing Requirements

**Given event timeline, testing prioritizes critical paths**:

1. **Multiplayer sync** (CRITICAL):
   - Integration tests: Two clients interact with same tile → server resolves correctly
   - Leaderboard updates propagate to all connected clients

2. **Puzzle validation** (CRITICAL):
   - Server rejects tile ownership if puzzle not solved
   - Client cannot bypass puzzle UI

3. **3D interactions** (MANUAL TESTING ACCEPTABLE):
   - Raycast tile click detection
   - Tile attachment to camera (hand visualization)
   - Frame snap-to-grid placement

**Test coverage goal**: 70%+ for server game logic, manual testing acceptable for 3D/UI.

### Code Quality

- **Simplicity**: KISS principle from user guidance applies. No abstractions until 3+ use cases.
- **Readability**: Inline comments for BabylonJS setup and Colyseus state sync (these are complex APIs)
- **TypeScript**: Strict mode enabled. Type game state schemas explicitly.
- **Linting**: Use Bun-compatible linters if available, but don't block development.

### Documentation

**Required**:
- `README.md` in each package with quickstart (start server, start client)
- `PUZZLES.md` explaining how to add/modify puzzles
- Inline code comments for BabylonJS scene setup and Colyseus room logic

**Optional** (nice to have):
- Architecture diagram (room layout, client-server flow)
- Puzzle design guidelines

## Governance

### Amendment Process

1. **Propose change**: Document why current principle blocks event success
2. **Impact assessment**: Which features/code must change?
3. **Approval**: Project lead or team consensus (event timeline drives urgency)
4. **Update**: Increment version, update this file, propagate to templates

### Versioning Policy

- **MAJOR (X.0.0)**: Remove/redefine core principle (e.g., drop multiplayer requirement)
- **MINOR (0.X.0)**: Add new principle or section (e.g., add accessibility requirements)
- **PATCH (0.0.X)**: Clarify wording, fix typos, update dates

### Compliance Reviews

- **During planning** (`/speckit.plan`): Verify feature aligns with Event-Driven Development (deadline check)
- **During spec** (`/speckit.specify`): Ensure user stories support Multiplayer-First Design
- **During tasks** (`/speckit.tasks`): Validate tasks test Puzzle-Driven Progression
- **During code review**: Check Bun-Native Development compliance (no prohibited dependencies)

**Complexity Justification**: Any violation of principles MUST be documented in `plan.md` Complexity Tracking table with:
- Which principle violated
- Why violation necessary for event success
- What simpler alternative was rejected and why

**Version**: 1.0.1 | **Ratified**: 2025-11-18 | **Last Amended**: 2025-11-18
