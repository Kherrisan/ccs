/**
 * Result aggregation utilities for headless executor
 */

import type { ExecutionResult, StreamMessage, ToolUsageSummary } from './types';
import { warn } from '../../utils/ui';

const WEBSEARCH_FALLBACK_TOOLS = new Set(['Bash', 'WebFetch']);

export function summarizeToolUsage(messages: StreamMessage[]): ToolUsageSummary {
  const toolNames = new Set<string>();

  for (const message of messages) {
    const content = message.message?.content || [];
    for (const entry of content) {
      if (entry.type === 'tool_use' && entry.name) {
        toolNames.add(entry.name);
      }
    }
  }

  const orderedToolNames = [...toolNames];
  return {
    toolNames: orderedToolNames,
    calledWebSearch: toolNames.has('WebSearch') || toolNames.has('search'),
    fallbackToolsUsed: orderedToolNames.filter((toolName) =>
      WEBSEARCH_FALLBACK_TOOLS.has(toolName)
    ),
  };
}

/**
 * Build execution result from stream messages
 * @param params - Parameters for building result
 * @returns ExecutionResult with all fields populated
 */
export function buildExecutionResult(params: {
  exitCode: number;
  stdout: string;
  stderr: string;
  cwd: string;
  profile: string;
  duration: number;
  timedOut: boolean;
  messages: StreamMessage[];
}): ExecutionResult {
  const { exitCode, stdout, stderr, cwd, profile, duration, timedOut, messages } = params;

  const result: ExecutionResult = {
    exitCode,
    stdout,
    stderr,
    cwd,
    profile,
    duration,
    timedOut,
    success: exitCode === 0 && !timedOut,
    messages,
    toolUsageSummary: summarizeToolUsage(messages),
  };

  // Extract metadata from final 'result' message in stream-json
  const resultMessage = messages.find((m) => m.type === 'result');
  if (resultMessage) {
    result.sessionId = resultMessage.session_id || undefined;
    result.totalCost = resultMessage.total_cost_usd || 0;
    result.numTurns = resultMessage.num_turns || 0;
    result.isError = resultMessage.is_error || false;
    result.type = resultMessage.type || null;
    result.subtype = resultMessage.subtype || undefined;
    result.durationApi = resultMessage.duration_api_ms || 0;
    result.permissionDenials = resultMessage.permission_denials || [];
    result.errors = resultMessage.errors || [];
    result.content = resultMessage.result || '';
  } else {
    // Fallback: no result message found (shouldn't happen)
    result.content = stdout;
    if (process.env.CCS_DEBUG) {
      console.error(warn('No result message found in stream-json output'));
    }
  }

  return result;
}

/**
 * Extract session info from result for session management
 * @param result - Execution result
 * @returns Session info or null
 */
export function extractSessionInfo(result: ExecutionResult): {
  sessionId: string;
  totalCost?: number;
  cwd: string;
} | null {
  if (!result.sessionId) {
    return null;
  }

  return {
    sessionId: result.sessionId,
    totalCost: result.totalCost,
    cwd: result.cwd,
  };
}
