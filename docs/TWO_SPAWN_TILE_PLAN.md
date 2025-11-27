# Two-Spawn Tile System - Implementation Plan

## Implementation Status: COMPLETE + OPTIMIZED

All changes have been implemented and typecheck passes.

### Performance Optimizations Applied

1. **Removed `slotFillCounts` from sync** (-400 bytes initial, no delta sync)
   - Server keeps `slotFillCounts` as plain array (not synced)
   - Client receives initial state via `slot_states` message on join
   - Live updates via existing `tile_placed` broadcast

2. **Lazy puzzle generation** (faster spawns, less memory)
   - Puzzles generated only when player picks up tile
   - Not at spawn time

### Summary of changes:

| File | Changes Made |
|------|--------------|
| `packages/server/src/schema/TileSchema.ts` | Added `spawnPhase` field (1 or 2) |
| `packages/server/src/schema/GameRoomSchema.ts` | Added `slotFillCounts` ArraySchema, updated `placeTileInFrame()` |
| `packages/shared/src/types/GameRoom.ts` | Added `SlotFillState` enum, `slotFillCounts` to interface |
| `packages/shared/src/types/Tile.ts` | Added `spawnPhase` to Tile interface |
| `packages/shared/src/types/index.ts` | Exported `SlotFillState` |
| `packages/server/src/utils/PuzzleGenerator.ts` | Added `spawnPhase` parameter for phase-based question selection |
| `packages/server/src/rooms/GameRoom.ts` | Added `needsSecondSpawn` Set, updated spawn queue, updated all handlers |
| `packages/server/src/database/roomState.ts` | Added `spawnPhase` to `PersistedTile` |
| `packages/ui/src/game/Frame.ts` | Added half-filled material and `updateSlotFillState()` method |
| `packages/ui/src/network/StateSync.ts` | Added frame reference, listener for `slotFillCounts` changes |
| `packages/ui/src/main.ts` | Wired frame to StateSync |

---

## Problem Statement

- **Current**: 400 tiles, 400 questions, 1:1 mapping
- **New**: 400 tiles, 800 questions, each tile spawns twice
- **Goal**: 200 users can answer more questions without increasing tile count (performance)

## Core Concept

```
Tile 0:
  Spawn 1 → Question 0   → Place → Slot 0 becomes HALF
  Spawn 2 → Question 400 → Place → Slot 0 becomes COMPLETE

Tile 399:
  Spawn 1 → Question 399 → Place → Slot 399 becomes HALF
  Spawn 2 → Question 799 → Place → Slot 399 becomes COMPLETE
```

**Total**: 400 tiles × 2 spawns = 800 questions answered

---

## Architecture Overview

### State Changes

| Component | Current | New |
|-----------|---------|-----|
| TileSchema | No spawn tracking | `spawnPhase: 1 \| 2` |
| GameRoomSchema.frameSlots | `string[]` (empty or filled) | Keep as-is |
| GameRoomSchema | No slot fill tracking | `slotFillCounts: number[]` (0, 1, 2) |
| unspawnedTiles | Map<frameSlotIndex, TileSchema> | Add `needsSecondSpawn: Set<number>` |
| PuzzleGenerator | `questionId = frameSlotIndex` | `questionId = frameSlotIndex + (phase-1) * 400` |

### Tile Lifecycle (Updated)

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
[NOT_SPAWNED] ──► [ON_FLOOR] ──► [LOCKED] ──► [PLACED]    │
  (pool)           (active)      (puzzle)     (in frame)  │
                       ▲                          │        │
                       │                          │        │
                       │         ┌────────────────┘        │
                       │         ▼                         │
                       │    Is spawnPhase 1?               │
                       │         │                         │
                       │    YES  │  NO                     │
                       │         ▼   ▼                     │
                       │    [NEEDS_SECOND_SPAWN]   [DONE]  │
                       │         │                         │
                       └─────────┘                         │
                    (respawn with phase 2)                 │
```

---

## Detailed Design

### 1. Schema Changes

#### TileSchema (packages/server/src/schema/TileSchema.ts)

```typescript
// ADD: New synced field
@type('uint8') spawnPhase: number = 1;  // 1 or 2

// MODIFY: Constructor
constructor(frameSlotIndex: number, spawnPhase: number = 1) {
  super();
  this.frameSlotIndex = frameSlotIndex;
  this.spawnPhase = spawnPhase;
  // ... rest unchanged
}

