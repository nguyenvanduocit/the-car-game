# BlockGame

A first-person multiplayer puzzle game where players collect tiles, solve puzzles, and collaboratively complete a picture.

## What is This?

Players navigate a 3D room filled with tiles on the floor. Click a tile to pick it up - but first you must solve a puzzle (memory card matching). Once solved, carry the tile to the frame on the opposite wall and place it correctly. Work together to complete the picture!

**Target scale:** ~200 concurrent players in the same room.

## Quick Start

```bash
bun install
bun run dev
```

Server: `http://localhost:7001` | Client: `http://localhost:7000`

## Project Context

This project explores building a **real-time multiplayer 3D game** with:
- BabylonJS for 3D rendering
- Colyseus for multiplayer state synchronization
- Havok for physics simulation

The goal is to validate patterns for server-authoritative multiplayer games at scale (200 players).

## Lessons Learned

### Server-Authoritative Architecture is Essential

The server is the **single source of truth** for all game state. Clients only render and send inputs - they never make authoritative decisions.

- Server validates all actions (tile clicks, puzzle completion, placement)
- Server runs physics simulation (Havok at 20Hz)
- Clients interpolate positions for smooth rendering
- This prevents cheating and ensures consistency

### Server-Side Physics Only

Initially we considered running physics on both client and server. **Bad idea.**

- Client doesn't need physics - BabylonJS raycasting works without Havok
- Running physics in two places creates sync nightmares
- Simpler architecture = easier to iterate

### Colyseus State Management (v0.16+)

The modern Colyseus API requires `getStateCallbacks()`:

```typescript
import { getStateCallbacks } from 'colyseus.js';
const $ = getStateCallbacks(room);
$(room.state.players).onAdd((player, id) => { /* ... */ });
```

The old `room.state.onChange()` API no longer works.

### Performance is Non-Negotiable

With 200 concurrent users:
- Every microsecond matters
- Avoid allocations in hot paths (game loop, render loop)
- Direct property access over getters/setters
- Profile before and after changes

## Documentation

- [Game Logic](./docs/GAME_LOGIC.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Feature Spec](./specs/001-babylonjs-colyseus-sample/spec.md)

## License

Private - Internal use only
