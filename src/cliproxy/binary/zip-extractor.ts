/**
 * Zip Archive Extractor
 * Handles extraction of zip archives using Node.js built-in modules.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { getExecutableName, getArchiveBinaryName, DEFAULT_BACKEND } from '../binary/platform-detector';
import type { CLIProxyBackend } from '../types';

/**
 * Extract zip archive using Node.js (simple implementation)
 */
export function extractZip(
  archivePath: string,
  destDir: string,
  verbose = false,
  backend: CLIProxyBackend = DEFAULT_BACKEND
): Promise<void> {
  return new Promise((resolve, reject) => {
    const execName = getExecutableName(backend);
    const archiveBinaryName = getArchiveBinaryName(backend);
    const buffer = fs.readFileSync(archivePath);

    // Find End of Central Directory record (EOCD)
    let eocdOffset = buffer.length - 22;
    while (eocdOffset >= 0) {
      if (buffer.readUInt32LE(eocdOffset) === 0x06054b50) break;
      eocdOffset--;
    }

    if (eocdOffset < 0) {
      reject(new Error('Invalid ZIP file: EOCD not found'));
      return;
    }

    const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
    let offset = centralDirOffset;

    while (offset < eocdOffset) {
      const sig = buffer.readUInt32LE(offset);
      if (sig !== 0x02014b50) break;

      const compressionMethod = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const uncompressedSize = buffer.readUInt32LE(offset + 24);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraFieldLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);

      const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);
      const baseName = path.basename(fileName);

      if (
        baseName === execName ||
        baseName === archiveBinaryName ||
        baseName === 'cli-proxy-api.exe'
      ) {
        const localOffset = localHeaderOffset;
        const localSig = buffer.readUInt32LE(localOffset);

        if (localSig !== 0x04034b50) {
          reject(new Error('Invalid local file header'));
          return;
        }

        const localFileNameLength = buffer.readUInt16LE(localOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localOffset + 28);
        const dataOffset = localOffset + 30 + localFileNameLength + localExtraLength;

        let fileData: Buffer;
        if (compressionMethod === 0) {
          fileData = buffer.subarray(dataOffset, dataOffset + compressedSize);
        } else if (compressionMethod === 8) {
          const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
          fileData = zlib.inflateRawSync(compressed);
        } else {
          reject(new Error(`Unsupported compression method: ${compressionMethod}`));
          return;
        }

        if (fileData.length !== uncompressedSize) {
          reject(new Error('Decompression size mismatch'));
          return;
        }

        const destPath = path.join(destDir, execName);
        fs.writeFileSync(destPath, fileData);
        if (verbose) console.error(`[cliproxy] Extracted: ${fileName} -> ${destPath}`);
        resolve();
        return;
      }

      offset += 46 + fileNameLength + extraFieldLength + commentLength;
    }

    reject(new Error(`Executable not found in archive: ${execName}`));
  });
}
