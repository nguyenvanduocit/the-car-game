# BlockGame

A third-person multiplayer puzzle game where players collect tiles, solve puzzles, and collaboratively complete a picture.

## What is This?

Players drive monster trucks in a 3D arena filled with tiles. Click a tile to pick it up, then answer a multiple choice question. Answer correctly and the tile flies to the frame on the wall. Shoot tiles through goals to score points. Fork attack other players to knock them out!

**Target scale:** ~200 concurrent players in the same room.

## Quick Start

```bash
bun install
bun run up:dev    # server + UI dev under PM2
```

Without PM2, run each package in its own terminal:

```bash
cd packages/server && bun run dev
cd packages/ui && bun run dev
```

Server: `ws://localhost:7001` | Client: `http://localhost:7000`

The client reads the server URL from `VITE_SERVER_URL` in `packages/ui/.env`. If it is unset, dev builds connect to `ws://localhost:7001`.

Other scripts (from the repo root):

```bash
bun run test        # server tests
bun run typecheck
bun run build       # server + UI
bun run bots        # bot clients (packages/bots)
bun run logs        # PM2 logs
bun run down        # stop all PM2 apps
```

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
- Server runs physics simulation (Havok at 30Hz)
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
- Avoid allocations in hot paths (game loop, render loop)
- Direct property access over getters/setters
- Profile before and after changes

## Documentation

- [Game Logic](./docs/GAME_LOGIC.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Retrospective](./docs/RETROSPECTIVE.md)
- [Colyseus Performance Research](./docs/COLYSEUS_PERFORMANCE_RESEARCH.md)
- [Security Review](./docs/SECURITY_REVIEW.md)

## License

Private - Internal use only
