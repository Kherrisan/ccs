import { initUI, header, subheader, color, dim, ok, fail, infoBox } from '../../utils/ui';
import {
  applyCliproxyRoutingStrategy,
  normalizeCliproxyRoutingStrategy,
  readCliproxyRoutingState,
} from '../../cliproxy/routing-strategy';

function printStrategyGuide(): void {
  console.log(subheader('Routing Modes:'));
  console.log(`  ${color('round-robin', 'command')} Spread requests across matching accounts.`);
  console.log(`  ${dim('    Best when you want even usage and predictable distribution.')}`);
  console.log('');
  console.log(`  ${color('fill-first', 'command')} Drain one available account before moving on.`);
  console.log(
    `  ${dim('    Best when you want backup accounts to stay cold until the active one hits a limit.')}`
  );
  console.log('');
  console.log(
    dim(
      '  Default stays round-robin. CCS will not switch strategy from your account mix automatically.'
    )
  );
  console.log('');
}

export async function handleRoutingStatus(): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('CLIProxy Routing Strategy'));
  console.log('');

  const state = await readCliproxyRoutingState();
  console.log(`  Current: ${color(state.strategy, 'command')}`);
  console.log(`  Target:  ${color(state.target, 'info')}`);
  console.log(
    `  Source:  ${color(state.source === 'live' ? 'live CLIProxy' : 'saved startup default', 'info')}`
  );
  if (state.message) {
    console.log('');
    console.log(infoBox(state.message, state.reachable ? 'INFO' : 'WARNING'));
  }
  console.log('');
  printStrategyGuide();
}

export async function handleRoutingExplain(): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('CLIProxy Routing Guide'));
  console.log('');
  printStrategyGuide();
}

export async function handleRoutingSet(args: string[]): Promise<void> {
  const requested = normalizeCliproxyRoutingStrategy(args[0]);
  if (!requested) {
    await initUI();
    console.log('');
    console.log(fail('Invalid strategy. Use: round-robin or fill-first'));
    console.log('');
    printStrategyGuide();
    process.exitCode = 1;
    return;
  }

  await initUI();
  console.log('');
  console.log(header('Update CLIProxy Routing'));
  console.log('');

  const result = await applyCliproxyRoutingStrategy(requested);
  console.log(ok(`Routing strategy set to ${requested}`));
  console.log(`  Applied: ${color(result.applied, 'info')}`);
  console.log(`  Target:  ${color(result.target, 'info')}`);
  if (result.message) {
    console.log('');
    console.log(infoBox(result.message, result.reachable ? 'SUCCESS' : 'INFO'));
  }
  console.log('');
}