// ADD: Method to prepare for second spawn
prepareForSecondSpawn(): void {
  this.spawnPhase = 2;
  this.state = TileState.NOT_SPAWNED;
  this.ownedBy = null;
  this.completedBy = null;
  this.position.set(0, -1000, 0);
  this.puzzle = null;  // Will be regenerated
}
```

#### GameRoomSchema (packages/server/src/schema/GameRoomSchema.ts)

```typescript
// ADD: Slot fill tracking (0 = empty, 1 = half, 2 = complete)
@type(['uint8']) slotFillCounts = new ArraySchema<number>();

// MODIFY: initializeFrameSlots
initializeFrameSlots(tileCount: number): void {
  for (let i = 0; i < tileCount; i++) {
    this.frameSlots.push(EMPTY_FRAME_SLOT);
    this.slotFillCounts.push(0);  // NEW: All start at 0
  }
}

// ADD: New slot state helpers
isSlotEmpty(slotIndex: number): boolean {
  return this.slotFillCounts[slotIndex] === 0;
}

isSlotHalf(slotIndex: number): boolean {
  return this.slotFillCounts[slotIndex] === 1;
}

isSlotComplete(slotIndex: number): boolean {
  return this.slotFillCounts[slotIndex] === 2;
}

// MODIFY: placeTileInFrame - now handles half placement
placeTileInFrame(tileIndex: number, slotIndex: number, sessionId: string): { success: boolean; isComplete: boolean } {
  const tile = this.tiles.get(tileIndex.toString());
  if (!tile) return { success: false, isComplete: false };

  const currentFill = this.slotFillCounts[slotIndex];

  // Validation based on spawn phase
  if (tile.spawnPhase === 1 && currentFill !== 0) {
    return { success: false, isComplete: false };  // Phase 1 needs empty slot
  }
  if (tile.spawnPhase === 2 && currentFill !== 1) {
    return { success: false, isComplete: false };  // Phase 2 needs half slot
  }

  // Update fill count
  this.slotFillCounts[slotIndex] = currentFill + 1;
  const isComplete = this.slotFillCounts[slotIndex] === 2;

  // Mark frameSlots (for compatibility)
  if (isComplete) {
    this.frameSlots[slotIndex] = tileIndex.toString();
  }

  // Position tile, update player score, etc. (existing logic)
  // ...

  return { success: true, isComplete };
}
```

#### Shared Types (packages/shared/src/types/GameRoom.ts)

```typescript
// ADD: Slot fill state enum
export enum SlotFillState {
  EMPTY = 0,
  HALF = 1,
  COMPLETE = 2,
}
```

### 2. Server Logic Changes

#### GameRoom.ts - Tile Creation

```typescript
// MODIFY: createTiles - no changes needed, tiles start at phase 1
private createTiles(tileCount: number): void {
  for (let i = 0; i < tileCount; i++) {
    const tile = new TileSchema(i, 1);  // spawnPhase = 1
    // ... rest unchanged
  }
}
```

#### GameRoom.ts - New Respawn Pool

```typescript
// ADD: Track tiles needing second spawn
private needsSecondSpawn: Set<number> = new Set();  // frameSlotIndex values

