import { describe, it, expect } from 'bun:test';
import { parseThinkingOverride } from '../executor/thinking-arg-parser';

describe('parseThinkingOverride', () => {
  it('parses --thinking with separate value', () => {
    const out = parseThinkingOverride(['--thinking', 'high']);
    expect(out.value).toBe('high');
    expect(out.sourceFlag).toBe('--thinking');
    expect(out.error).toBeUndefined();
  });

  it('parses --thinking=<value> inline', () => {
    const out = parseThinkingOverride(['--thinking=xhigh']);
    expect(out.value).toBe('xhigh');
    expect(out.sourceFlag).toBe('--thinking');
    expect(out.error).toBeUndefined();
  });

  it('parses --effort alias', () => {
    const out = parseThinkingOverride(['--effort', 'medium']);
    expect(out.value).toBe('medium');
    expect(out.sourceFlag).toBe('--effort');
    expect(out.error).toBeUndefined();
  });

  it('parses integer values as numbers', () => {
    const out = parseThinkingOverride(['--thinking', '8192']);
    expect(out.value).toBe(8192);
    expect(out.sourceFlag).toBe('--thinking');
  });

  it('returns first occurrence and tracks duplicates across aliases', () => {
    const out = parseThinkingOverride(['--effort=high', '--thinking', 'xhigh']);
    expect(out.value).toBe('high');
    expect(out.sourceFlag).toBe('--effort');
    expect(out.duplicateDisplays).toEqual(['--thinking xhigh']);
    expect(out.error).toBeUndefined();
  });

  it('returns error for missing separate value', () => {
    const out = parseThinkingOverride(['--effort', '--verbose']);
    expect(out.error).toEqual({ flag: '--effort', form: 'separate' });
  });

  it('returns error for missing inline value', () => {
    const out = parseThinkingOverride(['--thinking=']);
    expect(out.error).toEqual({ flag: '--thinking', form: 'inline' });
  });

  it('keeps first valid value when later duplicate is missing separate value', () => {
    const out = parseThinkingOverride(['--effort', 'high', '--thinking']);
    expect(out.value).toBe('high');
    expect(out.sourceFlag).toBe('--effort');
    expect(out.error).toBeUndefined();
    expect(out.duplicateDisplays).toEqual(['--thinking <missing-value>']);
  });

  it('keeps first valid value when later duplicate is missing inline value', () => {
    const out = parseThinkingOverride(['--thinking=medium', '--effort=']);
    expect(out.value).toBe('medium');
    expect(out.sourceFlag).toBe('--thinking');
    expect(out.error).toBeUndefined();
    expect(out.duplicateDisplays).toEqual(['--effort=<missing-value>']);
  });
});
