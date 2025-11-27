import { Encoder } from '@colyseus/schema';

const DEFAULT_BUFFER_SIZE_BYTES = 512 * 1024; // 512 KB supports 400+ tiles

const envBytes = parseEnvBytes();
const desiredBufferSize = Math.max(envBytes ?? DEFAULT_BUFFER_SIZE_BYTES, 8 * 1024);

if (Encoder.BUFFER_SIZE !== desiredBufferSize) {
  Encoder.BUFFER_SIZE = desiredBufferSize;
}

export const ENCODER_BUFFER_SIZE = Encoder.BUFFER_SIZE;

function parseEnvBytes(): number | undefined {
  const rawBytes = process.env.COLYSEUS_ENCODER_BUFFER_BYTES;
  if (rawBytes) {
    const parsed = Number.parseInt(rawBytes, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const rawKb = process.env.COLYSEUS_ENCODER_BUFFER_KB;
  if (rawKb) {
    const parsedKb = Number.parseInt(rawKb, 10);
    if (Number.isFinite(parsedKb) && parsedKb > 0) {
      return parsedKb * 1024;
    }
  }

  return undefined;
}
