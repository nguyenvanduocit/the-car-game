import { Scene, Vector3 } from '@babylonjs/core';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { TileRenderer } from './Tile';
import type { Physics } from './Physics';

/**
 * Object Pool for TileRenderer instances
 * Reduces Garbage Collection pauses by reusing tile objects
 *
 * Key scheme:
 * - Available tiles: availableId (0-799)
 * - Placed tiles: 1000 + frameSlotIndex (1000-1399) to avoid collision
 */
export class TilePool {
    private scene: Scene;
    private physics: Physics;
    private shadowGenerator: ShadowGenerator | null = null;

    // Pool storage
    private pool: TileRenderer[] = [];
    private active: Map<number, TileRenderer> = new Map();

    // Stats
    private createdCount: number = 0;

    constructor(scene: Scene, physics: Physics, initialSize: number = 50) {
        this.scene = scene;
        this.physics = physics;
        this.prewarm(initialSize);
    }

    /**
     * Set shadow generator for new tiles
     */
    setShadowGenerator(shadowGenerator: ShadowGenerator): void {
        this.shadowGenerator = shadowGenerator;
    }

    /**
     * Prewarm the pool with a set number of tiles
     */
    prewarm(count: number): void {
        console.log(`[TILE POOL] Prewarming pool with ${count} tiles...`);
        const startTime = performance.now();

        for (let i = 0; i < count; i++) {
            const tile = new TileRenderer(
                this.scene,
                this.physics,
                i, // tileIndex as number
                new Vector3(0, -1000, 0) // Hidden
            );
            tile.setVisible(false);
            this.pool.push(tile);
        }

        const duration = performance.now() - startTime;
        console.log(`[TILE POOL] Prewarming complete. Created ${count} tiles in ${duration.toFixed(2)}ms`);
    }

    /**
     * Acquire a tile from the pool
     * @param frameSlotIndex - Tile slot index (0-399)
     */
    acquire(
        frameSlotIndex: number,
        position: Vector3,
        rotation?: { x: number; y: number; z: number; w: number },
        textureUrl: string = '/tiles/tile-0.webp'
    ): TileRenderer {
        let tile: TileRenderer;

        // Check if we have available tiles
        if (this.pool.length > 0) {
            tile = this.pool.pop()!;
            tile.reset(frameSlotIndex, position, rotation, textureUrl);
        } else {
            // Create new tile if pool is empty
            tile = new TileRenderer(this.scene, this.physics, frameSlotIndex, position, rotation);
            if (textureUrl !== '/tiles/tile-0.webp') {
                tile.swapTexture(textureUrl);
            }
            this.createdCount++;
        }

        // Add to active map
        this.active.set(frameSlotIndex, tile);

        return tile;
    }

    /**
     * Release a tile back to the pool
     * @param frameSlotIndex - Tile slot index (0-399)
     */
    release(frameSlotIndex: number): void {
        const tile = this.active.get(frameSlotIndex);

        if (tile) {
            this.active.delete(frameSlotIndex);
            tile.setVisible(false);
            this.pool.push(tile);
            console.log(`[TILE POOL] Released tile ${frameSlotIndex}. Available: ${this.pool.length}, Active: ${this.active.size}`);
        } else {
            console.warn(`[TILE POOL] Tried to release unknown tile ${frameSlotIndex}`);
        }
    }

    /**
     * Get active tile by index
     * @param frameSlotIndex - Tile slot index (0-399)
     */
    getTile(frameSlotIndex: number): TileRenderer | undefined {
        return this.active.get(frameSlotIndex);
    }

    /**
     * Get all active tiles
     */
    getActiveTiles(): Map<number, TileRenderer> {
        return this.active;
    }

    /**
     * Get pool statistics
     */
    getStats() {
        return {
            active: this.active.size,
            available: this.pool.length,
            totalCreated: this.createdCount
        };
    }

    /**
     * Dispose all tiles in the pool
     */
    dispose(): void {
        // Dispose active tiles
        this.active.forEach(tile => tile.dispose());
        this.active.clear();

        // Dispose available tiles
        this.pool.forEach(tile => tile.dispose());
        this.pool = [];
    }
}
