/**
 * Env Command Handler
 *
 * Export environment variables for third-party tool integration.
 * Outputs shell-evaluable exports for OpenCode, Cursor, Continue, etc.
 */

import { initUI, header, dim, color, subheader, fail, warn } from '../utils/ui';
import { getCcsDir } from '../utils/config-manager';
import { CLAUDE_EXTENSION_HOSTS, type ClaudeExtensionHost } from '../shared/claude-extension-hosts';
import {
  renderClaudeExtensionSettingsJson,
  resolveClaudeExtensionSetup,
} from '../shared/claude-extension-setup';

type ShellType = 'bash' | 'fish' | 'powershell';
type OutputFormat = 'openai' | 'anthropic' | 'raw' | 'claude-extension';

const VALID_FORMATS: OutputFormat[] = ['openai', 'anthropic', 'raw', 'claude-extension'];
const VALID_SHELLS: ShellType[] = ['bash', 'fish', 'powershell'];
const VALID_SHELL_INPUTS = ['auto', 'bash', 'zsh', 'fish', 'powershell'] as const;
const VALID_EXTENSION_HOSTS = CLAUDE_EXTENSION_HOSTS.map((host) => host.id);
const VALID_ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Auto-detect shell from environment */
export function detectShell(flag?: string): ShellType {
  if (flag && flag !== 'auto' && VALID_SHELLS.includes(flag as ShellType)) {
    return flag as ShellType;
  }
  const shell = process.env['SHELL'] || '';
  if (shell.includes('fish')) return 'fish';
  if (shell.includes('pwsh') || process.platform === 'win32') return 'powershell';
  return 'bash';
}

/** Format a single env var export for the target shell (single-quoted to prevent injection) */
export function formatExportLine(shell: ShellType, key: string, value: string): string {
  switch (shell) {
    case 'fish':
      // Fish: single quotes prevent expansion; escape embedded single quotes with '\''
      return `set -gx ${key} '${value.replace(/'/g, "'\\''")}'`;
    case 'powershell':
      // PowerShell: single quotes prevent expansion; escape embedded single quotes with ''
      return `$env:${key} = '${value.replace(/'/g, "''")}'`;
    default:
      // Bash/zsh: single quotes prevent all expansion; handle embedded single quotes
      return `export ${key}='${value.replace(/'/g, "'\\''")}'`;
  }
}

/** Map Anthropic env vars to OpenAI-compatible format.
 * OPENAI_MODEL is included so tools that need it (e.g. OpenCode local provider)
 * can discover the model without additional configuration. */
export function transformToOpenAI(envVars: Record<string, string>): Record<string, string> {
  const baseUrl = envVars['ANTHROPIC_BASE_URL'] || '';
  const apiKey = envVars['ANTHROPIC_AUTH_TOKEN'] || envVars['ANTHROPIC_API_KEY'] || '';
  const model = envVars['ANTHROPIC_MODEL'] || '';
  const result: Record<string, string> = {};
  if (apiKey) result['OPENAI_API_KEY'] = apiKey;
  if (baseUrl) {
    result['OPENAI_BASE_URL'] = baseUrl;
    result['LOCAL_ENDPOINT'] = baseUrl;
  }
  if (model) result['OPENAI_MODEL'] = model;
  return result;
}

/** Parse --key=value or --key value style args */
export function parseFlag(args: string[], flag: string): string | undefined {
  // --flag=value style
  const eqMatch = args.find((a) => a.startsWith(`--${flag}=`));
  if (eqMatch) return eqMatch.split('=').slice(1).join('=');
  // --flag value style
  const idx = args.indexOf(`--${flag}`);
  if (idx >= 0 && idx + 1 < args.length && !args[idx + 1].startsWith('-')) {
    return args[idx + 1];
  }
  return undefined;
}

/** Find the first positional argument, skipping flags and their values */
export function findProfile(args: string[], flagsWithValues: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      // Skip flag values: --flag=value (single token) or --flag value (two tokens)
      const flagName = arg.replace(/^--/, '').split('=')[0];
      if (!arg.includes('=') && flagsWithValues.includes(flagName) && i + 1 < args.length) {
        i++; // skip next arg (the value)
      }
      continue;
    }
    return arg;
  }
  return undefined;
}

