import type { Vector3 } from '../types/Physics';

interface BoxDimensions {
  width: number;
  height: number;
  depth: number;
}

interface PlayerConfig {
  radius: number;
  cameraHeightOffset: number;
  cameraDistance: number;
  spawnHeight: number;
  maxHealth: number;
  tileDamage: number; // Damage from being hit by a shot tile
  forkDamage: number; // Damage from fork melee attack
}

interface WorldConfig {
  floor: {
    width: number;
    length: number;
    y: number;
    thickness: number;
    gridSpacing: number;
    boundaryMarkers: {
      pillarHeight: number;
      pillarDiameter: number;
      edgeHeight: number;
      edgeThickness: number;
    };
  };
  boundaries: {
    wallHeight: number;
    wallThickness: number;
    ceilingHeight: number;
  };
  frame: {
    position: Vector3;
    slotSize: number;
    slotSpacing: number;
  };
  tiles: {
    defaultCount: number;
    spawnPadding: number;
    spawnHeight: number;
    meshSize: BoxDimensions;
    assetBasePath: string;
    assetExtension: string;
  };
  player: PlayerConfig;
}

interface GroundDescriptor {
  position: Vector3;
  size: BoxDimensions;
}

export interface BoundaryDescriptor {
  name: 'north' | 'south' | 'east' | 'west' | 'ceiling';
  position: Vector3;
  size: BoxDimensions;
}

export interface RampDescriptor {
  name: string;
  position: Vector3;
  size: BoxDimensions;
  rotationX: number; // Rotation around X axis in radians (for slope angle)
}

export interface ArchDescriptor {
  name: 'blue_goal' | 'red_goal';
  position: Vector3; // Center of the goal
  width: number; // Goal width
  height: number; // Goal height
  depth: number; // Goal depth
  postRadius: number; // Radius of goal posts
  crossbarRadius: number; // Radius of crossbar
}

export interface TriggerDescriptor {
  name: 'blue_goal_trigger' | 'red_goal_trigger';
  position: Vector3; // Center of the trigger plane
  size: BoxDimensions; // Width, height, depth of trigger box
}

export const WORLD_CONFIG: WorldConfig = {
  floor: {
    width: 100,
    length: 200,
    y: 0,
    thickness: 0.5,
    gridSpacing: 5,
    boundaryMarkers: {
      pillarHeight: 5,
      pillarDiameter: 1,
      edgeHeight: 0.5,
      edgeThickness: 0.5,
    },
  },
  boundaries: {
    wallHeight: 100, // Tall walls to prevent tiles escaping
    wallThickness: 1,
    ceilingHeight: 100, // Ceiling height (closed world)
  },
  frame: {
    position: { x: 0, y: 10, z: 0 },
    slotSize: 1,
    slotSpacing: 0.2,
  },
  tiles: {
    defaultCount: 400,
    spawnPadding: 0.8,
    spawnHeight: 0.2,
    meshSize: { width: 1.2, height: 0.4, depth: 1.2 },
    assetBasePath: '/tiles/tile',
    assetExtension: '.webp', // WebP format: 85.7% smaller than PNG
  },
  player: {
    radius: 1.0, // 2-unit diameter sphere
    cameraHeightOffset: 2, // Aim camera slightly above center
    cameraDistance: 12, // Default third-person orbital distance
    spawnHeight: 30, // Drop from sky (same as tiles)
    maxHealth: 100, // Maximum player health
    tileDamage: 20, // Damage from being hit by a shot tile
    forkDamage: 5, // Damage from fork melee attack (per click)
  },
};

export const FLOOR_CONFIG = WORLD_CONFIG.floor;
export const FRAME_CONFIG = WORLD_CONFIG.frame;
export const TILE_CONFIG = WORLD_CONFIG.tiles;
export const PLAYER_CONFIG = WORLD_CONFIG.player;

export const WORLD_BOUNDS = {
  minX: -WORLD_CONFIG.floor.width / 2,
  maxX: WORLD_CONFIG.floor.width / 2,
  minZ: -WORLD_CONFIG.floor.length / 2,
  maxZ: WORLD_CONFIG.floor.length / 2,
};

