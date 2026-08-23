#!/usr/bin/env node
/**
 * Downloads the ffmpeg binary used to play MKV/AVI/H.265 files on the desktop
 * build. ffmpeg-static only installs the binary of the current machine, so the
 * Windows one is fetched here and shipped as an extra resource.
 */
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const RELEASE = 'b6.0';
const TARGETS = {
  win32: { asset: 'ffmpeg-win32-x64', file: 'win/ffmpeg.exe' },
  linux: { asset: 'ffmpeg-linux-x64', file: 'linux/ffmpeg' },
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2] ?? process.platform;
const target = TARGETS[platform];

if (!target) {
  console.error(`No ffmpeg download configured for ${platform}.`);
  process.exit(1);
}

const output = join(root, 'resources', target.file);
try {
  const info = await stat(output);
  if (info.size > 1_000_000) {
    console.log(`ffmpeg already present: ${output}`);
    process.exit(0);
  }
} catch {
  // Not downloaded yet.
}

const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}/${target.asset}`;
console.log(`Downloading ${url}`);
const response = await fetch(url, { redirect: 'follow' });
if (!response.ok || !response.body) {
  console.error(`Download failed: ${response.status}`);
  process.exit(1);
}

await mkdir(dirname(output), { recursive: true });
await pipeline(response.body, createWriteStream(output));
await chmod(output, 0o755);
console.log(`Saved ${output}`);
