import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  hasImageAnalyzerHook,
  installImageAnalyzerHook,
} from '../../../../src/utils/hooks/image-analyzer-hook-installer';
import { prepareImageAnalysisFallbackHook } from '../../../../src/utils/hooks';

describe('image-analyzer-hook-installer', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let runtimePath = '';
  let bundledRuntimePath = '';

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-image-analyzer-hook-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;

    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      'version: 12\nimage_analysis:\n  enabled: true\n',
      'utf8'
    );

    runtimePath = path.join(ccsDir, 'hooks', 'image-analysis-runtime.cjs');
    bundledRuntimePath = path.join(process.cwd(), 'lib', 'hooks', 'image-analysis-runtime.cjs');
  });

  afterEach(() => {
    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }

    if (tempHome) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('treats a missing runtime artifact as not ready and repairs it on prepare', () => {
    expect(installImageAnalyzerHook()).toBe(true);
    fs.unlinkSync(runtimePath);

    expect(hasImageAnalyzerHook()).toBe(false);
    expect(prepareImageAnalysisFallbackHook()).toBe(true);
    expect(fs.existsSync(runtimePath)).toBe(true);
    expect(hasImageAnalyzerHook()).toBe(true);
  });

  it('refreshes stale runtime content during fallback hook preparation', () => {
    expect(installImageAnalyzerHook()).toBe(true);
    fs.writeFileSync(runtimePath, 'stale runtime\n', 'utf8');

    expect(hasImageAnalyzerHook()).toBe(false);
    expect(prepareImageAnalysisFallbackHook()).toBe(true);
    expect(fs.readFileSync(runtimePath, 'utf8')).toBe(fs.readFileSync(bundledRuntimePath, 'utf8'));
  });
});
