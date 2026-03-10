import { afterEach, describe, expect, test } from 'bun:test';

import { handleHelpCommand } from '../../../src/commands/help-command';

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}

describe('help command parity', () => {
  const originalLog = console.log;

  afterEach(() => {
    console.log = originalLog;
  });

  test('root help documents cliproxy provider filter under quota command', async () => {
    const lines: string[] = [];
    console.log = (...args: unknown[]) => {
      lines.push(args.map((arg) => String(arg)).join(' '));
    };

    await handleHelpCommand();

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('ccs cliproxy status [provider]')).toBe(false);
    expect(rendered.includes('ccs cliproxy status')).toBe(true);
    expect(rendered.includes('ccs cliproxy quota --provider <name>')).toBe(true);
    expect(rendered.includes('ccs llamacpp')).toBe(true);
  });

  test('root help documents llama.cpp as a local API profile', async () => {
    const lines: string[] = [];
    console.log = (...args: unknown[]) => {
      lines.push(args.map((arg) => String(arg)).join(' '));
    };

    await handleHelpCommand();

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('ccs llamacpp')).toBe(true);
    expect(rendered.includes('http://127.0.0.1:8080')).toBe(true);
  });
});
