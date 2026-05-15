/**
 * Shell Completion Command Handler
 *
 * Handle --shell-completion command for CCS.
 */

import { initUI, header, ok, fail, color } from '../utils/ui';
import {
  runCommandWithContract,
  type CommandExecutionContract,
} from './command-execution-contract';

type ShellTarget = 'bash' | 'zsh' | 'fish' | 'powershell' | null;

interface ShellCompletionParsedArgs {
  targetShell: ShellTarget;
  force: boolean;
}

interface ShellCompletionInstallResult {
  success: boolean;
  alreadyInstalled?: boolean;
  message?: string;
  reload?: string;
}

interface ShellCompletionInstallerLike {
  install(shell: ShellTarget, options: { force: boolean }): ShellCompletionInstallResult;
}

export function showShellCompletionHelp(writeLine: (line: string) => void = console.log): void {
  writeLine(header('Shell Completion'));
  writeLine('');
  writeLine(color('Usage:', 'info'));
  writeLine('  ccs --shell-completion              # Auto-detect shell and install');
  writeLine('  ccs --shell-completion --bash       # Install for bash');
  writeLine('  ccs --shell-completion --zsh        # Install for zsh');
  writeLine('  ccs --shell-completion --fish       # Install for fish');
  writeLine('  ccs --shell-completion --powershell # Install for PowerShell');
  writeLine('  ccs --shell-completion --force      # Reinstall/refresh the active shell setup');
  writeLine('');
  writeLine(color('Test:', 'info'));
  writeLine('  ccs <TAB>');
  writeLine('  ccs help <TAB>');
  writeLine('  ccs auth <TAB>');
  writeLine('');
}

export function parseShellCompletionArgs(args: string[]): ShellCompletionParsedArgs {
  let targetShell: ShellTarget = null;
  const force = args.includes('--force') || args.includes('-f');

  if (args.includes('--bash')) targetShell = 'bash';
  else if (args.includes('--zsh')) targetShell = 'zsh';
  else if (args.includes('--fish')) targetShell = 'fish';
  else if (args.includes('--powershell')) targetShell = 'powershell';

  return { targetShell, force };
}

export function createShellCompletionCommandContract(
  installer: ShellCompletionInstallerLike
): CommandExecutionContract<ShellCompletionParsedArgs, ShellCompletionInstallResult> {
  return {
    parse: parseShellCompletionArgs,
    validate: () => {
      // No validation at this stage to preserve existing behavior exactly.
    },
    execute: (parsed) => installer.install(parsed.targetShell, { force: parsed.force }),
    render: (result, context) => {
      if (result.alreadyInstalled && !context.parsedArgs.force) {
        console.log(ok('Shell completion already installed'));
        console.log(`    Use ${color('--force', 'warning')} to reinstall`);
        console.log('');
        return;
      }

      console.log(ok('Shell completion installed successfully!'));
      console.log('');
      console.log(result.message);
      console.log('');
      console.log(color('To activate:', 'info'));
      console.log(`  ${result.reload}`);
      console.log('');
      console.log(color('Then test:', 'info'));
      console.log('  ccs <TAB>        # See available profiles');
      console.log('  ccs auth <TAB>   # See auth subcommands');
      console.log('');
    },
  };
}

/**
 * Handle shell completion command
 */
export async function handleShellCompletionCommand(args: string[]): Promise<void> {
  await initUI();
  if (args.includes('--help') || args.includes('-h')) {
    showShellCompletionHelp();
    return;
  }

  try {
    const { ShellCompletionInstaller } = await import('../utils/shell-completion');
    console.log(header('Shell Completion Installer'));
    console.log('');
    const installer = new ShellCompletionInstaller();
    const contract = createShellCompletionCommandContract(installer);
    await runCommandWithContract(args, contract);
  } catch (error) {
    const err = error as Error;
    console.error(fail(`Error: ${err.message}`));
    console.error('');
    showShellCompletionHelp(console.error);
    process.exit(1);
  }
}
