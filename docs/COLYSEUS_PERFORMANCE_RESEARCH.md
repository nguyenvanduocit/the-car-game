# Colyseus State Patching Performance Research

Deep research on Colyseus state synchronization, bandwidth optimization, and best practices for multiplayer game networking.

**Context**: BlockGame - BabylonJS + Colyseus multiplayer puzzle game with server-authoritative physics running at 30Hz.

---

## Table of Contents

1. [Colyseus State Patching Mechanism](#1-colyseus-state-patching-mechanism)
2. [Bandwidth Optimization](#2-bandwidth-optimization)
3. [Client-Side Performance](#3-client-side-performance)
4. [Server-Side Performance](#4-server-side-performance)
5. [Industry Best Practices](#5-industry-best-practices)
6. [Colyseus-Specific Optimizations](#6-colyseus-specific-optimizations)
7. [Recommendations for BlockGame](#7-recommendations-for-blockgame)

---

## 1. Colyseus State Patching Mechanism

### How Delta Encoding Works

Colyseus uses `@colyseus/schema` - an **incremental binary state serializer with delta encoding**. Unlike traditional serializers that snapshot the entire state, Colyseus tracks changes at the **property level**.

**Key Architecture:**
- Each `Schema` instance has a unique `refId` for network identification
- Each `Schema` instance holds a `ChangeTree` object that tracks mutations
- Only the **latest mutation** of each property is queued per `patchRate` interval
- Server encodes only changed properties, not the entire state

**Before (Legacy Fossil-Delta):**
```
1. Snapshot entire state every patch
2. Diff against previous snapshot
3. Broadcast binary diff
4. Client deserializes entire state from diff
```

**After (@colyseus/schema):**
```
1. Track property-level mutations via ChangeTree
2. Encode only changed fields with their refIds
3. Broadcast minimal binary patch
4. Client applies changes to existing state objects
```

### Network Overhead Per Update

**Benchmark Results** (from Colyseus schema repository):

| Scenario | @colyseus/schema | msgpack + fossil-delta |
|----------|------------------|------------------------|
| Initial state (100 entities) | 2,671 bytes | 3,283 bytes |
| Single entity x/y update | **9 bytes** | 26 bytes |
| 50 entities x/y update | **342 bytes** | 684 bytes |
| 100 entities x/y update | **668 bytes** | 1,529 bytes |

**Key Insight**: For position updates (the most common operation), Colyseus schema is **2-2.3x more efficient** than msgpack + delta encoding.

### Primitive Type Sizes

| Type | Size | Range |
|------|------|-------|
| int8/uint8 | 1 byte | -128 to 127 / 0 to 255 |
| int16/uint16 | 2 bytes | -32,768 to 32,767 / 0 to 65,535 |
| int32/uint32 | 4 bytes | Full 32-bit range |
| float32 | 4 bytes | IEEE 754 single precision |
| float64 | 8 bytes | IEEE 754 double precision |
| number | 1-9 bytes | Auto-detects (adds 1 byte overhead) |
| string | Variable | UTF-8, max 4GB |
| boolean | 1 byte | 0 or 1 |

**Recommendation**: Use specific types (`float32` for positions) instead of `number` to save 1 byte per field.

### Schema Complexity Impact

- **64 field limit** per Schema structure (use nesting for more)
- Field order matters - must match between server and client
- Nested schemas add refId overhead but enable better organization
- **Array manipulation is expensive**: Removing index 0 from 20-item array = 38 extra bytes
- Map key moves add 2 extra bytes per move

---

## 2. Bandwidth Optimization

### Optimal Broadcast Rate

**Industry Standards:**

| Game | Tick Rate | Bandwidth | Use Case |
|------|-----------|-----------|----------|
| VALORANT | 128 Hz | Not disclosed | Competitive FPS |
| Counter-Strike 2 | 64-128 Hz | ~40-80 KB/s | Competitive FPS |
| Apex Legends | 20 Hz | ~60 KB/s | Battle Royale |
| Fortnite | 30 Hz | Variable | Battle Royale |
| Call of Duty: Warzone | 20 Hz | Variable | Battle Royale |

**Latency vs Bandwidth Tradeoff:**

| Rate | Update Interval | Worst-case Delay | Bandwidth Multiplier |
|------|-----------------|------------------|---------------------|
| 20 Hz | 50ms | ~75ms (5 frames @ 60fps) | 1x |
| 30 Hz | 33ms | ~50ms (3 frames @ 60fps) | 1.5x |
| 60 Hz | 16.67ms | ~33ms (2 frames @ 60fps) | 3x |

**Key Insight from Apex Legends devs**: "For triple the bandwidth and CPU costs, you can save two frames worth of latency in the best-case scenario."

### BlockGame Current Configuration

```typescript
// packages/shared/src/types/Physics.ts
PhysicsConstants = {
  PHYSICS_SIMULATION_RATE: 30,  // Server physics tick
  STATE_PATCH_RATE: 30,         // Colyseus patch rate
  CLIENT_SEND_RATE: 30,         // Client input rate
}
```

**Assessment**: 30Hz is a good balance for a puzzle game. Not a competitive shooter, so the extra latency of 20Hz vs 60Hz (two frames) is acceptable.

### Snapshot Interpolation vs State Patching

**Snapshot Interpolation** (Quake-style):
- Server sends complete world snapshots
- Client buffers 2+ snapshots
- Client interpolates between snapshots for smooth rendering
- Adds artificial latency (buffer delay)

**State Patching** (Colyseus):
- Server sends only changed properties
- Client applies patches incrementally
- No built-in interpolation (must implement client-side)
- Lower bandwidth but requires manual smoothing

**BlockGame**: Currently uses state patching with client-side interpolation via lerping:

```typescript
// packages/ui/src/game/Vehicle.ts (simplified)
// Client interpolates from current position to server position
const t = 0.3; // Faster lerp for local player
this.mesh.position.x = lerp(current.x, serverPos.x, t);
```

### StateView (Filter Decorator Replacement)

**Old API (removed in 0.16)**:
```typescript
// DEPRECATED - consumed too much CPU
@filter(function(client, value, root) {
  return client.sessionId === value.owner;
})
@type("string") secretData: string;
```

**New API (StateView)**:
```typescript
// Per-client views for filtered data
const playerView = new StateView();
playerView.add(playerState);
```

**Performance Warning**: "StateView is not optimized for big datasets yet. Each StateView adds a new encoding step."

**BlockGame Assessment**: Current implementation does not use StateView. All players see all tiles. This is correct for the game design - no hidden information.

---

## 3. Client-Side Performance

### Deserialization Cost

Colyseus schema uses **in-place mutation** rather than creating new objects:
- Patches are applied directly to existing Schema instances
- Reduces garbage collection pressure
- Triggers callbacks after patch application

**Callback Overhead:**

The `getStateCallbacks()` API creates proxy handlers for state changes:

```typescript
const $ = getStateCallbacks(room);

// Each listener adds overhead
$(player).listen('x', (x) => { /* ... */ });
$(player).listen('y', (y) => { /* ... */ });
$(player).listen('z', (z) => { /* ... */ });
```

**Best Practices:**
1. Minimize number of listeners - batch related properties
2. Avoid heavy computation in callbacks
3. Use `onAdd`/`onRemove` sparingly for large collections
4. Cache $ callbacks to avoid repeated proxy creation

### Memory Allocation Patterns

**Schema Version 3.0 Improvements:**
- Better buffer/memory allocation for messages
- Reduced GC pressure through buffer pooling
- Fixed memory leaks (e.g., `reservedSeatTimeouts`)

**BlockGame Optimization (Already Implemented):**
```typescript
// packages/server/src/rooms/GameRoom.ts
// Reusable math objects (avoid GC pressure in hot loops)
private _heldTileOffset = new Vector3(0, 0, 0);
private _playerQuat = new Quaternion(0, 0, 0, 1);
```

---

## 4. Server-Side Performance

### Encoding Cost

**ChangeTree Tracking:**
- Each Schema instance maintains its own ChangeTree
- Mutations are O(1) - just flag the property as changed
- Encoding is O(changed properties) - only processes flagged changes
- Reset after each patch cycle

**Dirty Tracking Overhead:**
Negligible for typical games. The cost is a boolean flag per property.

### Optimal Broadcast Rate

**Recommendation for BlockGame**: 30Hz is optimal.

| Rate | CPU Budget | Bandwidth | Suitability |
|------|------------|-----------|-------------|
| 20 Hz | 50ms/tick | Lower | Acceptable for slow-paced |
| **30 Hz** | 33ms/tick | Medium | **Good balance for BlockGame** |
| 60 Hz | 16.67ms/tick | High | Competitive games only |

### Room Scalability

**Per-Room Limits:**
- Each Room runs in a single Node.js process
- Reported capacity: **~1,500 CCU per room** for complex game loops
- Simple games (card/board): up to 3,000-3,500 connections
- Default Linux file descriptor limit: 1,024 (can be increased)

**Bottlenecks:**
1. CPU: Game loop complexity
2. Memory: State size per player
3. Network: WebSocket throughput
4. File descriptors: OS limits

**BlockGame Assessment**: With `maxClients = 300` and 30Hz updates, well within safe limits.

**Scaling Strategy:**
- Use Redis for multi-process coordination
- Partition large worlds into multiple rooms
- Consider spatial partitioning for MMO-scale

---

## 5. Industry Best Practices

### Server-Authoritative Architecture (VALORANT)

**Key Principles:**
- Server never trusts client's view of the world
- Fixed 128Hz physics timesteps on both client and server
- Server rewinds world state for hit validation (lag compensation)
- ~0.5 frames average network buffering

**Peeker's Advantage Formula:**
```
Advantage = Attacker_Latency + Server_Processing + Defender_Latency + Display_Latency
```

VALORANT achieves ~71ms peeker's advantage (down from ~141ms baseline) through infrastructure investment.

### Lag Compensation (Apex Legends)

**Symmetrical Lag Compensation:**
- Server acts as "time machine" - rewinds state to validate shots
- Distributes unfairness equally between high and low ping players
- Allows rural/unstable connection players to remain competitive

**Trade-off**: Occasional "I was behind cover!" deaths for low-ping players.

### Interest Management / Spatial Partitioning

**Area of Interest (AOI) Systems:**
- Divide world into zones/cells
- Only sync entities within player's AOI
- Reduces bandwidth by 2-6x for large worlds

**Implementation Patterns:**
1. **Grid-based**: Simple, efficient for uniform density
2. **Quadtree/Octree**: Adaptive for varying density
3. **Visibility-based**: Most accurate, most expensive

**Border Effect Problem:**
Players near zone boundaries may not see nearby players in adjacent zones.

**Solution**: Overlapping zones with buffer areas.

**BlockGame Assessment**: Single room (100x200 units), all players see all tiles. AOI not needed at current scale. Consider if expanding to larger worlds.

### Dead Reckoning vs Pure State Sync

**Dead Reckoning:**
```
Position_t = Position_t-1 + Velocity * dt + 0.5 * Acceleration * dt^2
```
- Predict movement between updates
- Reduces bandwidth by sending updates only when prediction error exceeds threshold
- Works well for vehicles with momentum

**Pure State Sync:**
- Send positions at fixed rate
- Client interpolates between received positions
- More bandwidth but simpler implementation

**BlockGame**: Uses state sync with client interpolation. Given the chaotic physics (tiles bouncing), dead reckoning would be inaccurate.

---

## 6. Colyseus-Specific Optimizations

### Using Primitive Types vs Nested Schemas

**Primitive (Flat):**
```typescript
@type("float32") x: number = 0;
@type("float32") y: number = 0;
@type("float32") z: number = 0;
```
- Smallest encoding size
- Each field syncs independently
- 3 separate change flags

**Nested Schema:**
```typescript
@type(Vector3Schema) position = new Vector3Schema();
```
- Adds refId overhead
- Better organization
- Can update all 3 values atomically

**BlockGame**: Uses nested `Vector3Schema` and `QuaternionSchema`. Good for code organization. Minimal overhead.

### Flattening State Structure

**Deep Nesting:**
```typescript
// More overhead
state.player.inventory.items[0].stats.damage
```

**Shallow Structure:**
```typescript
// Less overhead
state.playerDamage
```

**Recommendation**: Keep nesting to 2-3 levels max.

### Manual Dirty Flagging

For advanced optimization, use `$track()` method:

```typescript
class CustomSchema extends Schema {
  $track(field: string) {
    // Custom change detection logic
    super.$track(field);
  }
}
```

**BlockGame**: Not needed - standard tracking is sufficient.

### Custom Serialization

For extreme bandwidth optimization:

```typescript
// Pack x, y, z into single byte (values 0-7 each)
$encoder(buffer, offset) {
  buffer[offset] = (this.x << 5) | (this.y << 2) | this.z;
  return 1;
}

$decoder(buffer, offset) {
  const byte = buffer[offset];
  this.x = (byte >> 5) & 0x7;
  this.y = (byte >> 2) & 0x7;
  this.z = byte & 0x3;
  return 1;
}
```

**BlockGame**: Not recommended - adds complexity for minimal gain. Standard float32 positions are sufficient.

---

## 7. Recommendations for BlockGame

### Current State Assessment

**Already Implemented (Good):**
1. **30Hz tick rate** - Appropriate for puzzle game
2. **Sleep state tracking** - Skips sync for stationary tiles
3. **Position threshold** - Only syncs if moved > 0.05 units
4. **Rotation threshold** - Only syncs if changed > 0.01 quaternion
5. **Server-only fields** - `velocity`, `angularVelocity` not synced (bandwidth savings)
6. **Reusable math objects** - Reduces GC pressure
7. **Progressive tile spawning** - Limits active tiles to 50

### Potential Optimizations

#### 1. Type Optimization (Low Effort, Low Impact)

Current:
```typescript
@type('number') availableId: number = 0;
@type('number') frameSlotIndex: number = 0;
```

Optimized:
```typescript
@type('uint16') availableId: number = 0;  // 0-799 fits in uint16
@type('uint16') frameSlotIndex: number = 0;  // 0-399 fits in uint16
```

**Savings**: 8-10 bytes per tile update (when these fields change).

#### 2. Velocity Sync (Already Optimal)

Current implementation correctly marks velocity as server-only:
```typescript
// SERVER-ONLY FIELDS (not synced - bandwidth optimization)
velocity = new Vector3Schema();
angularVelocity = new Vector3Schema();
```

#### 3. Consider Removing `lastUpdateAt`

```typescript
lastUpdateAt: number = 0;  // SERVER-ONLY, but still occupies memory
```

If not used for gameplay logic, remove entirely.

#### 4. Batch State Updates

Instead of:
```typescript
tile.position.x = newX;
tile.position.y = newY;
tile.position.z = newZ;
```

Use:
```typescript
tile.position.set(newX, newY, newZ);  // Already doing this!
```

**Assessment**: Already optimized.

### Estimated Bandwidth Usage

**Per Tile Update** (position + rotation changed):
- Position: 12 bytes (3 x float32)
- Rotation: 16 bytes (4 x float32)
- Field headers + refId: ~4 bytes
- **Total: ~32 bytes per active tile**

**Per Player Update**:
- Position: 12 bytes
- Rotation: 4 bytes (single float for Y-axis)
- Body rotation: 16 bytes (quaternion)
- Steering: 4 bytes
- Health: 4 bytes
- Field overhead: ~6 bytes
- **Total: ~46 bytes per player**

**Scenario: 10 players, 50 active tiles, 30Hz**

Worst case (all moving):
```
(10 players * 46 bytes + 50 tiles * 32 bytes) * 30 updates/sec
= (460 + 1600) * 30
= 61,800 bytes/sec = ~60 KB/s total
```

Best case (80% tiles sleeping):
```
(460 + 320) * 30 = ~23 KB/s total
```

**Verdict**: Well within typical bandwidth limits. No urgent optimization needed.

---

## Sources

- [Colyseus State Documentation](https://docs.colyseus.io/state)
- [Colyseus Schema Definition](https://docs.colyseus.io/state/schema)
- [Colyseus Best Practices](https://docs.colyseus.io/state/best-practices)
- [Colyseus Advanced Usage](https://docs.colyseus.io/state/advanced-usage)
- [Colyseus 0.10 State Serialization](https://endel.medium.com/colyseus-0-10-introducing-the-new-state-serialization-algorithm-88409ce5a660)
- [Colyseus Schema GitHub](https://github.com/colyseus/schema)
- [Colyseus Scalability](https://docs.colyseus.io/deployment/scalability)
- [Colyseus State Views](https://docs.colyseus.io/state/view)
- [VALORANT Netcode Deep Dive](https://technology.riotgames.com/news/peeking-valorants-netcode)
- [Apex Legends Server Deep Dive](https://www.ea.com/en/games/apex-legends/apex-legends/news/servers-netcode-developer-deep-dive)
- [Gabriel Gambetta - Fast-Paced Multiplayer](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)
- [Valve Source Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking)
- [Interest Management for MOGs](https://www.dynetisgames.com/2017/04/05/interest-management-mog/)
- [SnapNet Netcode Architectures](https://snapnet.dev/blog/netcode-architectures-part-3-snapshot-interpolation/)

---

## Summary

BlockGame's current implementation follows best practices for Colyseus state synchronization:

| Aspect | Status | Notes |
|--------|--------|-------|
| Tick Rate | 30Hz | Appropriate for game type |
| Delta Encoding | Automatic | Via @colyseus/schema |
| Sleep Detection | Implemented | Skips stationary tiles |
| Position Thresholds | Implemented | 0.05 units |
| Server-only Fields | Implemented | Velocity not synced |
| GC Optimization | Implemented | Reusable math objects |
| Client Interpolation | Implemented | Lerping to server positions |

**No critical optimizations needed**. The architecture is sound and bandwidth-efficient for the intended scale of 10-50 concurrent players.
