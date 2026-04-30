/**
 * Tar.gz Archive Extractor
 * Handles extraction of tar.gz archives using Node.js built-in modules.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import {
  getExecutableName,
  getArchiveBinaryName,
  DEFAULT_BACKEND,
} from '../binary/platform-detector';
import type { CLIProxyBackend } from '../types';

/**
 * Extract tar.gz archive using Node.js built-in modules
 */
export function extractTarGz(
  archivePath: string,
  destDir: string,
  verbose = false,
  backend: CLIProxyBackend = DEFAULT_BACKEND
): Promise<void> {
  return new Promise((resolve, reject) => {
    const execName = getExecutableName(backend);
    const archiveBinaryName = getArchiveBinaryName(backend);
    const gunzip = zlib.createGunzip();
    const input = fs.createReadStream(archivePath);

    let headerBuffer = Buffer.alloc(0);
    let currentFile: { name: string; size: number } | null = null;
    let bytesRead = 0;
    let fileBuffer = Buffer.alloc(0);

    const processData = (data: Buffer) => {
      headerBuffer = Buffer.concat([headerBuffer, data]);

      while (headerBuffer.length >= 512) {
        if (!currentFile) {
          const header = headerBuffer.subarray(0, 512);
          headerBuffer = headerBuffer.subarray(512);

          if (header.every((b) => b === 0)) return;

          let name = '';
          for (let i = 0; i < 100 && header[i] !== 0; i++) {
            name += String.fromCharCode(header[i]);
          }

          let sizeStr = '';
          for (let i = 124; i < 136 && header[i] !== 0; i++) {
            sizeStr += String.fromCharCode(header[i]);
          }
          const size = parseInt(sizeStr.trim(), 8) || 0;

          if (name && size > 0) {
            const baseName = path.basename(name);
            if (
              baseName === execName ||
              baseName === archiveBinaryName ||
              baseName === 'cli-proxy-api'
            ) {
              currentFile = { name: baseName, size };
              fileBuffer = Buffer.alloc(0);
              bytesRead = 0;
            } else {
              const paddedSize = Math.ceil(size / 512) * 512;
              if (headerBuffer.length >= paddedSize) {
                headerBuffer = headerBuffer.subarray(paddedSize);
              } else {
                currentFile = { name: '', size: paddedSize };
                bytesRead = 0;
              }
            }
          }
        } else {
          const remaining = currentFile.size - bytesRead;
          const chunk = headerBuffer.subarray(0, Math.min(remaining, headerBuffer.length));
          headerBuffer = headerBuffer.subarray(chunk.length);

          if (currentFile.name) fileBuffer = Buffer.concat([fileBuffer, chunk]);
          bytesRead += chunk.length;

          if (bytesRead >= currentFile.size) {
            if (currentFile.name) {
              const destPath = path.join(destDir, execName);
              fs.writeFileSync(destPath, fileBuffer);
              if (verbose)
                console.error(`[cliproxy] Extracted: ${currentFile.name} -> ${destPath}`);
            }
            const paddedSize = Math.ceil(currentFile.size / 512) * 512;
            const padding = paddedSize - currentFile.size;
            if (headerBuffer.length >= padding) headerBuffer = headerBuffer.subarray(padding);
            currentFile = null;
            fileBuffer = Buffer.alloc(0);
          }
        }
      }
    };

    input.pipe(gunzip);
    gunzip.on('data', processData);
    gunzip.on('end', resolve);
    gunzip.on('error', reject);
    input.on('error', reject);
  });
}
