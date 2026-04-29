/**
 * Auth Handler for CLIProxyAPI
 *
 * Manages OAuth authentication for CLIProxy providers (Gemini, Codex, Antigravity).
 * CLIProxyAPI handles OAuth internally - we just need to:
 * 1. Check if auth exists (token files in CCS auth directory)
 * 2. Trigger OAuth flow by spawning binary with auth flag
 * 3. Auto-detect headless environments (SSH, no DISPLAY)
 * 4. Use --no-browser flag for headless, display OAuth URL for manual auth
 *
 * Token storage: ~/.ccs/cliproxy/auth/<provider>/
 * Each provider has its own directory to avoid conflicts.
 *
 * This file is a facade that re-exports from the auth/ submodule.
 * The actual implementation is split across:
 * - auth/auth-types.ts     - Types and OAuth configurations
 * - auth/token-manager.ts  - Token storage/retrieval/validation
 * - auth/oauth-handler.ts  - OAuth flow handling
 * - auth/environment-detector.ts - Headless detection and port management
 */

// Re-export types
export type { AuthStatus, ProviderOAuthConfig, OAuthOptions } from '.';

// Re-export configurations
export {
  OAUTH_CALLBACK_PORTS,
  OAUTH_CONFIGS,
  PROVIDER_AUTH_PREFIXES,
  PROVIDER_TYPE_VALUES,
  getOAuthConfig,
} from '.';

// Re-export token management functions
export {
  getProviderTokenDir,
  isTokenFileForProvider,
  isAuthenticated,
  getAuthStatus,
  getAllAuthStatus,
  clearAuth,
  displayAuthStatus,
} from '.';

// Re-export environment detection functions
export {
  isHeadlessEnvironment,
  killProcessOnPort,
  getTimeoutTroubleshooting,
  showStep,
} from '.';

// Re-export OAuth handling functions
export { triggerOAuth, ensureAuth } from '.';

// Re-export account management initialization
import { discoverExistingAccounts } from '../accounts/account-manager';

/**
 * Initialize accounts registry from existing tokens
 * Should be called on startup to populate accounts from existing token files
 */
export function initializeAccounts(): void {
  discoverExistingAccounts();
}