// MODIFY: After first placement, add to second spawn pool
private handleTilePlaced(tile: TileSchema, slotIndex: number): void {
  if (tile.spawnPhase === 1) {
    // First spawn complete - queue for second spawn
    this.needsSecondSpawn.add(tile.frameSlotIndex);
  }
  // Remove from active tiles
  this.state.tiles.delete(tile.frameSlotIndex.toString());
}
```

#### GameRoom.ts - Spawn Next Tile (Modified)

```typescript
// MODIFY: spawnNextTile - prioritize second spawns
private spawnNextTile(): void {
  // Priority 1: Tiles needing second spawn
  if (this.needsSecondSpawn.size > 0) {
    const frameSlotIndex = this.needsSecondSpawn.values().next().value;
    this.needsSecondSpawn.delete(frameSlotIndex);
    this.spawnQueue.push({ frameSlotIndex, spawnPhase: 2 });
    return;
  }

  // Priority 2: Fresh tiles from unspawned pool
  if (this.unspawnedTiles.size > 0) {
    const [frameSlotIndex, tile] = this.unspawnedTiles.entries().next().value;
    this.unspawnedTiles.delete(frameSlotIndex);
    this.spawnQueue.push({ frameSlotIndex, spawnPhase: 1 });
  }
}
```

#### GameRoom.ts - Process Spawn Queue (Modified)

```typescript
// MODIFY: processSpawnQueue - handle both spawn phases
private processSpawnQueue(): void {
  let spawned = 0;
  while (this.spawnQueue.length > 0 && spawned < this.MAX_SPAWNS_PER_FRAME) {
    const { frameSlotIndex, spawnPhase } = this.spawnQueue.shift()!;

    let tile: TileSchema;

    if (spawnPhase === 1) {
      // First spawn - tile already exists in unspawned pool
      tile = this.unspawnedTiles.get(frameSlotIndex)!;
      this.unspawnedTiles.delete(frameSlotIndex);
    } else {
      // Second spawn - create fresh tile with phase 2
      tile = new TileSchema(frameSlotIndex, 2);
    }

    // Generate puzzle for this phase
    tile.puzzle = PuzzleGenerator.generatePuzzle(frameSlotIndex, spawnPhase);

    // Spawn at random position
    const spawnPos = this.getRandomSpawnPosition();
    tile.position.set(spawnPos.x, 30, spawnPos.z);
    tile.state = TileState.ON_FLOOR;

    // Add to synced state
    this.state.tiles.set(frameSlotIndex.toString(), tile);

    // Create physics body
    this.createTilePhysicsBody(tile);

    spawned++;
  }
}
```

#### PuzzleGenerator.ts (Modified)

```typescript
// MODIFY: generatePuzzle - accept spawnPhase parameter
static generatePuzzle(frameSlotIndex: number, spawnPhase: number = 1): PuzzleConfigSchema {
  // Calculate questionId based on phase
  // Phase 1: questions 0-399
  // Phase 2: questions 400-799
  const questionId = frameSlotIndex + (spawnPhase - 1) * 400;

  const question = QuestionBank.get(questionId);
  if (!question) {
    throw new Error(`Question ${questionId} not found for tile ${frameSlotIndex} phase ${spawnPhase}`);
  }

  return new PuzzleConfigSchema(
    PuzzleType.MULTIPLE_CHOICE,
    1,
    emptyData,
    0, 0,
    questionId.toString()
  );
}
```

### 3. Client Changes

#### Frame.ts - Half-Filled Visual

```typescript
// ADD: Materials for slot states
private halfFilledMaterial: StandardMaterial;

// MODIFY: createSlotMeshes - add half-filled material
private createMaterials(): void {
  // ... existing materials ...

  // Half-filled: semi-transparent or different color
  this.halfFilledMaterial = new StandardMaterial('halfFilledMat', this.scene);
  this.halfFilledMaterial.diffuseColor = new Color3(0.4, 0.6, 0.3);  // Muted green
  this.halfFilledMaterial.alpha = 0.7;
}

// ADD: Update slot to half-filled state
setSlotHalf(slotIndex: number): void {
  const slot = this.slotMeshes[slotIndex];
  slot.material = this.halfFilledMaterial;
  slot.metadata.fillState = 1;
}

// MODIFY: fillSlot - now for complete state
fillSlot(slotIndex: number): void {
  const slot = this.slotMeshes[slotIndex];
  slot.isVisible = false;  // Hide completely when full
  slot.metadata.fillState = 2;
}
```

#### StateSync.ts - Listen to slotFillCounts

```typescript
// ADD: Sync slot fill counts
private setupSlotFillSync(): void {
  const $ = getStateCallbacks(this.room);

  // Listen to slotFillCounts changes
  $(this.room.state.slotFillCounts).onChange((value, index) => {
    if (value === 1) {
      this.frame.setSlotHalf(index);
    } else if (value === 2) {
      this.frame.fillSlot(index);
    }
  });
}
```

### 4. Database Changes

#### Schema Update

```sql
-- Modify tiles table to track spawn phase
ALTER TABLE tiles ADD COLUMN spawnPhase INTEGER DEFAULT 1;

-- Modify slots tracking (or add new table)
-- Option A: Track in tiles table (current approach)
-- Option B: Separate slots table
CREATE TABLE IF NOT EXISTS slot_fills (
  slotIndex INTEGER PRIMARY KEY,
  fillCount INTEGER DEFAULT 0,
  phase1CompletedBy TEXT,
  phase2CompletedBy TEXT
);
```

#### Persistence Logic

```typescript
// When saving placed tile
persistTile(tile: TileSchema): void {
  // ... existing fields ...
  spawnPhase: tile.spawnPhase,
}

