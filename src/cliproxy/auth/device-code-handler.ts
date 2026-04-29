/**
 * Device Code Handler
 *
 * Manages device code display prompts during OAuth Device Code flow.
 * Broadcasts device code events via WebSocket to both CLI terminal
 * and Web UI (ccs config).
 *
 * Events emitted by oauth-process.ts:
 * - deviceCode:received - When device code is parsed from output
 * - deviceCode:completed - When auth succeeds
 * - deviceCode:failed - When auth fails
 * - deviceCode:expired - When code expires (handled by UI timer)
 */

import { EventEmitter } from 'events';

/**
 * Device code prompt data sent to UI
 */
export interface DeviceCodePrompt {
  sessionId: string;
  provider: string;
  userCode: string;
  verificationUrl: string;
  expiresAt: number;
}

// Global event emitter for device code events
export const deviceCodeEvents = new EventEmitter();

// Default timeout for device code (15 minutes - GitHub's default)
export const DEVICE_CODE_TIMEOUT_MS = 900000;
