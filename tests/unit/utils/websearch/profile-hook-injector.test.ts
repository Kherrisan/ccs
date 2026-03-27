import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureProfileHooks } from '../../../../src/utils/websearch/profile-hook-injector';
import { getHookPath } from '../../../../src/utils/websearch/hook-config';

describe('ensureProfileHooks', () => {
  let tempHome: string | undefined;
  let originalCcsHome: string | undefined;

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }

    tempHome = undefined;
    originalCcsHome = undefined;
  });

  it('installs the hook binary before writing the profile hook command', () => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-profile-hook-test-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;

    const ensured = ensureProfileHooks('glm');
    const hookPath = getHookPath();
    const settingsPath = path.join(tempHome, '.ccs', 'glm.settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    expect(ensured).toBe(true);
    expect(fs.existsSync(hookPath)).toBe(true);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(`node "${hookPath}"`);
  });
});
