# Colyseus State Optimization Plan (Revised)

## Goal
Reduce bandwidth and improve performance by:
1. Moving fly animation to client-side (server sends message, client animates)
2. Separating placed tiles from active tiles (different sync strategies)
3. Removing unused synced fields

## Guiding Principles
1. **Performance over anti-cheat** - This is a casual puzzle game
2. **Visual quality matters** - Smooth movement for all players
3. **Keep it simple** - Easy to iterate
4. **Client animates, server validates** - Server sends events, client renders

---

## Architecture Change: Tile Separation

### Current: Single `tiles` ArraySchema
```typescript
@type([TileSchema]) tiles = new ArraySchema<TileSchema>();
```
All 400 tiles in one array, all synced the same way.

### Proposed: Two Collections
```typescript
// Active tiles on floor - need position/rotation sync
@type({ map: ActiveTileSchema }) activeTiles = new MapSchema<ActiveTileSchema>();

// Placed tiles in frame - only need slotIndex, no position sync
@type({ map: PlacedTileSchema }) placedTiles = new MapSchema<PlacedTileSchema>();
```

**ActiveTileSchema** (tiles on floor):
- `frameSlotIndex` (identifier)
- `position` (Vector3)
- `rotation` (Quaternion)
- `state` (ON_FLOOR, LOCKED, CHARGING)
- `ownedBy` (string | null)

**PlacedTileSchema** (tiles in frame):
- `frameSlotIndex` (identifier)
- `completedBy` (display name)

**Migration flow:**
1. Tile spawns → added to `activeTiles`
2. Puzzle solved → server sends `tile_placed` message
3. Server moves tile from `activeTiles` to `placedTiles`
4. Client receives message → plays fly animation locally
5. Animation complete → client shows tile in frame position

---

## Phase 1: Client-Side Fly Animation (Biggest Win)

### Current Problem
Server animates fly position every frame (30Hz × 1.5s = 45 position updates per tile).

