# BlockGame Retrospective: Lessons Learned from AI-Assisted Game Development

> "The gap between a working prototype and a production system is not measured in code, but in the depth of understanding."

---

## Executive Summary

BlockGame is a multiplayer puzzle game developed in approximately 2 days using AI-assisted development (Claude Code). While the development velocity was remarkable, production deployment at scale (200 concurrent users) revealed fundamental architectural decisions that could not be easily fixed post-launch.

This document captures the key lessons learned - not as criticism, but as valuable insights for future rapid development projects.

---

## 1. The Promise of AI-Assisted Development

### What Worked Exceptionally Well

**Development velocity was extraordinary.** A complete multiplayer game - with 3D graphics, physics simulation, real-time networking, puzzle systems, and leaderboards - was built in ~2 days by someone without prior experience in:

- BabylonJS or 3D game development
- Havok physics engine
- Colyseus multiplayer networking
- WebGL rendering optimization
- Client-server game architecture

The AI served as an on-demand expert across all these domains simultaneously.

**Key Enabler: The Human as Decision Driver**

The success of AI-assisted development hinges on the human's role as the **decision driver**. The AI can:
- Implement features rapidly
- Suggest best practices
- Handle boilerplate and complexity
- Research unfamiliar APIs

But the human must:
- Define the product vision
- Make architectural decisions
- Prioritize trade-offs
- Validate assumptions against real-world constraints

> The code writes itself, but the architecture does not.

---

## 2. The Testing vs Production Gap

### What Was Tested

| Test | Participants | Network Conditions | Result |
|------|-------------|-------------------|--------|
| Alpha Test | ~10 users | Local/LAN | Passed |
| Latency Test | Remote from Da Nang | ~50-100ms latency | Passed |

Both tests validated:
- Core gameplay loop worked
- Network synchronization was smooth
- Physics felt responsive
- No obvious bugs or crashes

### What Production Revealed

At **200 concurrent users**, the server rapidly became unresponsive. The failure was not in:
- Code logic (correct)
- Client-side rendering (optimized)
- Network protocol (efficient)

The failure was **architectural** - a decision made at the beginning that could not be patched.

### The Critical Insight

> Small-scale tests validate correctness. They do not validate scalability.

Testing with 10 users on a LAN is fundamentally different from 200 users on the internet. The physics simulation that ran at 30Hz with 10 players became a bottleneck at 200 players - not because of bugs, but because of **linear scaling characteristics** that only manifest at scale.

**Lesson:** For applications targeting high concurrency, **load testing is not optional**. Simulate production conditions before deployment.

---

## 3. The Server-Authoritative Physics Mistake

### The Architecture Decision

The project adopted **server-authoritative architecture** - a well-established pattern for preventing cheating in multiplayer games. The server runs Havok physics at 30Hz and broadcasts authoritative positions to all clients.

```
Server (Single Node.js Process):
├── 200 Player physics bodies (dynamic)
├── 800 Tile physics bodies (dynamic)
├── Static world geometry
├── 30 physics steps per second
└── WebSocket broadcast to 200 clients
```

### Why It Failed at Scale

**Problem 1: WebAssembly Physics Engine**

Havok runs via WebAssembly (`@babylonjs/havok`), not native code. While WASM is fast, it:
- Cannot utilize multiple CPU cores efficiently
- Has JavaScript interop overhead on every call
- Is 2-5x slower than native C++ physics

For 200 concurrent players with 1000+ physics bodies at 30Hz:
```
Bodies per step: ~1000
Steps per second: 30
Total collision checks: O(n²) = ~15 million/second
```

A native physics engine could handle this. WASM could not.

**Problem 2: Single-Threaded JavaScript**

Node.js runs on a single thread. The physics simulation must share CPU time with:
- WebSocket message handling
- State serialization (Colyseus)
- Game logic computation
- Garbage collection

At 200 players, the 33ms budget per physics tick was consistently exceeded.

**Problem 3: Linear Bandwidth Scaling**

Even with Colyseus's efficient delta encoding, bandwidth scales with:
```
(Players × ~46 bytes + ActiveTiles × ~32 bytes) × 30Hz × Players

At 200 players, worst case:
(200 × 46 + 50 × 32) × 30 × 200 = ~60 MB/s total bandwidth
```

### The Alternative: Client-Side Physics

In hindsight, a **client-side physics with server validation** architecture would have been more scalable:

```
Client (Per Player):
├── Local physics simulation
├── Position prediction
└── Smooth rendering

Server (Lightweight):
├── Input validation only
├── Anti-cheat detection
├── Authoritative state for critical events
└── Tile placement validation
```

**Trade-offs:**

| Aspect | Server Physics | Client Physics |
|--------|---------------|----------------|
| Cheating prevention | Strong | Weaker (validation needed) |
| Server load | O(n²) bodies | O(n) messages |
| State consistency | Perfect | Minor inconsistencies |
| Implementation complexity | Simpler | More complex validation |

For a 10-minute cooperative puzzle game, minor physics inconsistencies are **acceptable**. Players don't need pixel-perfect synchronization - they need the game to work.

> Perfect consistency was pursued at the cost of any consistency at all.

---

## 4. The User Support Challenge

### The Reality of User Behavior

Despite implementing:
- Large instructional banners on the login screen
- In-game help panels
- Compass for navigation
- Clear visual indicators

Users consistently:
- Ignored all text instructions
- Clicked buttons without reading labels
- Complained about things clearly documented
- Acted on habit, not cognition

