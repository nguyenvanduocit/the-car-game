# Client-Side Prediction Implementation

## Overview
Implement client-side prediction to eliminate vehicle jitter caused by 30Hz server physics updates.

## Current Problem
- Server physics: 30Hz (33ms/step)
- Client render: 60fps (16.6ms/frame)
- Vehicle snaps to new position every ~2 frames → JITTER

## Solution
Client predicts local player position using local physics, server validates and corrects when needed.

---

## Implementation Status: COMPLETED ✅

### Phase 1: Client Physics Setup ✅
- [x] **1.1** Initialize Havok physics engine on client
  - File: `packages/ui/src/game/Physics.ts`
  - Import HavokPhysics and create plugin
  - Enable physics on scene with same gravity as server (-20)

- [x] **1.2** Create ground plane physics body on client
  - Same dimensions as server (using GROUND_PLANE_DESCRIPTOR)
  - Static body, friction 0.9

- [x] **1.3** Create boundary walls on client
  - 4 walls at world edges (using WORLD_BOUNDARY_SEGMENTS)
  - Static bodies

- [x] **1.4** Create local player physics body
  - Only for local player (not remote players)
  - Same config as server: mass 20, VEHICLE_PHYSICS_BOX size
  - Dynamic body with same damping values
  - Center of mass offset for stability

### Phase 2: Local Physics Loop ✅
- [x] **2.1** Add physics step to render loop
  - File: `packages/ui/src/network/StateSync.ts`
  - Step physics each frame (60Hz) via `stepPhysics()`
  - Use deltaTime for accurate simulation

- [x] **2.2** Create applyCarControls method on client
  - File: `packages/ui/src/game/Physics.ts`
  - Same logic as server: throttle → forward force, steering → rotation
  - Match server physics constants exactly

### Phase 3: Input Handling Changes ✅
- [x] **3.1** Apply input to local physics immediately
  - File: `packages/ui/src/game/PlayerInput.ts`
  - On key press: apply to local physics FIRST
  - Then send to server as before

- [~] **3.2** Input sequence tracking (DEFERRED)
  - Not implemented - basic reconciliation is sufficient for now
  - Can be added later if prediction quality needs improvement

### Phase 4: Server Changes (NOT NEEDED)
- Server already has all required functionality
- No changes needed for basic prediction to work

### Phase 5: Server Reconciliation ✅
- [x] **5.1** Create reconciliation logic
  - File: `packages/ui/src/network/StateSync.ts`
  - On server position update: compare local vs server position
  - If diff > RECONCILIATION_THRESHOLD (2.0 units): correct

- [x] **5.2** Implement position correction
  - Snap local physics body to server position
  - Zero velocity to prevent drift after correction

- [x] **5.3** Rotation reconciliation
  - Compare quaternion dot product
  - Correct if rotation differs too much

### Phase 6: Vehicle Renderer Integration ✅
- [x] **6.1** Update StateSync to use local physics
  - File: `packages/ui/src/network/StateSync.ts`
  - Local player: read position from `physics.getLocalPlayerPosition()`
  - Remote players: keep using server state + interpolation

- [x] **6.2** Update VehicleRenderer to use predicted position
  - Local player mesh updated directly from physics prediction
  - No interpolation needed for local player (physics runs at 60fps)

### Phase 7: Wire-up and Integration ✅
- [x] **7.1** Create physics body when local player joins
  - StateSync creates body in onAdd callback

- [x] **7.2** Wire physics to PlayerInput
  - main.ts: `playerInput.setPhysics(stateSync.getPhysics())`

---

## File Changes Summary

| File | Changes |
|------|---------|
| `packages/ui/src/game/Physics.ts` | Full rewrite: init Havok, create bodies, step(), applyCarControls() |
| `packages/ui/src/game/PlayerInput.ts` | Added setPhysics(), apply controls to local physics |
| `packages/ui/src/network/StateSync.ts` | Added prediction, reconciliation, stepPhysics() |
| `packages/ui/src/main.ts` | Wire physics to input |

---

## Constants Matched (Server ↔ Client)

```typescript
// ClientPhysicsConstants in Physics.ts matches server exactly
GRAVITY: -20.0
PLAYER_MASS: 20.0
PLAYER_MOVEMENT_FORCE: 1000.0
PLAYER_MAX_SPEED: 25.0
PLAYER_LINEAR_DAMPING: 0.5
PLAYER_ANGULAR_DAMPING: 0.3
PLAYER_FRICTION: 0.9
PLAYER_RESTITUTION: 0.1
PLAYER_STEERING_SPEED: 2.0
PLAYER_MAX_STEERING_ANGLE: 1.5
GROUND_FRICTION: 0.9
GROUND_RESTITUTION: 0.1
WALL_FRICTION: 0.2
WALL_RESTITUTION: 0.5
```

---

## Reconciliation Thresholds

```typescript
RECONCILIATION_THRESHOLD = 2.0; // Units - snap if position differs more
RECONCILIATION_ROTATION_THRESHOLD = 0.3; // Radians - snap if rotation differs more
```

---

## Success Criteria

- [x] Local player movement feels instant (0 perceived latency)
- [ ] No visible jitter during normal gameplay (TESTING NEEDED)
- [ ] Corrections are rare and smooth when they happen (TESTING NEEDED)
- [x] Remote players still use interpolation (unchanged)
- [x] Server still validates all positions (unchanged)
