/**
 * Custom error types for CCS CLI
 *
 * All custom errors extend CCSError which provides:
 * - Standardized exit codes
 * - Recoverable flag for retry logic
 * - Consistent error formatting
 */

import { ExitCode } from './exit-codes';

/**
 * Base error class for all CCS errors
 * Extends standard Error with exit code and recovery information
 */
export class CCSError extends Error {
  constructor(
    message: string,
    public readonly code: ExitCode = ExitCode.GENERAL_ERROR,
    public readonly recoverable: boolean = false
  ) {
    super(message);
    this.name = 'CCSError';
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Configuration-related errors
 * Examples: missing config file, invalid JSON, corrupt settings
 */
export class ConfigError extends CCSError {
  constructor(
    message: string,
    public readonly configPath?: string
  ) {
    super(message, ExitCode.CONFIG_ERROR, false);
    this.name = 'ConfigError';
  }
}

/**
 * Network-related errors
 * Examples: connection refused, timeout, DNS resolution failure
 */
export class NetworkError extends CCSError {
  constructor(
    message: string,
    public readonly url?: string,
    public readonly statusCode?: number
  ) {
    super(message, ExitCode.NETWORK_ERROR, true); // Network errors are typically recoverable
    this.name = 'NetworkError';
  }
}

/**
 * Authentication/authorization errors
 * Examples: invalid API key, expired token, insufficient permissions
 */
export class AuthError extends CCSError {
  constructor(
    message: string,
    public readonly provider?: string
  ) {
    super(message, ExitCode.AUTH_ERROR, false);
    this.name = 'AuthError';
  }
}

/**
 * Binary/executable errors
 * Examples: Claude CLI not found, corrupted binary, permission denied
 */
export class BinaryError extends CCSError {
  constructor(
    message: string,
    public readonly binaryPath?: string
  ) {
    super(message, ExitCode.BINARY_ERROR, false);
    this.name = 'BinaryError';
  }
}

/**
 * Provider-specific errors
 * Examples: API rate limit, service unavailable, invalid model
 */
export class ProviderError extends CCSError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly details?: unknown
  ) {
    super(message, ExitCode.PROVIDER_ERROR, true); // Provider errors may be recoverable
    this.name = 'ProviderError';
  }
}

/**
 * Profile-related errors
 * Examples: profile not found, invalid profile name, duplicate profile
 */
export class ProfileError extends CCSError {
  constructor(
    message: string,
    public readonly profileName?: string,
    public readonly availableProfiles?: string[]
  ) {
    super(message, ExitCode.PROFILE_ERROR, false);
    this.name = 'ProfileError';
  }
}

/**
 * Proxy-related errors
 * Examples: proxy startup failure, port conflict, proxy timeout
 */
export class ProxyError extends CCSError {
  constructor(
    message: string,
    public readonly port?: number
  ) {
    super(message, ExitCode.PROXY_ERROR, false);
    this.name = 'ProxyError';
  }
}

/**
 * Migration-related errors
 * Examples: failed to migrate config, backup creation failed
 */
export class MigrationError extends CCSError {
  constructor(
    message: string,
    public readonly fromVersion?: string,
    public readonly toVersion?: string
  ) {
    super(message, ExitCode.MIGRATION_ERROR, false);
    this.name = 'MigrationError';
  }
}

/**
 * User abort error (Ctrl+C, SIGINT)
 * Used when user explicitly cancels an operation
 */
export class UserAbortError extends CCSError {
  constructor(message: string = 'Operation cancelled by user') {
    super(message, ExitCode.USER_ABORT, false);
    this.name = 'UserAbortError';
  }
}

/**
 * Input validation errors (model denylist, invalid format, length limits)
 * Distinguishes user-input validation failures from system errors
 */
export class ValidationError extends CCSError {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message, ExitCode.GENERAL_ERROR, false);
    this.name = 'ValidationError';
  }
}

/**
 * Retryable/transient error
 * Signals that the operation may succeed on retry (e.g. rate limits, timeouts)
 */
export class RetryableError extends CCSError {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly retryAfter?: number // ms until next attempt
  ) {
    super(message, ExitCode.GENERAL_ERROR, true);
    this.name = 'RetryableError';
  }
}

/**
 * Type guard to check if an error is a CCSError
 */
export function isCCSError(error: unknown): error is CCSError {
  return error instanceof CCSError;
}

/**
 * Type guard to check if an error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
  if (isCCSError(error)) {
    return error.recoverable;
  }
  return false;
}
