import { describe, it, expect } from 'bun:test';
import { CCSError, RetryableError, isCCSError, isRecoverableError } from '../error-types';
import { ExitCode } from '../exit-codes';

describe('RetryableError', () => {
  it('extends CCSError', () => {
    const err = new RetryableError('test');
    expect(err).toBeInstanceOf(CCSError);
    expect(err).toBeInstanceOf(RetryableError);
  });

  it('sets name to RetryableError', () => {
    const err = new RetryableError('test');
    expect(err.name).toBe('RetryableError');
  });

  it('sets recoverable to true', () => {
    const err = new RetryableError('test');
    expect(err.recoverable).toBe(true);
  });

  it('defaults exit code to GENERAL_ERROR', () => {
    const err = new RetryableError('test');
    expect(err.code).toBe(ExitCode.GENERAL_ERROR);
  });

  it('passes message through', () => {
    const err = new RetryableError('something went wrong');
    expect(err.message).toBe('something went wrong');
  });

  it('accepts an optional cause', () => {
    const cause = new Error('original');
    const err = new RetryableError('wrapped', cause);
    expect(err.cause).toBe(cause);
  });

  it('accepts an optional retryAfter (ms)', () => {
    const err = new RetryableError('rate limited', undefined, 5000);
    expect(err.retryAfter).toBe(5000);
  });

  it('defaults retryAfter to undefined', () => {
    const err = new RetryableError('test');
    expect(err.retryAfter).toBeUndefined();
  });

  it('is identified by isCCSError', () => {
    const err = new RetryableError('test');
    expect(isCCSError(err)).toBe(true);
  });

  it('is identified as recoverable by isRecoverableError', () => {
    const err = new RetryableError('test');
    expect(isRecoverableError(err)).toBe(true);
  });

  it('has a proper stack trace', () => {
    const err = new RetryableError('test');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('RetryableError');
  });
});
