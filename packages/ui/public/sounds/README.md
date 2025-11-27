# BlockGame Sound Files

This directory contains all sound effects for BlockGame.

## Required Sound Files

To complete the sound implementation, download the following files from free sources:

1. **tile-click.wav** (or .mp3) - Played when clicking a tile
2. **tile-pickup.wav** (or .mp3) - Played when successfully picking up a tile (puzzle locked)
3. **puzzle-success.wav** (or .mp3) - Played when completing a puzzle correctly
4. **puzzle-failed.wav** (or .mp3) - Played when answering puzzle incorrectly
5. **tile-place.wav** (or .mp3) - Played when placing a tile in the frame
6. **game-complete.wav** (or .mp3) - Played when all tiles are placed and game is complete
7. **charging.wav** (or .mp3) - Played when charging a tile shot (hold right mouse button), loops when max charge reached
8. **tile-shot.wav** - Played when releasing a charged tile (shooting the tile)


**Note:** File extensions can be either .wav or .mp3 - both formats are supported by BabylonJS

## Download Sources

### Recommended: Mixkit (Free, No Attribution Required)
Visit https://mixkit.co/free-sound-effects/game/ and download (WAV or MP3):
- "Video game retro click" → tile-click.wav (or .mp3)
- "Winning a coin, video game" → tile-pickup.wav (or .mp3)
- "Game level completed" → puzzle-success.wav (or .mp3)
- Search for "error", "wrong", or "buzzer" → puzzle-failed.wav (or .mp3)
- "Completion of a level" → tile-place.wav (or .mp3)
- "Magic sweep game trophy" → game-complete.wav (or .mp3)

### For Charging Sound:
Visit https://freesound.org/search/?q=charge+up&f=tag:game (CC0 license)
- Search for "charge up", "power up", or "energy charging"
- Find a sound that builds up over ~2 seconds and loops well
- Download and rename to charging.wav (or .mp3)

### Alternative: Freesound.org (CC0 License)
Visit https://freesound.org/browse/tags/game-sound/ and filter by CC0 license

### Alternative: OpenGameArt.org
Visit https://opengameart.org/content/cc0-sound-effects

## File Format
- **Recommended:** WAV (higher quality, uncompressed)
- **Alternative:** MP3 (smaller file size, compressed)
- **Both formats work:** BabylonJS supports WAV, MP3, OGG
- **Size:** Keep files under 1MB each for fast loading

## Testing Sounds

After downloading the files:
1. Place all WAV/MP3 files in this directory (`packages/ui/public/sounds/`)
2. Start the game with `bun run dev`
3. Sounds will play automatically during gameplay:
   - Click a tile → hear tile-click.wav
   - Tile locks to you → hear tile-pickup.wav
   - Complete puzzle correctly → hear puzzle-success.wav
   - Answer puzzle incorrectly → hear puzzle-failed.wav
   - Tile lands in frame slot → hear tile-place.wav (plays ~0.8s after clicking slot, when tile actually lands)
   - Complete game → hear game-complete.wav
   - Hold right mouse button on tile → hear charging.wav (loops when max charge reached)
   - Release right mouse button → hear tile-shot.wav (tile is shot/released)


## Placeholder Files

If you want to test the implementation before downloading real sounds, you can create silent placeholder files:

```bash
# Create silent WAV files (requires ffmpeg)
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 tile-click.wav
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 tile-pickup.wav
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 puzzle-success.wav
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 puzzle-failed.wav
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 tile-place.wav
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 2 game-complete.wav
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 2 charging.wav
```

## License

All recommended sounds from Mixkit are free to use under the Mixkit License (no attribution required).
Sounds from Freesound.org and OpenGameArt.org with CC0 license are public domain (no attribution required).

## Implementation

Sound system is implemented in:
- `packages/ui/src/game/Sound.ts` - Sound manager class
- Sounds are loaded on game initialization
- Sounds are triggered automatically based on game events
- Volume can be controlled via the GameSound class methods
