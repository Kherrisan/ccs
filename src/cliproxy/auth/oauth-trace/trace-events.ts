/**
 * OAuth trace event taxonomy.
 *
 * Single source of truth for phase IDs that flow through the OAuth pipeline.
 * Additive only — never remove or renumber.
 */

export enum OAuthTracePhase {
  // Pre-flight
  PreflightStart = 'preflight.start',
  PreflightOk = 'preflight.ok',
  PreflightPortBlocked = 'preflight.port_blocked',

  // Binary process lifecycle (CLIProxyAPI Go binary)
  BinarySpawn = 'binary.spawn',
  BinaryStdout = 'binary.stdout',
  BinaryStderr = 'binary.stderr',
  BinaryExit = 'binary.exit',

  // Browser / URL flow (Authorization Code)
  AuthUrlDisplayed = 'auth.url_displayed',
  BrowserOpened = 'browser.opened',
  CallbackObservedHeuristic = 'callback.observed_heuristic',

  // Paste-callback (CCS-owned end-to-end)
  PasteCallbackPrompted = 'paste.prompted',
  PasteCallbackReceived = 'paste.received',
  PasteCallbackInvalid = 'paste.invalid',
  PasteCallbackSubmitted = 'paste.submitted',

  // Token exchange + persistence
  TokenExchangePending = 'token.exchange_pending',
  TokenFileAppeared = 'token.file_appeared',
  TokenFileMissing = 'token.file_missing',

  // Provider-specific gates (Phase 4/5 extend)
  ProjectSelectionPrompted = 'project.selection_prompted',
  ProjectSelectionResolved = 'project.selection_resolved',
  AgyResponsibilityPrompted = 'agy.responsibility_prompted',
  AgyResponsibilityResolved = 'agy.responsibility_resolved',

  // Terminal states
  Timeout = 'timeout',
  Cancelled = 'cancelled',
  Error = 'error',
}

/** A single OAuth trace event. `data` MUST be redacted before construction. */
export interface OAuthTraceEvent {
  sessionId: string;
  provider: string;
  phase: OAuthTracePhase;
  ts: number; // Date.now()
  elapsedMs: number; // since recorder.start()
  data?: Record<string, unknown>;
  error?: { code?: string; message: string };
}

/** Sink interface — accept events that have already been redacted. */
export interface OAuthTraceSink {
  write(event: OAuthTraceEvent): void;
  flush?(): Promise<void>;
}
