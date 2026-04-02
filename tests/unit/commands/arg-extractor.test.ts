import { describe, expect, it } from 'bun:test';

import { extractOption, hasAnyFlag, scanCommandArgs } from '../../../src/commands/arg-extractor';

describe('arg-extractor', () => {
  describe('extractOption', () => {
    it('extracts --flag value and removes both tokens from remaining args', () => {
      const result = extractOption(['--profile', 'gemini', '--yes'], ['--profile']);

      expect(result).toEqual({
        found: true,
        value: 'gemini',
        missingValue: false,
        remainingArgs: ['--yes'],
      });
    });

    it('extracts --flag=value and removes inline token from remaining args', () => {
      const result = extractOption(['--yes', '--profile=codex', 'prompt'], ['--profile']);

      expect(result).toEqual({
        found: true,
        value: 'codex',
        missingValue: false,
        remainingArgs: ['--yes', 'prompt'],
      });
    });

    it('marks missing value when flag is last token', () => {
      const result = extractOption(['prompt', '--profile'], ['--profile']);

      expect(result).toEqual({
        found: true,
        missingValue: true,
        remainingArgs: ['prompt'],
      });
    });

    it('marks missing value for empty inline value', () => {
      const result = extractOption(['--profile=', '--yes'], ['--profile']);

      expect(result).toEqual({
        found: true,
        missingValue: true,
        remainingArgs: ['--yes'],
      });
    });

    it('marks missing value when next token is another flag and keeps that flag', () => {
      const result = extractOption(['--profile', '--yes', 'prompt'], ['--profile']);

      expect(result).toEqual({
        found: true,
        missingValue: true,
        remainingArgs: ['--yes', 'prompt'],
      });
    });

    it('accepts dash-prefixed value when allowDashValue is enabled', () => {
      const result = extractOption(['--model', '-preview', '--yes'], ['--model'], {
        allowDashValue: true,
        knownFlags: ['--model', '--yes'],
      });

      expect(result).toEqual({
        found: true,
        value: '-preview',
        missingValue: false,
        remainingArgs: ['--yes'],
      });
    });

    it('accepts long dash-prefixed values when allowLongDashValue is enabled', () => {
      const result = extractOption(['--out', '--snapshot.json', '--yes'], ['--out'], {
        allowDashValue: true,
        allowLongDashValue: true,
        knownFlags: ['--out', '--yes'],
      });

      expect(result).toEqual({
        found: true,
        value: '--snapshot.json',
        missingValue: false,
        remainingArgs: ['--yes'],
      });
    });

    it('still treats known flags as missing when allowDashValue is enabled', () => {
      const result = extractOption(['--model', '--yes', 'prompt'], ['--model'], {
        allowDashValue: true,
        knownFlags: ['--model', '--yes'],
      });

      expect(result).toEqual({
        found: true,
        missingValue: true,
        remainingArgs: ['--yes', 'prompt'],
      });
    });

    it('still treats known long flags as missing when allowLongDashValue is enabled', () => {
      const result = extractOption(['--out', '--yes', 'prompt'], ['--out'], {
        allowDashValue: true,
        allowLongDashValue: true,
        knownFlags: ['--out', '--yes'],
      });

      expect(result).toEqual({
        found: true,
        missingValue: true,
        remainingArgs: ['--yes', 'prompt'],
      });
    });

    it('supports repeated extraction loops with deterministic last-value wins behavior', () => {
      let remaining = ['--model', 'gpt-4.1-mini', '--model', 'gpt-4.1'];
      let selected: string | undefined;

      while (true) {
        const extracted = extractOption(remaining, ['--model']);
        if (!extracted.found) {
          break;
        }

        if (!extracted.missingValue && extracted.value) {
          selected = extracted.value;
        }
        remaining = extracted.remainingArgs;
      }

      expect(selected).toBe('gpt-4.1');
      expect(remaining).toEqual([]);
    });

    it('returns non-match state without altering args content', () => {
      const args = ['--yes', 'prompt'];
      const result = extractOption(args, ['--profile', '-p']);

      expect(result).toEqual({
        found: false,
        missingValue: false,
        remainingArgs: ['--yes', 'prompt'],
      });
      expect(args).toEqual(['--yes', 'prompt']);
    });
  });

  describe('hasAnyFlag', () => {
    it('returns true when any exact flag is present', () => {
      expect(hasAnyFlag(['prompt', '--yes'], ['--yes', '-y'])).toBe(true);
      expect(hasAnyFlag(['prompt', '-y'], ['--yes', '-y'])).toBe(true);
    });

    it('supports inline truthy values for boolean flags', () => {
      expect(hasAnyFlag(['prompt', '--yes=true'], ['--yes', '-y'])).toBe(true);
      expect(hasAnyFlag(['prompt', '--yes=1'], ['--yes', '-y'])).toBe(true);
      expect(hasAnyFlag(['prompt', '--yes=on'], ['--yes', '-y'])).toBe(true);
    });

    it('returns false for non-truthy or unrelated inline tokens', () => {
      expect(hasAnyFlag(['prompt', '--yes=false'], ['--yes', '-y'])).toBe(false);
      expect(hasAnyFlag(['prompt', '--profile=gemini'], ['--yes', '-y'])).toBe(false);
    });
  });

  describe('scanCommandArgs', () => {
    it('collects positionals and unknown flags while ignoring known boolean flags', () => {
      const result = scanCommandArgs(['profile-a', '--yes', '--bogus', 'extra'], {
        knownFlags: ['--yes'],
      });

      expect(result).toEqual({
        positionals: ['profile-a', 'extra'],
        unknownFlags: ['--bogus'],
      });
    });

    it('skips values for known value flags', () => {
      const result = scanCommandArgs(['--model', 'claude-3-7-sonnet', 'profile-a', '--force'], {
        knownFlags: ['--model', '--force'],
        valueFlags: ['--model'],
      });

      expect(result).toEqual({
        positionals: ['profile-a'],
        unknownFlags: [],
      });
    });

    it('preserves option-terminator positionals', () => {
      const result = scanCommandArgs(['--yes', '--', '--literal-name'], {
        knownFlags: ['--yes'],
      });

      expect(result).toEqual({
        positionals: ['--literal-name'],
        unknownFlags: [],
      });
    });

    it('consumes single-dash values but not long-flag lookalikes when allowDashValue is enabled', () => {
      const singleDashValue = scanCommandArgs(['--model', '-preview', '--yes'], {
        knownFlags: ['--model', '--yes'],
        valueFlags: ['--model'],
        allowDashValue: true,
      });
      const longFlagLookalike = scanCommandArgs(['--model', '--target', 'droid'], {
        knownFlags: ['--model', '--target'],
        valueFlags: ['--model'],
        allowDashValue: true,
      });

      expect(singleDashValue).toEqual({
        positionals: [],
        unknownFlags: [],
      });
      expect(longFlagLookalike).toEqual({
        positionals: ['droid'],
        unknownFlags: [],
      });
    });
  });
});
