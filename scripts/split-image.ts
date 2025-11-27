#!/usr/bin/env bun

/**
 * Script to split a large image into 400 tiles (25 columns × 16 rows)
 *
 * Usage:
 *   bun scripts/split-image.ts <input-image-path>
 *
 * Example:
 *   bun scripts/split-image.ts ./my-picture.jpg
 *
 * Output:
 *   Tiles saved to packages/ui/public/tiles/tile-{index}.jpg
 *   - tile-0.jpg = top-left
 *   - tile-399.jpg = bottom-right
 */

import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import { existsSync } from 'fs';

// Frame grid configuration (must match world.ts)
const COLUMNS = 40;
const ROWS = 10;
const TOTAL_TILES = COLUMNS * ROWS; // 400

// Output directory
const OUTPUT_DIR = join(process.cwd(), 'packages/ui/public/tiles');

// Optimal tile size for web performance (power of 2 for GPU efficiency)
// 256px is recommended for 400 tiles - balances quality with loading time
// Can be overridden via command line: --size=512 or --size=1024
const DEFAULT_MAX_TILE_SIZE = 256;

async function splitImage(inputPath: string, maxTileSize: number = DEFAULT_MAX_TILE_SIZE) {
  console.log(`\n🖼️  Splitting image: ${inputPath}`);
  console.log(`📐 Grid: ${COLUMNS} columns × ${ROWS} rows = ${TOTAL_TILES} tiles`);
  console.log(`🎯 Target tile size: ${maxTileSize}×${maxTileSize}px (max)`);

  // Check if input file exists
  if (!existsSync(inputPath)) {
    console.error(`❌ Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Create output directory if it doesn't exist
  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Output directory: ${OUTPUT_DIR}`);

  // Load the input image
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    console.error('❌ Error: Could not read image dimensions');
    process.exit(1);
  }

  console.log(`📏 Input image size: ${metadata.width}×${metadata.height}px`);

  // Calculate tile dimensions from source image
  const sourceTileWidth = Math.floor(metadata.width / COLUMNS);
  const sourceTileHeight = Math.floor(metadata.height / ROWS);

  console.log(`✂️  Source tile size: ${sourceTileWidth}×${sourceTileHeight}px`);

  // Calculate optimized output tile size (maintain aspect ratio, max dimension = maxTileSize)
  const aspectRatio = sourceTileWidth / sourceTileHeight;
  let outputTileWidth: number;
  let outputTileHeight: number;

  if (aspectRatio > 1) {
    // Wider than tall
    outputTileWidth = Math.min(sourceTileWidth, maxTileSize);
    outputTileHeight = Math.round(outputTileWidth / aspectRatio);
  } else {
    // Taller than wide or square
    outputTileHeight = Math.min(sourceTileHeight, maxTileSize);
    outputTileWidth = Math.round(outputTileHeight * aspectRatio);
  }

  console.log(`📏 Output tile size: ${outputTileWidth}×${outputTileHeight}px (optimized)`);

  // Calculate size reduction
  const originalSize = sourceTileWidth * sourceTileHeight;
  const optimizedSize = outputTileWidth * outputTileHeight;
  const reduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
  if (originalSize > optimizedSize) {
    console.log(`💾 Pixel reduction: ${reduction}% (${originalSize}px → ${optimizedSize}px per tile)`);
  }

  // Use WebP format for optimal compression (85.7% smaller than PNG)
  const outputFormat = 'webp';
  const outputExt = '.webp';

  console.log(`💾 Output format: ${outputFormat} (optimized)`);
  console.log('\n🔄 Splitting...\n');

  // Create progress tracking
  let completed = 0;
  const startTime = Date.now();

  // Split image into tiles
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const tileIndex = row * COLUMNS + col;
      const x = col * sourceTileWidth;
      const y = row * sourceTileHeight;

      // Extract and optimize tile
      const outputPath = join(OUTPUT_DIR, `tile-${tileIndex}${outputExt}`);

      await image
        .clone()
        .extract({
          left: x,
          top: y,
          width: sourceTileWidth,
          height: sourceTileHeight,
        })
        .resize({
          width: outputTileWidth,
          height: outputTileHeight,
          fit: 'fill', // Stretch to exact size (tiles should already have correct aspect ratio)
          kernel: 'lanczos3', // High-quality downscaling
        })
        .webp({ quality: 90, lossless: false, effort: 4 }) // WebP compression
        .toFile(outputPath);

      completed++;

      // Progress bar
      const progress = Math.floor((completed / TOTAL_TILES) * 100);
      const bar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
      process.stdout.write(`\r[${bar}] ${progress}% (${completed}/${TOTAL_TILES})`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n');
  console.log(`✅ Complete! Split ${TOTAL_TILES} tiles in ${elapsed}s`);
  console.log(`📂 Tiles saved to: ${OUTPUT_DIR}`);
  console.log('\n📋 Tile numbering:');
  console.log(`   - tile-0${outputExt} = top-left corner`);
  console.log(`   - tile-${COLUMNS - 1}${outputExt} = top-right corner`);
  console.log(`   - tile-${(ROWS - 1) * COLUMNS}${outputExt} = bottom-left corner`);
  console.log(`   - tile-${TOTAL_TILES - 1}${outputExt} = bottom-right corner`);
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
🖼️  Image Splitter for BlockGame

Usage:
  bun scripts/split-image.ts <input-image-path> [--size=<max-tile-size>]

Examples:
  bun scripts/split-image.ts ./my-picture.jpg
  bun scripts/split-image.ts ./my-picture.jpg --size=1024
  bun scripts/split-image.ts ~/Downloads/landscape.png --size=256

Options:
  --size=N    Maximum tile dimension in pixels (default: ${DEFAULT_MAX_TILE_SIZE})
              Recommended: 256 (fast), 512 (balanced), 1024 (quality)
              Always use power-of-2 for GPU efficiency

Performance Guide (for 400 tiles):
  256×256   → ~4-8MB total   (RECOMMENDED - fast loading, good quality)
  512×512   → ~8-14MB total  (slower loading, better quality)
  1024×1024 → ~24-40MB total (slow loading, high quality)

Notes:
  - Grid: ${COLUMNS}×${ROWS} = ${TOTAL_TILES} tiles
  - Output: packages/ui/public/tiles/tile-{index}.webp (optimized WebP)
  - Tiles are automatically resized and optimized for web performance
  - Aspect ratio is preserved, quality is maintained with smart downsampling
`);
  process.exit(1);
}

// Parse arguments
let inputPath = '';
let maxTileSize = DEFAULT_MAX_TILE_SIZE;

for (const arg of args) {
  if (arg.startsWith('--size=')) {
    const sizeStr = arg.split('=')[1];
    const parsedSize = parseInt(sizeStr, 10);
    if (isNaN(parsedSize) || parsedSize < 64 || parsedSize > 4096) {
      console.error('❌ Error: --size must be between 64 and 4096');
      process.exit(1);
    }
    maxTileSize = parsedSize;
  } else if (!arg.startsWith('--')) {
    inputPath = arg;
  }
}

if (!inputPath) {
  console.error('❌ Error: No input image path provided');
  process.exit(1);
}

splitImage(inputPath, maxTileSize).catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
