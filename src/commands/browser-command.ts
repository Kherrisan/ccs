import * as browserUtils from '../utils/browser';
import { getBrowserConfig, mutateUnifiedConfig } from '../config/unified-config-loader';
import type { BrowserToolPolicy } from '../config/unified-config-types';
import { getCcsPathDisplay } from '../utils/config-manager';
import { getNodePlatformKey } from '../utils/browser/platform';
import { color, dim, header, initUI, subheader } from '../utils/ui';

type HelpWriter = (line: string) => void;
type BrowserLane = 'claude' | 'codex' | 'all';

function summarizeBrowserHealth(status: browserUtils.BrowserStatusPayload): {
  label: 'ready' | 'partial' | 'action required';
  exitCode: 0 | 1;
} {
  const claudeNeedsAttention = status.claude.enabled && status.claude.state !== 'ready';
  if (claudeNeedsAttention) {
    return { label: 'action required', exitCode: 1 };
  }

  if (status.codex.enabled && status.codex.state !== 'enabled') {
    return { label: 'partial', exitCode: 0 };
  }

  return { label: 'ready', exitCode: 0 };
}

function isBrowserPolicy(value: string): value is BrowserToolPolicy {
  return value === 'auto' || value === 'manual';
}

function parseBrowserLane(value: string | undefined): BrowserLane | undefined {
  if (value === 'claude' || value === 'codex' || value === 'all') {
    return value;
  }

  return undefined;
}

function writeCommandTable(writeLine: HelpWriter): void {
  writeLine(subheader('Commands'));
  writeLine(
    `  ${color('ccs browser setup', 'command')}                      Configure Claude Browser Attach and print the manual launch command`
  );
  writeLine(
    `  ${color('ccs browser status', 'command')}                     Show Claude attach and Codex browser readiness`
  );
  writeLine(
    `  ${color('ccs browser doctor', 'command')}                     Explain what is missing and how to fix it`
  );
  writeLine(
    `  ${color('ccs browser policy', 'command')}                     Show the saved browser exposure policy and safe defaults`
  );
  writeLine(
    `  ${color('ccs browser policy --all manual', 'command')}        Keep browser tooling hidden unless a launch uses --browser`
  );
  writeLine(
    `  ${color('ccs browser enable <claude|codex|all>', 'command')}  Turn a browser lane on without forcing auto-exposure`
  );
  writeLine(
    `  ${color('ccs browser disable <claude|codex|all>', 'command')} Turn a browser lane off`
  );
  writeLine('');
}

function writeIntro(writeLine: HelpWriter): void {
  writeLine('  Claude Browser Attach reuses a local Chrome session for Claude-target launches.');
  writeLine(
    '  Codex Browser Tools inject managed Playwright MCP overrides into Codex-target launches.'
  );
  writeLine(
    '  New installs, plus upgrades without saved browser settings, keep both lanes off by default; enable a lane and use `--browser` when you want browser access.'
  );
  writeLine('');
  writeLine(subheader('Launch Overrides'));
  writeLine(
    `  ${color('--browser', 'command')}     Force browser tooling on for the current launch when the lane is enabled`
  );
  writeLine(
    `  ${color('--no-browser', 'command')}  Suppress browser tooling for the current launch even when policy is auto`
  );
  writeLine('');
}

function writeLaunchPolicy(policy: BrowserToolPolicy, writeLine: HelpWriter): void {
  writeLine(`  Policy: ${browserUtils.describeBrowserPolicy(policy)}`);
  writeLine(`  Default launch behavior: ${browserUtils.describeDefaultBrowserExposure(policy)}`);
}

