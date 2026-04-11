/**
 * Claude launch argument helpers for third-party WebSearch.
 */

const NATIVE_WEBSEARCH_TOOL = 'WebSearch';
const DISALLOWED_TOOLS_FLAG = '--disallowedTools';
const APPEND_SYSTEM_PROMPT_FLAG = '--append-system-prompt';
const THIRD_PARTY_WEBSEARCH_STEERING_PROMPT =
  'For web lookup or current-information requests, prefer the CCS MCP tool WebSearch instead of Bash/curl/http fetches. If the user explicitly wants shell commands, or WebSearch is unavailable or fails, you may fall back to Bash/network tools.';

function parseToolValue(rawValue: string): string[] {
  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function mergeToolValues(rawValues: string[], toolName: string): string {
  const merged = rawValues.flatMap(parseToolValue);
  if (!merged.includes(toolName)) {
    merged.push(toolName);
  }
  return merged.join(',');
}

function splitArgsAtTerminator(args: string[]): { optionArgs: string[]; trailingArgs: string[] } {
  const terminatorIndex = args.indexOf('--');
  if (terminatorIndex === -1) {
    return { optionArgs: args, trailingArgs: [] };
  }

  return {
    optionArgs: args.slice(0, terminatorIndex),
    trailingArgs: args.slice(terminatorIndex),
  };
}

function getImmediateFlagValue(args: string[], index: number): string | null {
  const value = args[index + 1];
  if (value === undefined || value === '--' || value.startsWith('--')) {
    return null;
  }
  return value;
}

function hasToolInFlag(args: string[], flag: string, toolName: string): boolean {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === flag) {
      const value = getImmediateFlagValue(args, index);
      if (value && parseToolValue(value).includes(toolName)) {
        return true;
      }
      continue;
    }

    if (!arg.startsWith(`${flag}=`)) {
      continue;
    }

    const rawValue = arg.slice(flag.length + 1);
    if (parseToolValue(rawValue).includes(toolName)) {
      return true;
    }
  }

  return false;
}

function hasExactFlagValue(args: string[], flag: string, expectedValue: string): boolean {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === flag) {
      const value = getImmediateFlagValue(args, index);
      if (value === expectedValue) {
        return true;
      }
      continue;
    }

    if (arg === `${flag}=${expectedValue}`) {
      return true;
    }

    if (arg.startsWith(`${flag}=`) && arg.slice(flag.length + 1) === expectedValue) {
      return true;
    }
  }

  return false;
}

function ensureDisallowedNativeWebSearchTool(args: string[]): string[] {
  const { optionArgs, trailingArgs } = splitArgsAtTerminator(args);

  if (hasToolInFlag(optionArgs, DISALLOWED_TOOLS_FLAG, NATIVE_WEBSEARCH_TOOL)) {
    return args;
  }

  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];

    if (arg === DISALLOWED_TOOLS_FLAG) {
      const currentValue = getImmediateFlagValue(optionArgs, index);
      const mergedValue = mergeToolValues(
        currentValue ? [currentValue] : [],
        NATIVE_WEBSEARCH_TOOL
      );

      return [
        ...optionArgs.slice(0, index + 1),
        mergedValue,
        ...optionArgs.slice(currentValue === null ? index + 1 : index + 2),
        ...trailingArgs,
      ];
    }

    if (arg.startsWith(`${DISALLOWED_TOOLS_FLAG}=`)) {
      const rawValue = arg.slice(DISALLOWED_TOOLS_FLAG.length + 1);
      return [
        ...optionArgs.slice(0, index),
        `${DISALLOWED_TOOLS_FLAG}=${mergeToolValues([rawValue], NATIVE_WEBSEARCH_TOOL)}`,
        ...optionArgs.slice(index + 1),
        ...trailingArgs,
      ];
    }
  }

  return [...optionArgs, DISALLOWED_TOOLS_FLAG, NATIVE_WEBSEARCH_TOOL, ...trailingArgs];
}

function ensureWebSearchSteeringPrompt(args: string[]): string[] {
  const { optionArgs, trailingArgs } = splitArgsAtTerminator(args);

  if (
    hasExactFlagValue(optionArgs, APPEND_SYSTEM_PROMPT_FLAG, THIRD_PARTY_WEBSEARCH_STEERING_PROMPT)
  ) {
    return args;
  }

  return [
    ...optionArgs,
    APPEND_SYSTEM_PROMPT_FLAG,
    THIRD_PARTY_WEBSEARCH_STEERING_PROMPT,
    ...trailingArgs,
  ];
}

export function appendThirdPartyWebSearchToolArgs(args: string[]): string[] {
  return ensureWebSearchSteeringPrompt(ensureDisallowedNativeWebSearchTool(args));
}
