import { Scene, Sound, Engine } from '@babylonjs/core';

/**
 * Sound configuration for the game
 * Note: Paths can be .wav or .mp3 - BabylonJS supports both formats
 */
const SOUND_CONFIG = {
  tileClick: {
    path: '/sounds/tile-click.wav',
    volume: 0.5,
  },
  tilePickup: {
    path: '/sounds/tile-pickup.wav',
    volume: 0.6,
  },
  puzzleSuccess: {
    path: '/sounds/puzzle-success.wav',
    volume: 0.7,
  },
  puzzleFailed: {
    path: '/sounds/puzzle-failed.wav',
    volume: 0.6,
  },
  tilePlace: {
    path: '/sounds/tile-place.wav',
    volume: 0.6,
  },
  gameComplete: {
    path: '/sounds/game-complete.wav',
    volume: 0.8,
  },
  charging: {
    path: '/sounds/charging.wav',
    volume: 0.6,
    loop: true, // Loop when max charge reached
  },
  tileShot: {
    path: '/sounds/tile-shot.wav',
    volume: 0.7,
  },
} as const;

export type SoundType = keyof typeof SOUND_CONFIG;

/**
 * Sound manager for the game
 * Handles loading and playing of all game sounds
 */
export class GameSound {
  private scene: Scene;
  private sounds: Map<SoundType, Sound> = new Map();
  private initialized: boolean = false;
  private audioUnlocked: boolean = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Initialize the sound system and load all sounds
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[SOUND] Already initialized');
      return;
    }

    console.log('[SOUND] Initializing audio engine...');

    // CRITICAL: Unlock audio engine (required by browser autoplay policies)
    try {
      const engine = this.scene.getEngine() as Engine;

      // Check if audio context exists and unlock it
      if (Engine.audioEngine) {
        console.log('[SOUND] Unlocking audio engine...');
        await Engine.audioEngine.unlock();
        this.audioUnlocked = true;
        console.log('[SOUND] ✓ Audio engine unlocked');
      } else {
        console.warn('[SOUND] Audio engine not available, sounds may not play');
      }
    } catch (error) {
      console.warn('[SOUND] Could not unlock audio engine:', error);
      // Continue anyway - sounds might still work
    }

    console.log('[SOUND] Loading sound files...');

    // Load all sounds
    const loadPromises = Object.entries(SOUND_CONFIG).map(([key, config]) => {
      return this.loadSound(
        key as SoundType,
        config.path,
        config.volume,
        'loop' in config ? config.loop : false
      );
    });

    try {
      await Promise.all(loadPromises);
      this.initialized = true;
      console.log('[SOUND] All sounds loaded successfully');
    } catch (error) {
      console.error('[SOUND] Failed to load sounds:', error);
      // Continue without sounds rather than crashing
      this.initialized = true;
    }
  }

  /**
   * Load a single sound file
   */
  private async loadSound(
    key: SoundType,
    path: string,
    volume: number,
    loop: boolean = false
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const sound = new Sound(
          key,
          path,
          this.scene,
          () => {
            // Sound loaded successfully
            console.log(`[SOUND] Loaded: ${key}`);
            resolve();
          },
          {
            volume,
            autoplay: false,
            loop,
          }
        );

        this.sounds.set(key, sound);
      } catch (error) {
        console.error(`[SOUND] Failed to load ${key}:`, error);
        // Don't reject - allow game to continue without this sound
        resolve();
      }
    });
  }

  /**
   * Play a sound effect
   */
  play(soundType: SoundType): void {
    if (!this.initialized) {
      console.warn('[SOUND] Cannot play sound - not initialized yet');
      return;
    }

    if (!this.audioUnlocked) {
      console.warn('[SOUND] Audio not unlocked yet - user interaction required');
      // Try to unlock again on next play
      this.tryUnlockAudio();
      return;
    }

    const sound = this.sounds.get(soundType);
    if (!sound) {
      console.warn(`[SOUND] Sound not found: ${soundType}`);
      return;
    }

    try {
      // Stop if already playing, then play
      if (sound.isPlaying) {
        sound.stop();
      }
      sound.play();
    } catch (error) {
      console.error(`[SOUND] Failed to play ${soundType}:`, error);
    }
  }

  /**
   * Try to unlock audio (called on user interaction)
   */
  private tryUnlockAudio(): void {
    if (this.audioUnlocked) return;

    try {
      const engine = this.scene.getEngine() as Engine;
      if (Engine.audioEngine) {
        Engine.audioEngine.unlock();
        this.audioUnlocked = true;
        console.log('[SOUND] ✓ Audio unlocked on user interaction');
      }
    } catch (error) {
      // Silently fail - will try again on next play
    }
  }

  /**
   * Stop a specific sound
   */
  stop(soundType: SoundType): void {
    const sound = this.sounds.get(soundType);
    if (sound && sound.isPlaying) {
      sound.stop();
    }
  }

  /**
   * Check if a sound is playing
   */
  isPlaying(soundType: SoundType): boolean {
    const sound = this.sounds.get(soundType);
    return sound ? sound.isPlaying : false;
  }

  /**
   * Set master volume (0-1)
   */
  setMasterVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));

    this.sounds.forEach((sound, key) => {
      const config = SOUND_CONFIG[key];
      sound.setVolume(config.volume * clampedVolume);
    });
  }

  /**
   * Mute/unmute all sounds
   */
  setMuted(muted: boolean): void {
    this.sounds.forEach((sound) => {
      sound.setVolume(muted ? 0 : 1);
    });
  }

  /**
   * Check if sound system is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Dispose all sounds
   */
  dispose(): void {
    this.sounds.forEach((sound) => {
      sound.dispose();
    });
    this.sounds.clear();
    this.initialized = false;
  }
}
