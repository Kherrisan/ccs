/**
 * Image Analyzer Hook Utilities
 *
 * Shared helper functions for CCS-managed image hook detection and cleanup.
 *
 * @module utils/hooks/image-analyzer-hook-utils
 */

function normalizeCommand(command: string): string {
  return command.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function extractManagedHookPath(command: string): string | null {
  const normalizedCommand = normalizeCommand(command);
  const exactPathMatch = normalizedCommand.match(
    /(?:^|["'\s])([^"'\s]*\/\.ccs\/hooks\/image-analyzer-transformer\.cjs)(?:["'\s]|$)/
  );
  return exactPathMatch?.[1] ?? null;
}

/**
 * Check if a hook entry is a CCS-managed image analyzer hook.
 * Matches current and legacy path variants by suffix rather than full path.
 */
export function isCcsImageAnalyzerHook(hook: Record<string, unknown>): boolean {
  if (hook.matcher !== 'Read') return false;

  const hookArray = hook.hooks as Array<Record<string, unknown>> | undefined;
  if (!hookArray?.[0]?.command) return false;

  const command = hookArray[0].command;
  if (typeof command !== 'string') return false;

  return extractManagedHookPath(command) !== null;
}

/**
 * Remove duplicate CCS-managed image hooks from settings, keeping only the first one.
 */
export function deduplicateCcsImageAnalyzerHooks(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks?.PreToolUse) return false;

  let foundFirst = false;
  const originalLength = hooks.PreToolUse.length;

  hooks.PreToolUse = hooks.PreToolUse.filter((entry: unknown) => {
    const hook = entry as Record<string, unknown>;
    if (!isCcsImageAnalyzerHook(hook)) return true;

    if (!foundFirst) {
      foundFirst = true;
      return true;
    }

    return false;
  });

  return hooks.PreToolUse.length < originalLength;
}

/**
 * Remove all CCS-managed image hooks from settings while preserving unrelated hooks.
 */
export function removeCcsImageAnalyzerHooks(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks?.PreToolUse) return false;

  const originalLength = hooks.PreToolUse.length;
  hooks.PreToolUse = hooks.PreToolUse.filter((entry: unknown) => {
    const hook = entry as Record<string, unknown>;
    return !isCcsImageAnalyzerHook(hook);
  });

  if (hooks.PreToolUse.length === originalLength) {
    return false;
  }

  if (hooks.PreToolUse.length === 0) {
    delete hooks.PreToolUse;
  }
  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  }

  return true;
}