function writeClaudeStatus(
  status: browserUtils.BrowserStatusPayload['claude'],
  writeLine: HelpWriter,
  includeLaunchGuidance: boolean
): void {
  const userDataDirDisplay =
    status.effectiveUserDataDir === status.recommendedUserDataDir
      ? getCcsPathDisplay('browser', 'chrome-user-data')
      : status.effectiveUserDataDir;

  writeLine(subheader('Claude Browser Attach'));
  writeLine(`  State: ${status.state}`);
  writeLine(`  Enabled: ${status.enabled ? 'yes' : 'no'}`);
  writeLaunchPolicy(status.policy, writeLine);
  writeLine(`  Source: ${status.source}${status.overrideActive ? ' (env override active)' : ''}`);
  writeLine(`  User data dir: ${userDataDirDisplay}`);
  writeLine(`  DevTools port: ${status.devtoolsPort}`);
  writeLine(`  Managed MCP: ${status.managedMcpServerName}`);
  writeLine(`  Managed path: ${status.managedMcpServerPath}`);
  if (status.runtimeEnv?.CCS_BROWSER_DEVTOOLS_HTTP_URL) {
    writeLine(`  DevTools endpoint: ${status.runtimeEnv.CCS_BROWSER_DEVTOOLS_HTTP_URL}`);
  }
  writeLine(`  Detail: ${status.detail}`);
  writeLine(`  Next step: ${status.nextStep}`);
  if (includeLaunchGuidance && status.enabled && status.state !== 'ready') {
    const platform = getNodePlatformKey();
    writeLine(`  Launch command (${platform}): ${status.launchCommands[platform]}`);
  }
  writeLine('');
}

function writeCodexStatus(
  status: browserUtils.BrowserStatusPayload['codex'],
  writeLine: HelpWriter
): void {
  writeLine(subheader('Codex Browser Tools'));
  writeLine(`  State: ${status.state}`);
  writeLine(`  Enabled: ${status.enabled ? 'yes' : 'no'}`);
  writeLaunchPolicy(status.policy, writeLine);
  writeLine(`  Managed server: ${status.serverName}`);
  writeLine(`  Supports overrides: ${status.supportsConfigOverrides ? 'yes' : 'no'}`);
  writeLine(`  Codex binary: ${status.binaryPath || 'not detected'}`);
  if (status.version) {
    writeLine(`  Codex version: ${status.version}`);
  }
  writeLine(`  Detail: ${status.detail}`);
  writeLine(`  Next step: ${status.nextStep}`);
  writeLine('');
}

function writeSetupSummary(
  result: browserUtils.BrowserSetupResult,
  writeLine: HelpWriter,
  label: string
): void {
  writeLine(subheader('Overall'));
  writeLine(`  Command: ${label}`);
  writeLine(`  Result: ${result.ready ? 'ready' : 'action required'}`);
  writeLine(`  Config updated: ${result.configUpdated ? 'yes' : 'no'}`);
  writeLine(`  Created user-data dir: ${result.createdUserDataDir ? 'yes' : 'no'}`);
  writeLine(`  Browser MCP ready: ${result.mcpReady ? 'yes' : 'no'}`);
  if (result.notes.length > 0) {
    for (const note of result.notes) {
      writeLine(`  Note: ${note}`);
    }
  }
  writeLine('');
}

function writePolicySummary(writeLine: HelpWriter): void {
  const config = getBrowserConfig();

  writeLine(header('ccs browser policy'));
  writeLine('');
  writeIntro(writeLine);
  writeLine(
    '  New installs and upgrades without saved browser settings: both lanes start disabled and manual.'
  );
  writeLine('');
  writeLine(subheader('Claude Browser Attach'));
  writeLine(`  Enabled: ${config.claude.enabled ? 'yes' : 'no'}`);
  writeLaunchPolicy(config.claude.policy, writeLine);
  writeLine('');
  writeLine(subheader('Codex Browser Tools'));
  writeLine(`  Enabled: ${config.codex.enabled ? 'yes' : 'no'}`);
  writeLaunchPolicy(config.codex.policy, writeLine);
  writeLine('');
  writeLine(subheader('Examples'));
  writeLine(
    `  ${color('ccs browser policy --all manual', 'command')}  ${dim('# keep browser tooling hidden until a launch opts in')}`
  );
  writeLine(
    `  ${color('ccs glm --browser "open the site"', 'command')}  ${dim('# one-run browser opt-in')}`
  );
  writeLine(
    `  ${color('ccs glm --no-browser "summarize the docs"', 'command')}  ${dim('# one-run browser opt-out')}`
  );
  writeLine('');
}