// When restoring
restoreSlotFillCounts(): void {
  // Count placed tiles per slot to restore fill counts
  for (const tile of placedTiles) {
    this.state.slotFillCounts[tile.frameSlotIndex]++;
  }
}
```

---

## Visual Design Options

### Option A: Opacity Change (Simplest)
- Empty: Dark slot visible (current)
- Half: Slot at 50% opacity, slight color tint
- Complete: Slot hidden, tile visible

### Option B: Split Image (More Complex)
- Half: Show top-half or left-half of tile image
- Complete: Show full tile image
- Requires texture manipulation

### Option C: Overlay Icon (Medium)
- Half: Show slot with "1/2" badge or progress indicator
- Complete: Normal filled appearance

**Recommendation**: Start with Option A (simplest), iterate if needed.

---

## Implementation Order

### Phase 1: Schema & Types (Low Risk)
1. Add `spawnPhase` to TileSchema
2. Add `slotFillCounts` to GameRoomSchema
3. Add SlotFillState enum to shared types
4. Update TileSchema constructor

### Phase 2: Server Logic (Medium Risk)
1. Modify `initializeFrameSlots()` to initialize slotFillCounts
2. Add `needsSecondSpawn` Set to GameRoom
3. Modify `placeTileInFrame()` for two-phase logic
4. Modify `spawnNextTile()` to prioritize second spawns
5. Modify `processSpawnQueue()` to handle both phases
6. Update PuzzleGenerator for phase-based question selection

### Phase 3: Client Updates (Low Risk)
1. Add half-filled material to Frame
2. Add `setSlotHalf()` method
3. Update StateSync to listen to slotFillCounts
4. Test visual feedback

### Phase 4: Database & Persistence (Medium Risk)
1. Update schema for spawnPhase column
2. Modify save/restore logic
3. Test server restart recovery

### Phase 5: Testing & Polish
1. Unit tests for new logic
2. Integration tests for full lifecycle
3. Load test with 200 simulated users
4. Visual polish

---

## Edge Cases & Considerations

### 1. Question Count Mismatch
- Current: 778 questions
- Needed: 800 questions (400 × 2)
- **Action**: Either add 22 questions OR reduce tiles to 389

### 2. Same Player Places Both Halves
- **Decision**: Allow (no restriction)
- Both placements count toward their score

### 3. Tile Shot/Returned After Placement
- If phase 1 tile returns to floor: slot stays at fillCount=0 (not placed yet)
- Only increment fillCount on successful placement

### 4. Server Restart Mid-Game
- Must restore both `slotFillCounts` and which tiles need second spawn
- Tiles in `needsSecondSpawn` should be persisted or reconstructed

### 5. Leaderboard Scoring
- **Option A**: Each placement = 1 point (800 total points possible)
- **Option B**: Only complete slots = 1 point (400 total points)
- **Recommendation**: Option A (more engagement)

### 6. Active Tile Limit
- Current MAX_ACTIVE_TILES = 50
- With two spawns, effective pool is larger
- May need to adjust if floor gets crowded

---

## Questions to Confirm Before Implementation

1. **Visual feedback**: Opacity change (simple) or split image (complex)?
2. **Scoring**: 1 point per placement or per complete slot?
3. **Question count**: Add 22 questions to reach 800, or reduce tiles?
4. **Priority**: Should phase-2 tiles spawn immediately after phase-1 placement, or mix with other tiles?

---

## Estimated Changes Summary

| File | Changes |
|------|---------|
| TileSchema.ts | +15 lines (spawnPhase field, method) |
| GameRoomSchema.ts | +40 lines (slotFillCounts, helpers, modified placement) |
| GameRoom.ts | +60 lines (spawn logic, respawn pool) |
| PuzzleGenerator.ts | +5 lines (phase parameter) |
| Frame.ts | +30 lines (half-filled visual) |
| StateSync.ts | +15 lines (slotFillCounts listener) |
| shared/types | +10 lines (SlotFillState enum) |
| Database | +20 lines (schema, persistence) |

**Total**: ~195 lines of changes across 8 files