export const GROUND_PLANE_DESCRIPTOR: GroundDescriptor = {
  position: {
    x: 0,
    y: WORLD_CONFIG.floor.y - WORLD_CONFIG.floor.thickness / 2,
    z: 0,
  },
  size: {
    width: WORLD_CONFIG.floor.width,
    height: WORLD_CONFIG.floor.thickness,
    depth: WORLD_CONFIG.floor.length,
  },
};

export const WORLD_BOUNDARY_SEGMENTS: BoundaryDescriptor[] = [
  {
    name: 'north',
    position: {
      x: 0,
      y: WORLD_CONFIG.boundaries.wallHeight / 2,
      z: WORLD_BOUNDS.minZ,
    },
    size: {
      width: WORLD_CONFIG.floor.width,
      height: WORLD_CONFIG.boundaries.wallHeight,
      depth: WORLD_CONFIG.boundaries.wallThickness,
    },
  },
  {
    name: 'south',
    position: {
      x: 0,
      y: WORLD_CONFIG.boundaries.wallHeight / 2,
      z: WORLD_BOUNDS.maxZ,
    },
    size: {
      width: WORLD_CONFIG.floor.width,
      height: WORLD_CONFIG.boundaries.wallHeight,
      depth: WORLD_CONFIG.boundaries.wallThickness,
    },
  },
  {
    name: 'west',
    position: {
      x: WORLD_BOUNDS.minX,
      y: WORLD_CONFIG.boundaries.wallHeight / 2,
      z: 0,
    },
    size: {
      width: WORLD_CONFIG.boundaries.wallThickness,
      height: WORLD_CONFIG.boundaries.wallHeight,
      depth: WORLD_CONFIG.floor.length,
    },
  },
  {
    name: 'east',
    position: {
      x: WORLD_BOUNDS.maxX,
      y: WORLD_CONFIG.boundaries.wallHeight / 2,
      z: 0,
    },
    size: {
      width: WORLD_CONFIG.boundaries.wallThickness,
      height: WORLD_CONFIG.boundaries.wallHeight,
      depth: WORLD_CONFIG.floor.length,
    },
  },
  // Ceiling - closes the world from above
  {
    name: 'ceiling',
    position: {
      x: 0,
      y: WORLD_CONFIG.boundaries.ceilingHeight,
      z: 0,
    },
    size: {
      width: WORLD_CONFIG.floor.width,
      height: WORLD_CONFIG.boundaries.wallThickness,
      depth: WORLD_CONFIG.floor.length,
    },
  },
];

// Ramps for jumping/launching - one on each side, launching players across the field
export const RAMP_DESCRIPTORS: RampDescriptor[] = [
  {
    name: 'ramp_west',
    position: {
      x: -40, // West side (near boundary)
      y: 1.0, // Lower position - easier access
      z: 0, // Center of field
    },
    size: {
      width: 15, // Width across (Y-axis when rotated)
      height: 5, // Height of the slope
      depth: 20, // Length of ramp (runway)
    },
    rotationX: Math.PI / 9, // ~20 degree slope - easier to climb
  },
  {
    name: 'ramp_east',
    position: {
      x: 40, // East side (near boundary)
      y: 1.0, // Lower position - easier access
      z: 0, // Center of field
    },
    size: {
      width: 15, // Width across (Y-axis when rotated)
      height: 5, // Height of the slope
      depth: 20, // Length of ramp (runway)
    },
    rotationX: -Math.PI / 9, // ~20 degree slope launching westward - easier to climb
  },
];