function writeToggleSummary(
  subcommand: 'enable' | 'disable',
  lane: BrowserLane,
  writeLine: HelpWriter
) {
  const config = getBrowserConfig();
  const verb = subcommand === 'enable' ? 'enabled' : 'disabled';

  writeLine(header(`ccs browser ${subcommand}`));
  writeLine('');
  writeLine(`  Updated ${lane} browser lane${lane === 'all' ? 's' : ''}.`);
  writeLine(`  Browser lanes are now ${verb} as requested.`);
  if (subcommand === 'enable') {
    writeLine(
      '  Enabled lanes still respect policy, so browser access stays hidden until `--browser` while policy is manual.'
    );
  }
  writeLine('');
  writeLine(subheader('Current State'));
  writeLine(`  Claude enabled: ${config.claude.enabled ? 'yes' : 'no'}`);
  writeLine(`  Claude policy: ${config.claude.policy}`);
  writeLine(`  Codex enabled: ${config.codex.enabled ? 'yes' : 'no'}`);
  writeLine(`  Codex policy: ${config.codex.policy}`);
  writeLine('');
}

function updateBrowserPolicies(updates: {
  claude?: BrowserToolPolicy;
  codex?: BrowserToolPolicy;
}): void {
  mutateUnifiedConfig((config) => {
    const current = getBrowserConfig();
    config.browser = {
      claude: {
        enabled: current.claude.enabled,
        policy: updates.claude ?? current.claude.policy,
        user_data_dir: current.claude.user_data_dir,
        devtools_port: current.claude.devtools_port,
      },
      codex: {
        enabled: current.codex.enabled,
        policy: updates.codex ?? current.codex.policy,
      },
    };
  });
}

function updateBrowserEnabled(subcommand: 'enable' | 'disable', lane: BrowserLane): void {
  const nextEnabled = subcommand === 'enable';
  mutateUnifiedConfig((config) => {
    const current = getBrowserConfig();
    config.browser = {
      claude: {
        enabled: lane === 'all' || lane === 'claude' ? nextEnabled : current.claude.enabled,
        policy: current.claude.policy,
        user_data_dir: current.claude.user_data_dir,
        devtools_port: current.claude.devtools_port,
      },
      codex: {
        enabled: lane === 'all' || lane === 'codex' ? nextEnabled : current.codex.enabled,
        policy: current.codex.policy,
      },
    };
  });
}

function parsePolicyArgs(args: string[]): {
  claude?: BrowserToolPolicy;
  codex?: BrowserToolPolicy;
  error?: string;
} {
  let claude: BrowserToolPolicy | undefined;
  let codex: BrowserToolPolicy | undefined;

  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];

    if (!flag) {
      break;
    }

    if (flag !== '--all' && flag !== '--claude' && flag !== '--codex') {
      return { error: `Unknown browser policy argument: ${flag}` };
    }

    if (!value || value.startsWith('-')) {
      return { error: `${flag} requires a value: auto or manual.` };
    }

    if (!isBrowserPolicy(value)) {
      return { error: `${flag} must be one of: auto, manual.` };
    }

    if (flag === '--all' || flag === '--claude') {
      claude = value;
    }
    if (flag === '--all' || flag === '--codex') {
      codex = value;
    }
  }

  return { claude, codex };
}

function isHelpRequest(args: string[]): boolean {
  return args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h');
}

export async function showBrowserHelp(writeLine: HelpWriter = console.log): Promise<void> {
  await initUI();
  writeLine(header('CCS Browser Help'));
  writeLine('');
  writeIntro(writeLine);
  writeLine(subheader('Usage'));
  writeLine(`  ${color('ccs browser <setup|status|doctor|policy|enable|disable>', 'command')}`);
  writeLine(`  ${color('ccs help browser', 'command')}`);
  writeLine('');
  writeCommandTable(writeLine);
  writeLine(subheader('What Each Lane Does'));
  writeLine('  Claude Browser Attach expects a Chrome user-data dir and remote debugging port.');
  writeLine('  Codex Browser Tools depend on a Codex build that supports --config overrides.');
  writeLine(
    '  New installs and upgrades without saved browser settings keep both lanes off by default, so enabling a lane does not auto-expose browser tooling unless policy is set to auto.'
  );
  writeLine('');
  writeLine(subheader('Examples'));
  writeLine(
    `  ${color('ccs browser setup', 'command')}                   ${dim('# configure browser attach and print the manual launch command')}`
  );
  writeLine(
    `  ${color('ccs browser policy --all manual', 'command')}    ${dim('# keep browser tooling hidden until a launch opts in')}`
  );
  writeLine(
    `  ${color('ccs glm --browser "inspect app"', 'command')}    ${dim('# one-run browser opt-in')}`
  );
  writeLine(
    `  ${color('ccs glm --no-browser "summarize app"', 'command')} ${dim('# one-run browser opt-out')}`
  );
  writeLine(
    `  ${color('ccs config', 'command')}                         ${dim('# open Settings > Browser in the dashboard')}`
  );
  writeLine('');
}

