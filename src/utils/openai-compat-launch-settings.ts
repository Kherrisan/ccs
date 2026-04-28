import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { Settings } from '../types/config';
import { stripAnthropicRoutingEnv } from './shell-executor';

export function createOpenAICompatLaunchSettingsPath(
  settingsPath: string,
  settings: Settings
): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-openai-compat-settings-'));
  fs.chmodSync(tempDir, 0o700);

  const launchSettings = JSON.parse(JSON.stringify(settings)) as Settings;
  const sanitizedEnv = Object.fromEntries(
    Object.entries(stripAnthropicRoutingEnv({ ...(launchSettings.env ?? {}) })).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );

  if (Object.keys(sanitizedEnv).length > 0) {
    launchSettings.env = sanitizedEnv;
  } else {
    delete launchSettings.env;
  }

  const launchSettingsPath = path.join(tempDir, path.basename(settingsPath));
  fs.writeFileSync(launchSettingsPath, JSON.stringify(launchSettings, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });

  return launchSettingsPath;
}
