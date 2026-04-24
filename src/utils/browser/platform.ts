export type BrowserPlatformKey = 'darwin' | 'linux' | 'win32';

export function getNodePlatformKey(
  platform: NodeJS.Platform = process.platform
): BrowserPlatformKey {
  if (platform === 'darwin') return 'darwin';
  if (platform === 'win32') return 'win32';
  return 'linux';
}