### Solution
1. Server sends `tile_placed` message with:
   - `tileIndex`
   - `slotIndex`
   - `startPosition` (tile's current position)
   - `startRotation` (tile's current rotation)

2. Client receives message:
   - Calculates target position from `getFrameSlotPosition(slotIndex)`
   - Calls `tileRenderer.startFlyAnimation(targetPos, targetRot)`
   - Animation runs locally (already implemented in Tile.ts!)

3. Server immediately:
   - Sets tile state to PLACED
   - Removes from `activeTiles`, adds to `placedTiles`
   - No more position sync for this tile

### Files to Modify

**Server:**
```typescript
// GameRoom.ts - placeTileInFrame()
// Before: tile.startFlyAnimation(slotPosition, targetRotation)
// After:
client.send('tile_placed', {
  tileIndex,
  slotIndex,
  startPosition: { x: tile.position.x, y: tile.position.y, z: tile.position.z },
  startRotation: { x: tile.rotation.x, ... }
});
tile.placeInFrame(); // Immediately mark as placed
```

**Client:**
```typescript
// main.ts - listen for tile_placed
room.onMessage('tile_placed', (msg) => {
  const targetPos = getFrameSlotPosition(msg.slotIndex, frameSlotCount);
  const targetRot = calculatePlacedRotation();
  const tileRenderer = stateSync.getTile(msg.tileIndex);
  tileRenderer.startFlyAnimation(targetPos, targetRot, () => {
    // Animation complete callback
  });
});
```

### Remove from TileSchema
- `flyStartedAt` - No longer needed
- `flyTargetPosition` - No longer needed
- `flyTargetRotation` - No longer needed

### Bandwidth Savings
- Before: 45 position updates × 28 bytes = 1,260 bytes per tile placement
- After: 1 message × 60 bytes = 60 bytes per tile placement
- **~95% reduction per placement event**

---

## Phase 2: Safe Field Removals (No Client Impact)

These fields are never read by the client:

### Remove from TileSchema
| Field | Type | Bytes | Reason |
|-------|------|-------|--------|
| `lockedAt` | number | 8 | Internal timing, not rendered |
| `chargingStartTime` | number | 8 | Internal timing, not rendered |
| `puzzle` | PuzzleConfigSchema | ~100 | Already sent via `show_puzzle` message |
| `velocity` | Vector3 | 12 | Client doesn't use for rendering |
| `angularVelocity` | Vector3 | 12 | Client doesn't use for rendering |
| `isSleeping` | boolean | 1 | Client can detect from position not changing |

### Remove from PlayerSchema
| Field | Type | Bytes | Reason |
|-------|------|-------|--------|
| `joinedAt` | number | 8 | Never read by client |

### DO NOT Remove (Used by Client)
| Field | Reason |
|-------|--------|
| `bodyRotation` | Client extracts yaw for player facing direction |
| `steering` | Client uses for wheel animation |
| `velocity` (player) | Keep for now - may be used for prediction |

---

## Phase 3: Optimize Active Tile Sync

### Only Sync Moving Tiles
Tiles that haven't moved in 1 second don't need position sync.

**Option A: Sleep Detection**
```typescript
// Server tracks last position change
if (tile.position changed) {
  tile.lastMoveAt = now;
}

// Only include in sync if moved recently
if (now - tile.lastMoveAt < 1000) {
  // Include in state update
}
```

**Option B: Velocity Threshold**
```typescript
// Only sync if velocity > threshold
const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
if (speed > 0.1) {
  // Include position in sync
}
```

---

## Implementation Order

### Step 1: Client-Side Fly Animation (Phase 1)
1. Add `tile_placed` message handler in client
2. Modify server `placeTileInFrame()` to send message instead of animating
3. Remove fly animation fields from TileSchema
4. Remove server-side fly animation loop code
5. Test: Tiles should fly smoothly with no position sync during flight

### Step 2: Safe Field Removals (Phase 2)
1. Remove `lockedAt`, `chargingStartTime` from TileSchema
2. Remove `puzzle` from TileSchema (verify all code uses message)
3. Remove `joinedAt` from PlayerSchema
4. Test: No visual changes, reduced bandwidth

### Step 3: Tile Collection Separation (Optional, Bigger Change)
1. Create `ActiveTileSchema` and `PlacedTileSchema`
2. Modify server to use two collections
3. Update client to handle both collections
4. Test: Placed tiles have zero bandwidth

### Step 4: Active Tile Optimization (Phase 3)
1. Add sleep detection or velocity threshold
2. Only sync moving tiles
3. Test: Sleeping tiles have zero bandwidth

---

## Estimated Impact

### Current State
- 400 tiles × 200 bytes = 80KB per full sync
- At 30Hz with delta encoding: ~500KB/sec estimated

### After Phase 1 (Fly Animation)
- No more position spam during placement
- ~20% reduction

### After Phase 2 (Field Removals)
- Per-tile: 200 bytes → 60 bytes
- ~70% reduction per tile

### After Phase 3 (Active Tile Optimization)
- Only ~50 moving tiles synced at any time
- 50 tiles × 60 bytes × 30Hz = 90KB/sec
- **~80% total reduction**

---

## Risk Mitigation

### Visual Quality Checks
- [ ] Tile fly animation looks smooth
- [ ] Placed tiles appear in correct positions
- [ ] Other players' cars face correct direction (bodyRotation kept)
- [ ] Wheel steering works (steering kept)
- [ ] No jittering or teleporting

### Rollback Plan
Each phase is independent. If issues arise:
1. Revert that specific change
2. Document why it failed
3. Try alternative approach

---

## Files to Modify

### Server
- `packages/server/src/schema/TileSchema.ts` - Remove fields
- `packages/server/src/schema/PlayerSchema.ts` - Remove joinedAt
- `packages/server/src/schema/GameRoomSchema.ts` - Tile collection changes
- `packages/server/src/rooms/GameRoom.ts` - Message-based placement

### Client
- `packages/ui/src/main.ts` - Handle `tile_placed` message
- `packages/ui/src/network/StateSync.ts` - Handle collection changes
- `packages/ui/src/game/Tile.ts` - Already has fly animation (no changes)

### Shared
- `packages/shared/src/types/Tile.ts` - Update interface