### Why This Matters

> "See text field → Type. See button → Click."

Users operate on pattern recognition and muscle memory, not conscious reading. This is not stupidity - it is **cognitive efficiency**. Reading instructions requires effort; pattern matching is automatic.

### Design Implications

1. **Tutorial through action, not text**
   - Force users to complete actions to proceed
   - Gate progress behind demonstrated understanding
   - Use visual/audio feedback, not text

2. **Default states should be correct**
   - The most common user path should require zero reading
   - Edge cases can have instructions; the happy path should be obvious

3. **Assume zero reading**
   - If critical information is in text, assume it will be missed
   - Use visual design to communicate (color, size, position, animation)

4. **Support burden planning**
   - Budget significant time for user support
   - Create video tutorials, not written guides
   - Anticipate questions and embed answers in the UI

> In the history of the universe, humanity's cognitive development is but a brief prelude. We are pattern-matching machines, not instruction-following ones.

---

## 5. What Would Be Done Differently

### Architecture Decisions

| Original Decision | Revised Decision | Rationale |
|------------------|-----------------|-----------|
| Server-authoritative physics | Client physics + server validation | 100x reduction in server load |
| WebAssembly Havok on server | No server physics / native if needed | Avoid WASM overhead at scale |
| All players in one room | Room sharding at 50 players | Horizontal scaling |
| 30Hz physics tick | 20Hz or lower for server | Reduce compute requirements |

### Development Process

1. **Load test early**
   - Simulate target capacity before feature development
   - Use synthetic clients to stress test architecture

2. **Question "best practices"**
   - Server-authoritative is best for competitive FPS
   - For cooperative puzzle games, it may be overkill
   - Match architecture to actual requirements

3. **Budget for scale testing**
   - Development is not done when features work
   - It's done when features work at target scale

### User Experience

1. **Onboarding is product**
   - Invest in tutorial design as much as feature development
   - Test with truly naive users, not team members

2. **Design for zero literacy**
   - Assume users will not read anything
   - Every critical flow should work through action alone

---

## 6. Philosophical Reflection

### On AI-Assisted Development

AI accelerates the **velocity of creation** but does not automatically improve the **quality of decisions**. The human's job has shifted from "how to implement X" to "should we implement X, and in what way?"

This is a profound shift. With AI, the bottleneck is no longer technical skill - it is **judgment**. The ability to:
- Anticipate scale problems
- Question architectural assumptions
- Simulate user behavior
- Recognize when "working" is not "ready"

### On Humility in Engineering

> The faster you can build, the faster you can build the wrong thing.

This project was a success in many ways - 200+ users played a working game that was built in 2 days. But it also revealed that **speed without wisdom is a liability**.

The lessons here are not about BabylonJS or Colyseus or physics engines. They are about:
- The gap between prototype and production
- The difference between testing and validation
- The human factors that no code can address

### On the Nature of Users

Users are not bugs to be fixed. They are humans optimizing for cognitive efficiency. When they don't read instructions, they are being rational - reading costs attention, and attention is finite.

The burden of understanding falls on the creator, not the user. This is not fair, but it is reality.

---

## 7. Technical Appendix

### Server Load Characteristics

At 200 players with server physics:

```
Physics bodies: 200 players + 50 active tiles = 250 dynamic bodies
Collision pairs: 250 × 249 / 2 = 31,125 potential pairs per step
Physics steps: 30/second
Collision checks: ~1 million per second
WASM overhead: ~3x vs native
Effective load: ~3 million collision-equivalent operations/second
```

A single-threaded Node.js process cannot sustain this.

### Bandwidth Calculation

```javascript
// Per-player state update (moving)
const perPlayerBytes = 46; // position + rotation + steering + health

// Per-tile state update (moving)
const perTileBytes = 32; // position + rotation

// 200 players, 50 active tiles, 30Hz, broadcast to all
const broadcastBytes = (200 * 46 + 50 * 32) * 30 * 200;
// = (9,200 + 1,600) * 30 * 200
// = 64,800,000 bytes/second = ~62 MB/s

// This exceeds typical server egress capacity
```

### Alternative Architecture Sketch

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT-SIDE PHYSICS                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client A                    Server                 Client B │
│  ┌────────────┐             ┌────────────┐         ┌────────│
│  │Local Havok │────Input───▶│ Validate   │◀─Input──│Local   │
│  │Physics     │             │ Anti-cheat │         │Havok   │
│  │            │◀──State────│ Tile slots │──State──▶│        │
│  │30Hz render │             │ Leaderboard│         │30Hz    │
│  └────────────┘             │ 10Hz sync  │         └────────│
│                             └────────────┘                   │
│                                                              │
│  Bandwidth: (200 × 20 bytes) × 10Hz = 40 KB/s total         │
│  Server CPU: Minimal (validation only)                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Conclusion

BlockGame was a successful experiment in AI-assisted rapid development. The game worked, users played, and the core vision was realized. But production revealed that **building fast is not the same as building right**.

The lessons here are universal:
1. Test at scale, not just for correctness
2. Question architectural "best practices" for your specific context
3. Design for users who will not read
4. The human's role in AI-assisted development is judgment, not implementation

May these lessons save future projects from the same pitfalls.

---

*Written as a retrospective for BlockGame, November 2024*
*Development time: ~2 days*
*Production failure: ~200 concurrent users*
*Time to understand why: Priceless*
