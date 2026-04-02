import { handleApiCopyCommand } from './copy-command';
import { handleApiCreateCommand } from './create-command';
import { handleApiDiscoverCommand } from './discover-command';
import { handleApiExportCommand } from './export-command';
import { createApiCommandHandler, type ApiCommandDependencies } from './handler';
import { showApiCommandHelp, showUnknownApiCommand } from './help';
import { handleApiImportCommand } from './import-command';
import { handleApiListCommand } from './list-command';
import { handleApiRemoveCommand } from './remove-command';

export { createApiCommandHandler, type ApiCommandDependencies } from './handler';
export { parseApiCommandArgs } from './shared';

const DEFAULT_API_COMMAND_DEPENDENCIES: ApiCommandDependencies = {
  help: showApiCommandHelp,
  unknown: showUnknownApiCommand,
  create: handleApiCreateCommand,
  list: handleApiListCommand,
  discover: handleApiDiscoverCommand,
  copy: handleApiCopyCommand,
  export: handleApiExportCommand,
  import: handleApiImportCommand,
  remove: handleApiRemoveCommand,
};

export async function handleApiCommand(args: string[]): Promise<void> {
  await createApiCommandHandler(DEFAULT_API_COMMAND_DEPENDENCIES)(args);
}
