import { WORLD_BOUNDS } from '../config/world';
import type { Vector3 } from '../types/Physics';

/**
 * Standard world coordinates for easy access.
 * Uses "Top" for North (minZ) and "Bottom" for South (maxZ) convention.
 * Y is set to 0 (floor level).
 */
export const WORLD_COORDINATES = {
    // Center
    CENTER: { x: 0, y: 0, z: 0 } as Vector3,

    // Cardinal directions
    NORTH: { x: 0, y: 0, z: WORLD_BOUNDS.minZ } as Vector3,      // Top
    SOUTH: { x: 0, y: 0, z: WORLD_BOUNDS.maxZ } as Vector3,   // Bottom
    WEST: { x: WORLD_BOUNDS.minX, y: 0, z: 0 } as Vector3,     // Left
    EAST: { x: WORLD_BOUNDS.maxX, y: 0, z: 0 } as Vector3,    // Right

    // Corners
    NORTH_WEST: { x: WORLD_BOUNDS.minX, y: 0, z: WORLD_BOUNDS.minZ } as Vector3, // Top Left
    NORTH_EAST: { x: WORLD_BOUNDS.maxX, y: 0, z: WORLD_BOUNDS.minZ } as Vector3, // Top Right
    SOUTH_WEST: { x: WORLD_BOUNDS.minX, y: 0, z: WORLD_BOUNDS.maxZ } as Vector3, // Bottom Left
    SOUTH_EAST: { x: WORLD_BOUNDS.maxX, y: 0, z: WORLD_BOUNDS.maxZ } as Vector3, // Bottom Right
} as const;
