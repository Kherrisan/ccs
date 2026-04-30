/**
 * CCS Error Handling Module
 *
 * Centralized error handling system for CCS CLI providing:
 * - Standardized exit codes
 * - Custom error types with exit code mapping
 * - Centralized error handler with cleanup
 * - Cleanup callback registry
 *
 * @example
 * ```typescript
 * import { handleError, ConfigError, ExitCode, registerCleanup } from './errors';
 *
 * // Register cleanup for spawned process
 * registerCleanup(() => proxy.kill());
 *
 * // Throw typed error
 * throw new ConfigError('Invalid config file', '~/.ccs/config.json');
 *
 * // Or handle directly
 * handleError(new NetworkError('Connection refused'));
 * ```
 */

// Exit codes
export { ExitCode, EXIT_CODE_DESCRIPTIONS, isSuccess, isRecoverable } from './exit-codes';

// Error types
export {
  CCSError,
  ConfigError,
  NetworkError,
  AuthError,
  BinaryError,
  ProviderError,
  ProfileError,
  ProxyError,
  MigrationError,
  UserAbortError,
  ValidationError,
  RetryableError,
  isCCSError,
  isRecoverableError,
} from './error-types';

// Error handler
export {
  handleError,
  exitWithError,
  exitWithSuccess,
  withErrorHandling,
  assertOrExit,
} from './error-handler';

// Cleanup registry
export {
  registerCleanup,
  runCleanup,
  clearCleanup,
  getCleanupCount,
  hasCleanupRun,
  createCleanupScope,
} from './cleanup-registry';

export type { CleanupCallback } from './cleanup-registry';
