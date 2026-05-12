/**
 * Claude subcommand detection.
 *
 * Claude Code's CLI accepts both an interactive session form (`claude [prompt]`,
 * possibly with `--print`) and explicit subcommands (`claude agents`,
 * `claude doctor`, `claude mcp`, ...). Subcommand parsers reject most top-level
 * session flags — e.g. `claude agents --append-system-prompt foo` exits with
 * `error: unknown option '--append-system-prompt'`.
 *
 * CCS injects WebSearch / image-analysis / browser steering args
 * (`--append-system-prompt`, `--disallowedTools`) for interactive sessions.
 * Those flags must be skipped when the user is actually invoking a Claude
 * subcommand, otherwise the subcommand fails or falls back to non-interactive
 * mode (e.g. `claude agents` printing the list instead of opening the agent
 * view — see issue #1218).
 *
 * Detection walks args left-to-right, skipping known value-taking top-level
 * flags, and reports whether the first positional token matches a known
 * Claude subcommand.
 */

/**
 * Known Claude CLI subcommands. Sourced from `claude --help` (v2.1.139).
 * Keep in sync with upstream — additions are safe (over-skipping injection
 * for an unknown command is acceptable; under-skipping is the bug).
 */
const CLAUDE_SUBCOMMANDS = new Set<string>([
  'agents',
  'auth',
  'auto-mode',
  'doctor',
  'install',
  'mcp',
  'plugin',
  'plugins',
  'project',
  'setup-token',
  'ultrareview',
  'update',
  'upgrade',
]);

/**
 * Top-level Claude flags that consume the next argv token as their value.
 * Used so the detector doesn't mistake a flag value (e.g. `--name auth`) for
 * a subcommand. Boolean flags are intentionally absent.
 *
 * Variadic flags (`--add-dir`, `--mcp-config`, etc.) only consume their
 * immediate next token here; Commander.js' real variadic parsing isn't worth
 * replicating since the goal is just to skip past one obvious value safely.
 */
const VALUE_TAKING_FLAGS = new Set<string>([
  '--add-dir',
  '--agent',
  '--agents',
  '--allowedTools',
  '--allowed-tools',
  '--append-system-prompt',
  '--betas',
  '--channels',
  '--debug-file',
  '--disallowedTools',
  '--disallowed-tools',
  '--effort',
  '--fallback-model',
  '--file',
  '--input-format',
  '--json-schema',
  '--max-budget-usd',
  '--mcp-config',
  '--model',
  '--name',
  '-n',
  '--output-format',
  '--permission-mode',
  '--plugin-dir',
  '--plugin-url',
  '--remote-control-session-name-prefix',
  '--session-id',
  '--setting-sources',
  '--settings',
  '--system-prompt',
  '--tools',
]);

/**
 * Returns true when `args` look like a Claude subcommand invocation.
 *
 * Heuristic:
 *   1. Walk args until the `--` terminator or end.
 *   2. Skip known value-taking flags together with their next token.
 *   3. Skip unknown `--flag=value` forms and bare `--flag` / `-x` tokens.
 *   4. The first remaining positional token is the candidate.
 *   5. Match against CLAUDE_SUBCOMMANDS.
 *
 * Anything after the candidate is irrelevant — once a subcommand is in play,
 * the rest of the line belongs to that subcommand.
 */
export function isClaudeSubcommandInvocation(args: readonly string[]): boolean {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') return false;

    if (arg.startsWith('-')) {
      if (VALUE_TAKING_FLAGS.has(arg)) {
        // Skip the next token as the flag's value (when present and not another flag).
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          i += 1;
        }
      }
      // `--flag=value`, bare boolean flags, and unknown short/long flags fall through.
      continue;
    }

    return CLAUDE_SUBCOMMANDS.has(arg);
  }

  return false;
}

/**
 * Claude env vars that disable interactive subcommand TUIs (e.g. the new
 * `claude agents` agent view) when set. CCS injects these as defaults to
 * silence telemetry/bug-report prompts in normal sessions, but they trip
 * subcommands into non-interactive list mode. Issue #1218.
 *
 * Strip only for confirmed Claude subcommand invocations — keep the user's
 * telemetry preference intact for everything else.
 */
const SUBCOMMAND_BLOCKING_ENV_KEYS = ['DISABLE_TELEMETRY'] as const;

/**
 * Return a shallow copy of `env` with subcommand-blocking telemetry vars
 * removed. Caller is responsible for only invoking this when args are a
 * Claude subcommand invocation.
 */
export function stripSubcommandBlockingEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (
      SUBCOMMAND_BLOCKING_ENV_KEYS.includes(key as (typeof SUBCOMMAND_BLOCKING_ENV_KEYS)[number])
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}
