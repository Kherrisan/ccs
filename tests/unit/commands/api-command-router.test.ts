import { beforeEach, describe, expect, it } from 'bun:test';

import { createApiCommandHandler } from '../../../src/commands/api-command/handler';

let calls: string[] = [];

beforeEach(() => {
  calls = [];
});

function buildHandleApiCommand() {
  return createApiCommandHandler({
    help: async () => {
      calls.push('help');
    },
    unknown: async (command: string) => {
      calls.push(`unknown:${command}`);
    },
    create: async (args: string[]) => {
      calls.push(`create:${args.join(' ')}`);
    },
    list: async (args: string[]) => {
      calls.push(`list:${args.join(' ')}`);
    },
    discover: async (args: string[]) => {
      calls.push(`discover:${args.join(' ')}`);
    },
    copy: async (args: string[]) => {
      calls.push(`copy:${args.join(' ')}`);
    },
    export: async (args: string[]) => {
      calls.push(`export:${args.join(' ')}`);
    },
    import: async (args: string[]) => {
      calls.push(`import:${args.join(' ')}`);
    },
    remove: async (args: string[]) => {
      calls.push(`remove:${args.join(' ')}`);
    },
  });
}

describe('api-command router', () => {
  it('defaults to help when no subcommand is provided', async () => {
    const handleApiCommand = buildHandleApiCommand();

    await handleApiCommand([]);

    expect(calls).toEqual(['help']);
  });

  it('routes remove aliases through the named command dispatcher', async () => {
    const handleApiCommand = buildHandleApiCommand();

    await handleApiCommand(['rm', 'profile-a']);

    expect(calls).toEqual(['remove:profile-a']);
  });

  it('forwards list arguments to the handler for validation', async () => {
    const handleApiCommand = buildHandleApiCommand();

    await handleApiCommand(['list', 'unexpected']);

    expect(calls).toEqual(['list:unexpected']);
  });

  it('routes hardened subcommands through their handlers', async () => {
    const handleApiCommand = buildHandleApiCommand();

    await handleApiCommand(['discover', '--json']);
    await handleApiCommand(['copy', 'source', 'dest']);
    await handleApiCommand(['export', 'profile-a', '--out', 'backup.json']);
    await handleApiCommand(['import', 'bundle.json', '--force']);

    expect(calls).toEqual([
      'discover:--json',
      'copy:source dest',
      'export:profile-a --out backup.json',
      'import:bundle.json --force',
    ]);
  });

  it('delegates unknown commands to the shared unknown handler', async () => {
    const handleApiCommand = buildHandleApiCommand();

    await handleApiCommand(['bogus']);

    expect(calls).toEqual(['unknown:bogus']);
  });
});
