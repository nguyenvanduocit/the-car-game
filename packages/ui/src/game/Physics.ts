import type { Scene } from '@babylonjs/core';

/**
 * Physics stub for client-side
 *
 * CLIENT DOES NOT RUN PHYSICS SIMULATION
 * This is a server-authoritative game:
 * - Server runs ALL physics (ground, boundaries, players, tiles)
 * - Client only renders positions from server state
 * - Client uses BabylonJS geometry raycasting (no physics needed)
 *
 * This stub exists to maintain compatibility with existing code
 * that references physics but doesn't actually use it.
 */
export class Physics {
  private initialized: boolean = false;

  constructor(_scene: Scene) {
    // Scene parameter accepted for compatibility but not used
  }

  /**
   * Initialize (no-op - client doesn't need physics)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[PHYSICS] Already initialized (stub)');
      return;
    }

    console.log('[PHYSICS] Client physics disabled (server-authoritative)');
    console.log('[PHYSICS] Raycasting uses BabylonJS geometry methods (no physics engine needed)');
    this.initialized = true;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Dispose (no-op)
   */
  dispose(): void {
    this.initialized = false;
  }
}
