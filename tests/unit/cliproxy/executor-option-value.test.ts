import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  execClaudeWithCLIProxy,
  hasGitLabTokenLoginFlag,
  readOptionValue,
} from '../../../src/cliproxy/executor/index';

describe('readOptionValue', () => {
  it('parses split-token option values', () => {
    expect(readOptionValue(['--kiro-idc-start-url', 'https://d-123.awsapps.com/start'], '--kiro-idc-start-url')).toEqual({
      present: true,
      value: 'https://d-123.awsapps.com/start',
      missingValue: false,
    });
  });

  it('parses equals-form option values', () => {
    expect(readOptionValue(['--kiro-idc-flow=device'], '--kiro-idc-flow')).toEqual({
      present: true,
      value: 'device',
      missingValue: false,
    });
  });

  it('marks empty or missing values as invalid', () => {
    expect(readOptionValue(['--kiro-idc-region'], '--kiro-idc-region')).toEqual({
      present: true,
      value: undefined,
      missingValue: true,
    });
    expect(readOptionValue(['--kiro-idc-flow='], '--kiro-idc-flow')).toEqual({
      present: true,
      value: undefined,
      missingValue: true,
    });
  });

  it('treats both GitLab token-login flags as enabled', () => {
    expect(hasGitLabTokenLoginFlag(['--gitlab-token-login'])).toBe(true);
    expect(hasGitLabTokenLoginFlag(['--token-login'])).toBe(true);
    expect(hasGitLabTokenLoginFlag(['--gitlab-url', 'https://gitlab.example.com'])).toBe(false);
  });
});

describe('execClaudeWithCLIProxy browser flag validation', () => {
  let tmpHome = '';
  let fakeClaudePath = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cliproxy-executor-'));
    fakeClaudePath = path.join(tmpHome, 'fake-claude.sh');
    fs.writeFileSync(fakeClaudePath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    fs.chmodSync(fakeClaudePath, 0o755);
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('exits cleanly when conflicting browser launch flags are provided', async () => {
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await execClaudeWithCLIProxy(fakeClaudePath, 'gemini', ['--browser', '--no-browser'], {});

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith('[X] Use either `--browser` or `--no-browser`, not both.');
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
