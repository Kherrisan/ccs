import { copyApiProfile } from '../../api/services';
import { fail, info, initUI, ok, warn } from '../../utils/ui';
import { InteractivePrompt } from '../../utils/prompt';
import { exitOnApiCommandErrors, parseApiCommandArgs } from './shared';

export async function handleApiCopyCommand(args: string[]): Promise<void> {
  await initUI();
  const parsedArgs = parseApiCommandArgs(args, { maxPositionals: 2 });
  exitOnApiCommandErrors(parsedArgs.errors);

  const source = parsedArgs.positionals[0];
  let destination = parsedArgs.positionals[1];

  if (!source) {
    console.log(fail('Source profile is required. Usage: ccs api copy <source> <destination>'));
    process.exit(1);
  }

  if (!destination) {
    destination = await InteractivePrompt.input('Destination profile name');
  }

  if (!parsedArgs.yes) {
    const confirmed = await InteractivePrompt.confirm(
      `Copy profile "${source}" to "${destination}"?`,
      { default: true }
    );
    if (!confirmed) {
      console.log(info('Cancelled'));
      process.exit(0);
    }
  }

  const result = copyApiProfile(source, destination, {
    target: parsedArgs.target,
    force: parsedArgs.force,
  });
  if (!result.success) {
    console.log(fail(result.error || 'Failed to copy profile'));
    process.exit(1);
  }

  console.log(ok(`Profile copied: ${source} -> ${destination}`));
  result.warnings?.forEach((warningMessage) => console.log(warn(warningMessage)));
  console.log('');
}
