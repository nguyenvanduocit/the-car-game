# @blockgame/bots

Bot clients that connect to the BlockGame server just like real players.

## Features

- Real Colyseus client connections (not server-side simulation)
- Drives cars around the map by sending `player_move` messages
- Configured via environment variables
- Graceful shutdown on Ctrl+C (SIGINT) and SIGTERM

## Quick Start

### 1. Start the game server

```bash
# From root directory
cd packages/server && bun run dev
```

The server listens on port 7001 (`PORT` env var overrides it).

### 2. Run bots (in a separate terminal)

```bash
# From root directory
SERVER_URL=ws://localhost:7001 bun run bots

# Or from packages/bots directory
SERVER_URL=ws://localhost:7001 bun run start
```

## Configuration

Configure bots via environment variables:

```bash
# Number of bots to spawn (default: 20)
BOT_COUNT=50 bun run bots

# Server URL (default: ws://localhost:3000, but the server listens on 7001)
SERVER_URL=ws://192.168.1.100:7001 bun run bots

# Room name (default: firegroup, the only room the server registers)
ROOM_NAME=firegroup bun run bots

# Auto-disconnect after timeout (default: false, timeout default: 60000)
AUTO_DISCONNECT=true DISCONNECT_AFTER_MS=60000 bun run bots

# Spawn delay between bots in ms (default: 100)
SPAWN_DELAY_MS=200 bun run bots
```

### Combined Example

```bash
BOT_COUNT=100 SERVER_URL=ws://localhost:7001 AUTO_DISCONNECT=true bun run bots
```

## Bot Behavior

Each bot joins with display name `Bot1`, `Bot2`, ... and then:

1. **Movement**: Sends a random `direction` vector. The server reads `direction.x` as throttle and `direction.z` as steering, so bots drive with random throttle/steering values. The `rotation` field the bot sends is ignored by the server.
2. **Direction Changes**: Every 2-5 seconds, picks a new random direction (80%) or stops (20%)
3. **Network Communication**: Sends 60 updates/second to server (the browser client sends 30)
4. **Puzzles**: Bots never send `tile_click`, so they never pick up tiles or get puzzles. The `show_puzzle` handler in `BotClient.ts` reads `tileId`, while the server sends `tileIndex`.

## Use Cases

### Performance Testing

Test server performance with many concurrent players:

```bash
BOT_COUNT=200 SERVER_URL=ws://localhost:7001 bun run bots
```

### Network Testing

Test server with bots connecting from different machines:

```bash
# On another machine
SERVER_URL=ws://192.168.1.100:7001 BOT_COUNT=50 bun run bots
```

### Load Testing

Run bots for a fixed time, then disconnect all of them and exit:

```bash
AUTO_DISCONNECT=true DISCONNECT_AFTER_MS=30000 BOT_COUNT=100 SERVER_URL=ws://localhost:7001 bun run bots
```

## Development

### Project Structure

```
packages/bots/
├── src/
│   ├── index.ts       # Main entry point (spawns bots)
│   └── BotClient.ts   # Individual bot logic
├── package.json
├── tsconfig.json
└── README.md
```

### Adding New Bot Behaviors

Edit `BotClient.ts` to add new behaviors:

```typescript
import { TileState } from '@blockgame/shared';

// Example: Make bots click tiles randomly
private tryClickTile(): void {
  if (!this.room || !this.room.state.tiles) return;

  const tiles = Array.from(this.room.state.tiles.values());
  const floorTiles = tiles.filter(t => t.state === TileState.ON_FLOOR);

  if (floorTiles.length > 0) {
    const randomTile = floorTiles[Math.floor(Math.random() * floorTiles.length)];
    this.room.send('tile_click', { tileIndex: randomTile.availableId });
  }
}
```

## Troubleshooting

### "Connection failed"

- Ensure server is running (`cd packages/server && bun run dev`)
- Check `SERVER_URL` matches your server address and port (7001 by default)
- Verify port 7001 is not blocked by firewall

### "Too many connections"

- Server has `maxClients = 300` limit (`packages/server/src/rooms/GameRoom.ts`)
- Reduce `BOT_COUNT` or increase server's `maxClients`

### Bots don't move

- Check server console for errors
