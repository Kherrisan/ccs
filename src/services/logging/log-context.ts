import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

/**
 * Per-request context carried via Node.js {@link AsyncLocalStorage}.
 *
 * MUST contain only non-sensitive correlation metadata. NEVER store tokens,
 * secrets, raw bodies, or other sensitive material in this object — values
 * leak into every downstream log entry emitted within the context.
 */
export interface RequestContext {
  /** UUID-shaped correlation id; round-trips via `x-ccs-request-id` header. */
  requestId: string;
  /** Optional benign request metadata (method, path, command name, etc.). */
  [key: string]: unknown;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run `fn` inside a fresh request context. Use ONLY at request entry edges
 * (HTTP handlers, CLI command dispatch, daemon inbound boundaries).
 *
 * Never call from shared/reused infrastructure — that would leak the requestId
 * to unrelated callers. Listeners that need to inherit context MUST be
 * registered inside the `als.run()` callback.
 */
export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Convenience wrapper that mints a fresh UUID requestId and runs `fn` under it.
 * Returns the requestId so callers can echo it back via response headers.
 */
export function runWithRequestId<T>(fn: () => T): { requestId: string; result: T } {
  const requestId = randomUUID();
  const result = withRequestContext({ requestId }, fn);
  return { requestId, result };
}

/** Read the active request context, or `undefined` if not inside one. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Read just the active requestId, or `undefined` if not inside a context. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Merge any active request context into the supplied context object,
 * preferring explicit keys on the input. Existing `requestId` on `extra` wins
 * (callers may explicitly override; e.g., for cross-daemon correlation).
 */
export function mergeRequestContext<T extends Record<string, unknown>>(extra: T): T {
  const ctx = storage.getStore();
  if (!ctx) return extra;
  return { ...ctx, ...extra } as T;
}
