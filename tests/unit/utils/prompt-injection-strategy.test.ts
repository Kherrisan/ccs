import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildInlineSteeringArg,
  buildFileSteeringArg,
  buildSteeringArg,
  detectPromptInjectionMode,
  getManagedPromptFilePath,
  hasManagedPromptFileArg,
  PROMPT_FLAG_INLINE,
  PROMPT_FLAG_FILE,
} from '../../../src/utils/prompt-injection-strategy';

let originalCcsHome: string | undefined;
let tempHome: string;

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-prompt-strategy-'));
  process.env.CCS_HOME = tempHome;
});

afterEach(() => {
  if (originalCcsHome === undefined) {
    delete process.env.CCS_HOME;
  } else {
    process.env.CCS_HOME = originalCcsHome;
  }
  fs.rmSync(tempHome, { recursive: true, force: true });
});

describe('detectPromptInjectionMode', () => {
  it('returns inline when no prompt flags present', () => {
    expect(detectPromptInjectionMode(['-p', 'hello'])).toBe('inline');
  });

  it('returns inline when only --append-system-prompt is present', () => {
    expect(detectPromptInjectionMode(['--append-system-prompt', 'test'])).toBe('inline');
  });

  it('returns inline when --append-system-prompt equals form is present', () => {
    expect(detectPromptInjectionMode(['--append-system-prompt=test'])).toBe('inline');
  });

  it('returns file when --append-system-prompt-file is present', () => {
    expect(detectPromptInjectionMode(['--append-system-prompt-file', '/tmp/p.txt'])).toBe('file');
  });

  it('returns file when --append-system-prompt-file equals form is present', () => {
    expect(detectPromptInjectionMode(['--append-system-prompt-file=/tmp/p.txt'])).toBe('file');
  });

  it('returns file even when --append-system-prompt is also present', () => {
    expect(
      detectPromptInjectionMode([
        '--append-system-prompt',
        'inline-text',
        '--append-system-prompt-file',
        '/tmp/p.txt',
      ])
    ).toBe('file');
  });
});

describe('buildInlineSteeringArg', () => {
  it('returns inline flag and prompt text', () => {
    expect(buildInlineSteeringArg({promptContent: 'hello world'})).toEqual(['--append-system-prompt', 'hello world']);
  });
});

describe('buildFileSteeringArg', () => {
  it('returns file flag and writes the prompt into the isolated CCS home', () => {
    const result = buildFileSteeringArg({
      promptFileName: 'ccs-test-prompt.txt',
      promptContent: 'hello world',
    });

    expect(result[0]).toBe('--append-system-prompt-file');
    expect(result[1]).toBe(path.join(tempHome, '.ccs', 'prompts', 'ccs-test-prompt.txt'));
    expect(fs.readFileSync(result[1], 'utf8')).toBe('hello world');
  });
});

describe('hasManagedPromptFileArg', () => {
  it('returns true for the exact CCS-managed prompt path', () => {
    expect(
      hasManagedPromptFileArg({
        args: [PROMPT_FLAG_FILE, getManagedPromptFilePath('ccs-test')],
        promptName: 'ccs-test',
      })
    ).toBe(true);
  });

  it('returns false for unrelated user files that only contain the prompt name', () => {
    expect(
      hasManagedPromptFileArg({
        args: [PROMPT_FLAG_FILE, '/tmp/user-ccs-test-notes.txt'],
        promptName: 'ccs-test',
      })
    ).toBe(false);
  });
});

describe('buildSteeringArg', () => {
  it('delegates to inline in inline mode', () => {
    expect(
      buildSteeringArg({
        args: [PROMPT_FLAG_INLINE],
        promptName: 'ignored.txt',
        promptContent: 'hello',
      })
    ).toEqual(['--append-system-prompt', 'hello']);
  });

  it('delegates to file in file mode', () => {
    const result = buildSteeringArg({
      args: [PROMPT_FLAG_FILE],
      promptName: 'ccs-test',
      promptContent: 'hello',
    });
    expect(result[0]).toBe('--append-system-prompt-file');
    expect(result[1]).toBe(getManagedPromptFilePath('ccs-test'));
  });
});
