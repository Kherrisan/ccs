export function splitArgsAtTerminator(args: string[]): {
  optionArgs: string[];
  trailingArgs: string[];
} {
  const terminatorIndex = args.indexOf('--');
  if (terminatorIndex === -1) {
    return { optionArgs: args, trailingArgs: [] };
  }

  return {
    optionArgs: args.slice(0, terminatorIndex),
    trailingArgs: args.slice(terminatorIndex),
  };
}

export function getImmediateFlagValue(args: string[], index: number): string | null {
  const value = args[index + 1];
  if (value === undefined || value === '--' || value.startsWith('--')) {
    return null;
  }
  return value;
}

export function hasExactFlagValue(args: string[], flag: string, expectedValue: string): boolean {
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
