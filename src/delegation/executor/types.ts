/**
 * Type definitions for headless executor
 */

/**
 * Claude message from stream-json output
 */
export interface ClaudeMessage {
  type: string;
  content?: string;
  thinking?: string;
  tool_use?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  tool_result?: {
    tool_use_id: string;
    content: string;
  };
}

/**
 * Permission denial information
 */
export interface PermissionDenial {
  tool_name?: string;
  reason?: string;
  tool_input?: {
    command?: string;
    description?: string;
    [key: string]: unknown;
  };
}

/**
 * Execution error information
 */
export interface ExecutionError {
  message?: string;
  error?: string;
  type?: string;
  tool_name?: string;
  [key: string]: unknown;
}

export interface ToolUsageSummary {
  toolNames: string[];
  calledWebSearch: boolean;
  fallbackToolsUsed: string[];
}

/**
 * Options for headless execution
 */
export interface ExecutionOptions {
  cwd?: string;
  timeout?: number;
  outputFormat?: string;
  permissionMode?: string;
  resumeSession?: boolean;
  sessionId?: string;
  maxRetries?: number;
  // Claude Code CLI passthrough flags (explicit)
  maxTurns?: number; // --max-turns: Limit agentic turns (prevents infinite loops)
  fallbackModel?: string; // --fallback-model: Auto-fallback when model overloaded
  agents?: string; // --agents: Dynamic subagent JSON injection
  betas?: string; // --betas: Enable experimental features
  extraArgs?: string[]; // Catch-all for new/unknown flags (future-proof)
}

/**
 * Result of headless execution
 */
export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  cwd: string;
  profile: string;
  duration: number;
  timedOut: boolean;
  success: boolean;
  messages: StreamMessage[];
  sessionId?: string;
  totalCost?: number;
  numTurns?: number;
  isError?: boolean;
  type?: string | null;
  subtype?: string;
  durationApi?: number;
  permissionDenials?: PermissionDenial[];
  errors?: ExecutionError[];
  content?: string;
  toolUsageSummary?: ToolUsageSummary;
}

/**
 * Stream message from Claude CLI stream-json output
 */
export interface StreamMessage {
  type: string;
  message?: {
    content?: Array<{
      type: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  session_id?: string;
  total_cost_usd?: number;
  num_turns?: number;
  is_error?: boolean;
  result?: string;
  duration_api_ms?: number;
  permission_denials?: PermissionDenial[];
  errors?: ExecutionError[];
  subtype?: string;
}

/**
 * Tool input types for verbose logging
 */
export interface ToolInput {
  command?: string;
  file_path?: string;
  notebook_path?: string;
  pattern?: string;
  path?: string;
  description?: string;
  prompt?: string;
  todos?: Array<{ status: string; activeForm?: string }>;
  url?: string;
  query?: string;
  [key: string]: unknown;
}