export async function handleBrowserCommand(
  args: string[],
  writeLine: HelpWriter = console.log
): Promise<void> {
  if (isHelpRequest(args)) {
    await showBrowserHelp(writeLine);
    return;
  }

  const subcommand = args[0];
  if (subcommand === 'setup') {
    if (args.includes('--no-launch')) {
      await initUI();
      writeLine(color('`ccs browser setup` no longer supports `--no-launch`.', 'error'));
      writeLine(`  ${dim('Setup is config-only and already prints the manual launch command.')}`);
      writeLine('');
      process.exitCode = 1;
      return;
    }

    await initUI();
    const result = await browserUtils.runBrowserSetup();

    const label = 'ccs browser setup';
    writeLine(header(label));
    writeLine('');
    writeIntro(writeLine);
    writeSetupSummary(result, writeLine, label);
    writeClaudeStatus(result.status.claude, writeLine, !result.ready);
    writeCodexStatus(result.status.codex, writeLine);
    process.exitCode = result.ready ? 0 : 1;
    return;
  }

  if (subcommand === 'policy') {
    const parsed = parsePolicyArgs(args.slice(1));
    await initUI();

    if (parsed.error) {
      writeLine(color(parsed.error, 'error'));
      writeLine('');
      process.exitCode = 1;
      return;
    }

    if (parsed.claude || parsed.codex) {
      updateBrowserPolicies(parsed);
    }

    writePolicySummary(writeLine);
    return;
  }

  if (subcommand === 'enable' || subcommand === 'disable') {
    const lane = parseBrowserLane(args[1]);
    await initUI();

    if (!lane || args.length > 2) {
      writeLine(color(`Usage: ccs browser ${subcommand} <claude|codex|all>`, 'error'));
      writeLine('');
      process.exitCode = 1;
      return;
    }

    updateBrowserEnabled(subcommand, lane);
    writeToggleSummary(subcommand, lane, writeLine);
    return;
  }

  if (subcommand === 'doctor' && (args.includes('--fix') || args.includes('-f'))) {
    await initUI();
    writeLine(color('`ccs browser doctor` is read-only.', 'error'));
    writeLine(`  ${dim('Run `ccs browser setup` for the browser remediation flow.')}`);
    writeLine('');
    process.exitCode = 1;
    return;
  }

  if (subcommand !== 'status' && subcommand !== 'doctor') {
    await initUI();
    writeLine(color(`Unknown browser subcommand: ${subcommand}`, 'error'));
    writeLine('');
    writeLine(`  ${dim('Supported subcommands: setup, status, doctor, policy, enable, disable')}`);
    writeLine('');
    process.exitCode = 1;
    return;
  }

  await initUI();
  const status = await browserUtils.getBrowserStatus();

  writeLine(header(`ccs browser ${subcommand}`));
  writeLine('');
  writeIntro(writeLine);

  if (subcommand === 'doctor') {
    const summary = summarizeBrowserHealth(status);
    writeLine(subheader('Overall'));
    writeLine(`  Claude Browser Attach: ${status.claude.title}`);
    writeLine(`  Codex Browser Tools: ${status.codex.title}`);
    writeLine(`  Result: ${summary.label}`);
    writeLine('');
  }

  writeClaudeStatus(status.claude, writeLine, subcommand === 'doctor');
  writeCodexStatus(status.codex, writeLine);

  if (subcommand === 'doctor') {
    process.exitCode = summarizeBrowserHealth(status).exitCode;
  }
}
