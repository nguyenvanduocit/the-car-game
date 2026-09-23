# @blockgame/server

Colyseus game server with Havok physics. It hosts a single room type, `firegroup`, precreated at startup with room ID `firegroup`.

## Run

```bash
bun install          # from the repo root
bun run dev          # bun --hot src/index.ts
```

Production build:

```bash
bun run build        # outputs dist/index.js
bun run start
```

Tests and type check:

```bash
bun run test
bun run typecheck
```

## Configuration

- `PORT`: listen port, default `7001`
- Game state is persisted to SQLite at `./game.db`, relative to the working directory the server is started from

## Layout

- `src/index.ts`: entry point (HTTP + WebSocket transport, room registration)
- `src/rooms/GameRoom.ts`: room logic and client message handlers
- `src/schema/`: Colyseus state schemas
- `src/physics/`: Havok physics world
- `src/database/`: SQLite persistence
- `src/monitoring/`: PM2 metrics
- `tests/`: `unit/` and `integration/` tests
