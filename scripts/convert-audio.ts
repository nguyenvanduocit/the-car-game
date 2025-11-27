#!/usr/bin/env bun

/**
 * Script to convert all .aac files to .wav format in the sounds directory
 * Usage: bun scripts/convert-audio.ts
 */

import { readdirSync } from 'fs';
import { join } from 'path';

const SOUNDS_DIR = 'packages/ui/public/sounds';

async function convertAudioFiles() {
  console.log(`🔍 Scanning ${SOUNDS_DIR} for .aac files...`);

  // Check if ffmpeg is available
  try {
    await Bun.$`which ffmpeg`.quiet();
  } catch {
    console.error('❌ ffmpeg not found. Please install it first:');
    console.error('   brew install ffmpeg');
    process.exit(1);
  }

  // Read all files in sounds directory
  const files = readdirSync(SOUNDS_DIR);
  const aacFiles = files.filter(file => file.endsWith('.aac'));

  if (aacFiles.length === 0) {
    console.log('✅ No .aac files found to convert');
    return;
  }

  console.log(`📝 Found ${aacFiles.length} .aac file(s) to convert`);

  // Convert each .aac file to .wav
  for (const aacFile of aacFiles) {
    const inputPath = join(SOUNDS_DIR, aacFile);
    const outputPath = inputPath.replace(/\.aac$/, '.wav');

    console.log(`\n🔄 Converting: ${aacFile}`);

    try {
      // Convert using ffmpeg with high quality settings
      await Bun.$`ffmpeg -i ${inputPath} -acodec pcm_s16le -ar 44100 ${outputPath} -y`;
      console.log(`✅ Created: ${outputPath}`);
    } catch (error) {
      console.error(`❌ Failed to convert ${aacFile}:`, error);
    }
  }

  console.log('\n🎉 Conversion complete!');
}

convertAudioFiles();
