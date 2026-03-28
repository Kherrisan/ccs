import { dispatchNamedCommand, type NamedCommandRoute } from '../named-command-router';

type ApiCommandHandler = (args: string[]) => Promise<void>;
type ApiCommandHelpHandler = () => Promise<void>;
type ApiCommandUnknownHandler = (command: string) => Promise<void>;

export interface ApiCommandDependencies {
  help: ApiCommandHelpHandler;
  unknown: ApiCommandUnknownHandler;
  create: ApiCommandHandler;
  list: ApiCommandHandler;
  discover: ApiCommandHandler;
  copy: ApiCommandHandler;
  export: ApiCommandHandler;
  import: ApiCommandHandler;
  remove: ApiCommandHandler;
}

function createApiCommandRoutes(
  dependencies: ApiCommandDependencies
): readonly NamedCommandRoute[] {
  return [
    { name: 'create', handle: dependencies.create },
    { name: 'list', handle: dependencies.list },
    { name: 'discover', handle: dependencies.discover },
    { name: 'copy', handle: dependencies.copy },
    { name: 'export', handle: dependencies.export },
    { name: 'import', handle: dependencies.import },
    { name: 'remove', aliases: ['delete', 'rm'], handle: dependencies.remove },
  ];
}

/**
 * Factory for building an api-command handler with injectable dependencies.
 * Extracted from index.ts so tests can import without loading all subcommand modules.
 */
export function createApiCommandHandler(
  dependencies: ApiCommandDependencies
): (args: string[]) => Promise<void> {
  const routes = createApiCommandRoutes(dependencies);

  return async (args: string[]) => {
    await dispatchNamedCommand({
      args,
      routes,
      onHelp: dependencies.help,
      onUnknown: dependencies.unknown,
      allowEmptyHelp: true,
    });
  };
}