// Goal arches for soccer-style gameplay
export const ARCH_DESCRIPTORS: ArchDescriptor[] = [
  {
    name: 'blue_goal',
    position: {
      x: 0,
      y: 0,
      z: WORLD_BOUNDS.minZ + 5, // 5 units inside north boundary (blue side)
    },
    width: 20, // Wide goal
    height: 6, // Tall goal
    depth: 8, // Depth of goal
    postRadius: 0.3, // Post thickness
    crossbarRadius: 0.3, // Crossbar thickness
  },
  {
    name: 'red_goal',
    position: {
      x: 0,
      y: 0,
      z: WORLD_BOUNDS.maxZ - 5, // 5 units inside south boundary (red side)
    },
    width: 20,
    height: 6,
    depth: 8,
    postRadius: 0.3,
    crossbarRadius: 0.3,
  },
];

// Goal trigger planes for collision detection (invisible, event-only volumes)
// CRITICAL: Triggers must be THICK to catch fast-moving tiles
// Position is centered INSIDE the goal (behind the goal line)
export const GOAL_TRIGGER_DESCRIPTORS: TriggerDescriptor[] = [
  {
    name: 'blue_goal_trigger',
    position: {
      x: 0,
      y: ARCH_DESCRIPTORS[0].height / 2, // Center vertically within goal
      z: ARCH_DESCRIPTORS[0].position.z - 1, // Just behind goal line (1 unit = half of trigger depth)
    },
    size: {
      width: ARCH_DESCRIPTORS[0].width, // Match goal width
      height: ARCH_DESCRIPTORS[0].height, // Match goal height
      depth: 2, // Shallow trigger depth
    },
  },
  {
    name: 'red_goal_trigger',
    position: {
      x: 0,
      y: ARCH_DESCRIPTORS[1].height / 2, // Center vertically within goal
      z: ARCH_DESCRIPTORS[1].position.z + 1, // Just behind goal line (1 unit = half of trigger depth)
    },
    size: {
      width: ARCH_DESCRIPTORS[1].width, // Match goal width
      height: ARCH_DESCRIPTORS[1].height, // Match goal height
      depth: 2, // Shallow trigger depth
    },
  },
];

export function getFrameGrid(tileCount: number): { columns: number; rows: number } {
  // Hard-coded frame grid: 40 columns × 10 rows = 400 tiles
  // Ratio 4:1 (ultra-wide like panorama or cinema format)
  const columns = 40;
  const rows = 10;

  if (tileCount !== columns * rows) {
    console.warn(`[FRAME] Warning: tileCount (${tileCount}) does not match hard-coded grid (${columns}×${rows}=${columns * rows})`);
  }

  console.log(`[FRAME] Grid: ${columns} columns × ${rows} rows = ${columns * rows} tiles (ratio ${columns / rows}:1)`);
  return { columns, rows };
}

export function getTileTextureUrl(index: number): string {
  // Use WebP format (optimized: 85.7% smaller than PNG)
  return `/tiles/tile-${index}.webp`;
}

/**
 * Calculate 3D position for a frame slot
 * @param slotIndex Slot index (0-based)
 * @param tileCount Total number of tiles (determines grid size)
 * @returns Vector3 position of the slot center
 */
export function getFrameSlotPosition(slotIndex: number, tileCount: number): Vector3 {
  const { columns, rows } = getFrameGrid(tileCount);
  const { slotSize, slotSpacing, position: framePosition } = FRAME_CONFIG;

  // Calculate grid dimensions
  const horizontalSpacing = Math.max(0, columns - 1) * slotSpacing;
  const verticalSpacing = Math.max(0, rows - 1) * slotSpacing;
  const slotAreaWidth = columns * slotSize + horizontalSpacing;
  const slotAreaHeight = rows * slotSize + verticalSpacing;

  // Calculate starting position (top-left corner of grid)
  const startX = framePosition.x - slotAreaWidth / 2 + slotSize / 2;
  const startY = framePosition.y + slotAreaHeight / 2 - slotSize / 2;

  // Calculate row and column for this slot
  const row = Math.floor(slotIndex / columns);
  const col = slotIndex % columns;

  // Calculate slot position
  return {
    x: startX + col * (slotSize + slotSpacing),
    y: startY - row * (slotSize + slotSpacing),
    z: framePosition.z,
  };
}
