# Security Review

Reviewed 2026-09-23 against commit `8121085`. Scope: secrets in the working tree and git history, the server entry point, every client message handler in `GameRoom`, and the database layer.

## Secrets

No secrets found.

- `gitleaks git` over all 10 commits: no leaks.
- `trufflehog git` over the full history: no findings.
- `.env.production` does not appear in any commit. `deploy.sh` and `kill-forti.sh` are gitignored and were never committed.
- `packages/ui/.env` holds only `VITE_SERVER_URL`, a public WebSocket URL.

History was rewritten on 2025-11-27 (commit `9a40fb9`). If a pre-rewrite copy was ever pushed, GitHub may still serve the old commits by SHA. Rotate any credential that was in the old `.env.production`.

## Findings

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | Critical | `/monitor` has no authentication. Its `/api/room/call` route runs `matchMaker.remoteRoomCall(roomId, method, args)` with all three values taken from the query string, so anyone who can reach the server can call any room method, including disposing the room or writing leaderboard rows. TypeScript `private` does not restrict this at runtime. | `packages/server/src/index.ts:22`, `@colyseus/monitor@0.16.7` `build/api.js:81-86` |
| 2 | High | `frame_place` places a tile and awards a point without checking tile ownership, tile state, or puzzle completion. `placeTileInFrame` does not check them either. | `packages/server/src/rooms/GameRoom.ts:879-923`, `packages/server/src/schema/GameRoomSchema.ts:99-138` |
| 3 | High | The client bundle contains every answer. The UI imports `QuestionBank`, which loads `questions.json` including `correctIndex`. The server validates answers, but players can read them in DevTools. | `packages/ui/src/main.ts:390`, `packages/shared/src/loaders/QuestionBank.ts:1,11` |
| 4 | Medium | `fork_attack` has a range check (≤ 10 units) but no cooldown. Repeated messages kill nearby players instantly. | `packages/server/src/rooms/GameRoom.ts:932-956` |
| 5 | Medium | `displayName` is not validated for type, length, or characters. Leaderboard rows are keyed by name, so a player who joins with someone else's name adds to that player's all-time score and inherits their saved session score. | `packages/server/src/rooms/GameRoom.ts:1418,1458`, `packages/server/src/database/leaderboard.ts` |
| 6 | Medium | `throttle` and `steering` are not clamped. Max speed is capped, but a large throttle reaches it instantly. | `packages/server/src/rooms/GameRoom.ts:671-675`, `packages/server/src/physics/PhysicsWorld.ts:919,964-995` |
| 7 | Low | No per-client message rate limit. Handlers log on every call and some write to SQLite. | `packages/server/src/rooms/GameRoom.ts:661-974` |
| 8 | Low | `puzzle_submit` trusts the client's `success` flag when a puzzle has no `questionId`. `PuzzleGenerator` always sets one, so the branch is unreachable today. | `packages/server/src/rooms/GameRoom.ts:787-791`, `packages/server/src/utils/PuzzleGenerator.ts:45` |

SQL queries are parameterized (`packages/server/src/database/leaderboard.ts`). The UI renders through Babylon GUI and has no `innerHTML`, `eval`, or `document.write` sinks.

## Fixes

1. Remove the `/monitor` mount, or put it behind authentication and enable it only in development.
2. Delete the `frame_place` handler. Tiles are placed by `puzzle_submit` after a correct answer.
3. Keep `correctIndex` on the server. Send the question text and options in `show_puzzle`.
4. Add a per-player cooldown to `fork_attack`.
5. Validate `displayName` in `onJoin` (string, trimmed, length limit).
6. Clamp `throttle` and `steering` to [-1, 1] and reject non-finite values.
7. Drop the client-flag fallback in `puzzle_submit`.

## Not covered

- Most of `PhysicsWorld.ts`, UI logic beyond the DOM-sink search, `packages/bots`, and `scripts/`.
- No exploit was run against a local or production server. Whether a reverse proxy blocks `/monitor` in production is unknown: the proxy config is not in this repo.
