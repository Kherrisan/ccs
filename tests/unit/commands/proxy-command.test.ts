import { describe, expect, it } from 'bun:test';
import { findPositionalArg } from '../../../src/commands/proxy-command';

describe('findPositionalArg', () => {
  it('skips option values before returning the first positional argument', () => {
    expect(findPositionalArg(['--port', '3456', 'ccg'], ['--port'])).toBe('ccg');
  });

  it('skips flag options that do not take values', () => {
    expect(findPositionalArg(['--insecure', 'ccg'], ['--port', '--host'], ['--insecure'])).toBe(
      'ccg'
    );
  });

  it('treats arguments after -- as positional', () => {
    expect(findPositionalArg(['--', '--port', '3456'], ['--port'])).toBe('--port');
  });

  it('returns undefined when -- is the final argument', () => {
    expect(findPositionalArg(['--'], ['--port'])).toBeUndefined();
  });
});
