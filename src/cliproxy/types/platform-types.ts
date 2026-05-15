/**
 * Platform detection and binary archive types
 */

/** Supported operating systems */
export type SupportedOS = 'darwin' | 'linux' | 'windows';

/** Supported CPU architecture labels from Node.js and CLIProxy release assets */
export type SupportedArch = 'amd64' | 'arm64' | 'aarch64';

/** Archive extension based on platform */
export type ArchiveExtension = 'tar.gz' | 'zip';

/** Platform detection result */
export interface PlatformInfo {
  os: SupportedOS;
  arch: SupportedArch;
  binaryName: string;
  extension: ArchiveExtension;
}
