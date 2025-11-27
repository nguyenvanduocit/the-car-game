/**
 * Sentinel value used for empty frame slots in Colyseus ArraySchemas.
 * Colyseus arrays don't support storing `null`/`undefined`, so we use a
 * unique string that can never collide with nanoid-generated tile IDs.
 */
export const EMPTY_FRAME_SLOT = '__EMPTY_SLOT__!';

/**
 * Check if a frame slot value represents an empty slot.
 */
export function isFrameSlotEmpty(value: string | null | undefined): boolean {
  return value === undefined || value === null || value === EMPTY_FRAME_SLOT;
}

/**
 * Check if a frame slot value has been filled with a tile ID.
 */
export function isFrameSlotFilled(value: string | null | undefined): boolean {
  return !isFrameSlotEmpty(value);
}
