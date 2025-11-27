# @blockgame/bots

Bot clients that connect to the BlockGame server just like real players.

## Features

- ✅ Real Colyseus client connections (not server-side simulation)
- ✅ Tests full client-server communication stack
- ✅ Simulates realistic player behavior (movement, puzzles, etc.)
- ✅ Easy to configure via environment variables
- ✅ Graceful shutdown on Ctrl+C

## Quick Start

### 1. Start the game server

```bash
# From root directory
bun run dev:server
```

### 2. Run bots (in a separate terminal)

```bash
# From root directory
bun run bots

# Or from packages/bots directory
bun run start
```

## Configuration

Configure bots via environment variables:

```bash
# Number of bots to spawn (default: 20)
BOT_COUNT=50 bun run bots

# Server URL (default: ws://localhost:3000)
SERVER_URL=ws://192.168.1.100:3000 bun run bots

# Room name (default: firegroup)
ROOM_NAME=custom_room bun run bots

# Auto-disconnect after timeout (default: false)
AUTO_DISCONNECT=true DISCONNECT_AFTER_MS=60000 bun run bots

# Spawn delay between bots in ms (default: 100)
SPAWN_DELAY_MS=200 bun run bots
```

### Combined Example

```bash
BOT_COUNT=100 SERVER_URL=ws://localhost:3000 AUTO_DISCONNECT=true bun run bots
```

## Bot Behavior

Each bot simulates a real player:

1. **Movement**: Randomly walks around the map with smooth rotation
2. **Direction Changes**: Every 2-5 seconds, picks new random direction or stops
3. **Puzzle Solving**: Auto-solves puzzles after 1-3 seconds (simulates thinking time)
4. **Network Communication**: Sends 60 updates/second to server (same as real player)

## Use Cases

### Performance Testing

Test server performance with many concurrent players:

```bash
BOT_COUNT=200 bun run bots
```

### Network Testing

Test server with bots connecting from different machines:

```bash
# On another machine
SERVER_URL=ws://192.168.1.100:3000 BOT_COUNT=50 bun run bots
```

### Load Testing

Stress test with auto-disconnect cycle:

```bash
AUTO_DISCONNECT=true DISCONNECT_AFTER_MS=30000 BOT_COUNT=100 bun run bots
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
// Example: Make bots click tiles randomly
private tryClickTile(): void {
  if (!this.room || !this.room.state.tiles) return;

  const tiles = Array.from(this.room.state.tiles.values());
  const floorTiles = tiles.filter(t => t.state === TileState.ON_FLOOR);

  if (floorTiles.length > 0) {
    const randomTile = floorTiles[Math.floor(Math.random() * floorTiles.length)];
    this.room.send('tile_click', { tileId: randomTile.id });
  }
}
```

## Troubleshooting

### "Connection failed"

- Ensure server is running (`bun run dev:server`)
- Check `SERVER_URL` matches your server address
- Verify port 3000 is not blocked by firewall

### "Too many connections"

- Server has `maxClients = 50` limit by default
- Reduce `BOT_COUNT` or increase server's `maxClients`

### Bots don't move

- Check server console for errors
- Verify physics is working on server
- Check network tab for message flow
