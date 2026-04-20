import { describe, expect, it } from 'bun:test';
import { findPositionalArg } from '../../../src/commands/proxy-command';

describe('findPositionalArg', () => {
  it('skips option values before returning the first positional argument', () => {
    expect(findPositionalArg(['--port', '3456', 'ccg'], ['--port'])).toBe('ccg');
  });

  it('treats arguments after -- as positional', () => {
    expect(findPositionalArg(['--', '--port', '3456'], ['--port'])).toBe('--port');
  });
});