/** Show help for env command */
function showHelp(): void {
  console.log('');
  console.log(header('ccs env'));
  console.log('');
  console.log('  Export environment variables for third-party tool integration.');
  console.log('');

  console.log(subheader('Usage:'));
  console.log(`  ${color('ccs env', 'command')} <profile> [options]`);
  console.log('');

  console.log(subheader('Options:'));
  console.log(
    `  ${color('--format', 'command')} <fmt>    Output format: openai, anthropic, raw, claude-extension ${dim('(default: anthropic)')}`
  );
  console.log(
    `  ${color('--shell', 'command')} <sh>      Shell syntax: auto, bash/zsh, fish, powershell ${dim('(default: auto)')}`
  );
  console.log(
    `  ${color('--ide', 'command')} <host>      Claude extension host: ${VALID_EXTENSION_HOSTS.join(', ')} ${dim('(default: vscode)')}`
  );
  console.log(`  ${color('--help, -h', 'command')}        Show this help message`);
  console.log('');

  console.log(subheader('Formats:'));
  console.log(
    `  ${color('openai', 'command')}      OPENAI_API_KEY, OPENAI_BASE_URL, LOCAL_ENDPOINT`
  );
  console.log(
    `  ${color('anthropic', 'command')}   ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL`
  );
  console.log(`  ${color('raw', 'command')}         All effective env vars as-is`);
  console.log(
    `  ${color('claude-extension', 'command')}  Settings JSON snippet for the Claude IDE extension`
  );
  console.log('');

  console.log(subheader('Examples:'));
  console.log(
    `  $ ${color('eval $(ccs env gemini --format openai)', 'command')}     ${dim('# For OpenCode/Cursor')}`
  );
  console.log(
    `  $ ${color('ccs env codex --format anthropic', 'command')}          ${dim('# Anthropic vars')}`
  );
  console.log(
    `  $ ${color('ccs env glm --format raw', 'command')}                  ${dim('# All vars from settings')}`
  );
  console.log(
    `  $ ${color('ccs env agy --format openai --shell fish', 'command')}  ${dim('# Fish shell syntax')}`
  );
  console.log(
    `  $ ${color('ccs env work --format claude-extension --ide vscode', 'command')}  ${dim('# VS Code/Cursor snippet')}`
  );
  console.log(
    `  $ ${color('ccs env default --format claude-extension --ide windsurf', 'command')}  ${dim('# Clear/replace Windsurf env overrides')}`
  );
  console.log('');
  console.log(subheader('Notes:'));
  console.log(
    `  ${dim('- Use ccs persist <profile> for shared ~/.claude/settings.json setup when possible.')}`
  );
  console.log(
    `  ${dim('- claude-extension output prints JSON only; replace the full environmentVariables setting.')}`
  );
  console.log('');
}

/**
 * Handle env command
 * @param args - Command line arguments (after 'env')
 */
export async function handleEnvCommand(args: string[]): Promise<void> {
  await initUI();

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  // Parse profile (first positional argument, skipping flag values)
  const flagsWithValues = ['format', 'shell', 'ide'];
  const profile = findProfile(args, flagsWithValues);
  if (!profile) {
    console.error(
      fail('Usage: ccs env <profile> [--format openai|anthropic|raw|claude-extension]')
    );
    process.exit(1);
  }

  // Parse flags
  const formatStr = parseFlag(args, 'format') || 'anthropic';
  if (!VALID_FORMATS.includes(formatStr as OutputFormat)) {
    console.error(fail(`Invalid format: ${formatStr}. Use: ${VALID_FORMATS.join(', ')}`));
    process.exit(1);
  }
  const format = formatStr as OutputFormat;

  const shellStr = parseFlag(args, 'shell') || 'auto';
  if (!VALID_SHELL_INPUTS.includes(shellStr as (typeof VALID_SHELL_INPUTS)[number])) {
    console.error(fail(`Invalid shell: ${shellStr}. Use: ${VALID_SHELL_INPUTS.join(', ')}`));
    process.exit(1);
  }
  // zsh uses the same syntax as bash
  const shell = detectShell(shellStr === 'zsh' ? 'bash' : shellStr);
  const ide = (parseFlag(args, 'ide') || 'vscode') as ClaudeExtensionHost;
  if (!VALID_EXTENSION_HOSTS.includes(ide)) {
    console.error(fail(`Invalid IDE host: ${ide}. Use: ${VALID_EXTENSION_HOSTS.join(', ')}`));
    process.exit(1);
  }

  let envVars: Record<string, string>;
  try {
    const resolved = await resolveClaudeExtensionSetup(profile);
    if (resolved.warnings.length > 0) {
      for (const message of resolved.warnings) {
        console.error(warn(message));
      }
    }
    envVars = resolved.extensionEnv;
    if (format === 'claude-extension') {
      console.log(renderClaudeExtensionSettingsJson(resolved, ide));
      return;
    }
  } catch (error) {
    console.error(fail((error as Error).message));
    console.error(dim(`  Check ${getCcsDir()}/config.yaml or run ccs config for profile setup.`));
    process.exit(1);
  }

  if (Object.keys(envVars).length === 0) {
    console.error(warn(`No env vars resolved for profile '${profile}'.`));
    process.exit(1);
  }

  // Transform to requested format
  let output: Record<string, string>;
  switch (format) {
    case 'openai':
      output = transformToOpenAI(envVars);
      break;
    case 'anthropic': {
      // Filter to only Anthropic-relevant vars
      output = {};
      for (const [k, v] of Object.entries(envVars)) {
        if (k.startsWith('ANTHROPIC_')) {
          output[k] = v;
        }
      }
      break;
    }
    case 'raw':
      output = envVars;
      break;
  }

  // Guard: format transformation may filter out all vars
  if (Object.keys(output).filter((k) => output[k]).length === 0) {
    console.error(
      warn(`No ${format}-format vars found for profile '${profile}'. Try --format raw`)
    );
    process.exit(1);
  }

  // Output shell-formatted exports to stdout
  for (const [key, value] of Object.entries(output)) {
    if (!VALID_ENV_KEY.test(key)) {
      console.error(dim(`  Skipping invalid key: ${key}`));
      continue;
    }
    if (value) {
      console.log(formatExportLine(shell, key, value));
    }
  }
}
