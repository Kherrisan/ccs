import {
  hasExactFlagValue as hasExactClaudeFlagValue,
  splitArgsAtTerminator as splitClaudeArgsAtTerminator,
} from '../claude-tool-args';

const APPEND_SYSTEM_PROMPT_FLAG = '--append-system-prompt';
const BROWSER_STEERING_PROMPT =
  'For DOM/screenshots/elements/page actions, prefer the CCS MCP Browser tool, reuse the configured running Chrome context whenever possible, and if the tool or context is unavailable, explain that clearly instead of pretending page state is available.';

function ensureBrowserSteeringPrompt(args: string[]): string[] {
  const { optionArgs, trailingArgs } = splitClaudeArgsAtTerminator(args);

  if (hasExactClaudeFlagValue(optionArgs, APPEND_SYSTEM_PROMPT_FLAG, BROWSER_STEERING_PROMPT)) {
    return args;
  }

  return [...optionArgs, APPEND_SYSTEM_PROMPT_FLAG, BROWSER_STEERING_PROMPT, ...trailingArgs];
}

export function appendBrowserToolArgs(args: string[]): string[] {
  return ensureBrowserSteeringPrompt(args);
}
