// Re-export all types from types directory
export * from './types';

// Shared world configuration exports
export {
  WORLD_CONFIG,
  FLOOR_CONFIG,
  FRAME_CONFIG,
  TILE_CONFIG,
  PLAYER_CONFIG,
  WORLD_BOUNDS,
  WORLD_BOUNDARY_SEGMENTS,
  GROUND_PLANE_DESCRIPTOR,
  RAMP_DESCRIPTORS,
  ARCH_DESCRIPTORS,
  GOAL_TRIGGER_DESCRIPTORS,
  getFrameGrid,
  getFrameSlotPosition,
} from './config/world';

export type { RampDescriptor, ArchDescriptor, BoundaryDescriptor, TriggerDescriptor } from './config/world';

// Player metrics and dimensions (OLD - will be replaced by vehicle)
export {
  BASE_SIZE,
  BODY_METRICS,
  HEAD_METRICS,
  LEG_METRICS,
  ARM_METRICS,
  CAR_METRICS,
  PLAYER_LAYOUT,
  PHYSICS_BOX,
  getLegGroundContactY,
  getPhysicsBodyYForGround,
  debugPrintMetrics,
} from './config/playerMetrics';

// Vehicle metrics and dimensions (NEW)
export {
  WHEEL_METRICS,
  CHASSIS_METRICS,
  CAR_BODY_DIMENSIONS,
  FORK_METRICS,
  VEHICLE_LAYOUT,
  TILE_ATTACH_POINT,
  getWheelGroundContactY,
  getWheelRotationFromDistance,
} from './config/vehicleMetrics';

// Re-export vehicle's PHYSICS_BOX as VEHICLE_PHYSICS_BOX to avoid conflict
export { PHYSICS_BOX as VEHICLE_PHYSICS_BOX } from './config/vehicleMetrics';
export { debugPrintMetrics as debugPrintVehicleMetrics } from './config/vehicleMetrics';

export {
  EMPTY_FRAME_SLOT,
  isFrameSlotEmpty,
  isFrameSlotFilled,
} from './constants/frame';

export { WORLD_COORDINATES } from './constants/coordinates';

// Question bank loader
export { QuestionBank, type Question } from './loaders/QuestionBank';
