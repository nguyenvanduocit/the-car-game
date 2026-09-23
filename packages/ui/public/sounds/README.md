# BlockGame Sound Files

This directory contains the sound effects for BlockGame. Paths and volumes are set in `SOUND_CONFIG` in `packages/ui/src/game/Sound.ts`.

## Sound Files

| File | When it plays |
|------|---------------|
| `tile-click.wav` | Clicking a tile; also used for the fork attack |
| `tile-pickup.wav` | A tile locks to you (puzzle starts) |
| `puzzle-success.wav` | Answering a puzzle correctly |
| `puzzle-failed.wav` | Answering a puzzle incorrectly |
| `tile-place.wav` | A placed tile finishes its fly animation into the frame (plays on every client, for every player's tile) |
| `charging.wav` | Holding right mouse button on a tile; loops until the tile is released |
| `tile-shot.wav` | Releasing a charged tile, either manually or automatically at max charge |
| `game-complete.wav` | Loaded, but no code plays it yet |

Other files in this directory are not loaded by the game:

- `puzzle-success.aac`, `tile-place.aac`, `tile-shot.aac`: sources for the `.wav` files. `bun scripts/convert-audio.ts` converts every `.aac` here to `.wav`.
- `ui-click.wav`: not referenced in `packages/ui/src`.

## Replacing a Sound

1. Put the new file in this directory (`packages/ui/public/sounds/`)
2. Keep the file name, or update its `path` in `SOUND_CONFIG`. BabylonJS also plays MP3 and OGG, but the configured paths are `.wav`.
3. Keep files under 1MB each for fast loading

## Download Sources

### Mixkit (Free, No Attribution Required)
https://mixkit.co/free-sound-effects/game/

### Freesound.org (CC0 License)
https://freesound.org/browse/tags/game-sound/ (filter by CC0 license). For a charging sound, search "charge up", "power up", or "energy charging" and pick one that loops well.

### OpenGameArt.org
https://opengameart.org/content/cc0-sound-effects

## License

Sounds from Mixkit are free to use under the Mixkit License (no attribution required).
Sounds from Freesound.org and OpenGameArt.org with CC0 license are public domain (no attribution required).

## Implementation

- `packages/ui/src/game/Sound.ts` defines the `GameSound` class
- Sounds load when the player clicks Connect, only if sound is enabled on the name input screen (`handleConnect()` in `main.ts`)
- Playback calls are in `game/Raycast.ts`, `network/StateSync.ts`, and `main.ts`
- `GameSound` has `setMasterVolume()` and `setMuted()` for volume control
