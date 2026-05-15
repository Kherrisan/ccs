import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  scanDroidNativeUsageEntries,
  type DroidSqliteQuery,
} from '../../../src/web-server/usage/droid-native-usage-collector';

function writeDroidSessionFixture(
  tempRoot: string,
  options: {
    sessionId?: string;
    selector?: string;
    cwd?: string;
  } = {}
): string {
  const sessionId = options.sessionId ?? 'droid-session-1';
  const sessionDir = path.join(tempRoot, '.factory', 'sessions', 'demo-project');
  fs.mkdirSync(sessionDir, { recursive: true });

  fs.writeFileSync(
    path.join(sessionDir, `${sessionId}.jsonl`),
    `${JSON.stringify({
      type: 'session_start',
      id: sessionId,
      version: 2,
      cwd: options.cwd ?? '/tmp/droid-project',
    })}\n`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(sessionDir, `${sessionId}.settings.json`),
    JSON.stringify({
      model: options.selector ?? 'custom:Demo-0',
      providerLock: 'openai',
    }),
    'utf8'
  );

  return sessionId;
}

function writeDroidGlobalSettings(tempRoot: string): void {
  const factoryDir = path.join(tempRoot, '.factory');
  fs.mkdirSync(factoryDir, { recursive: true });
  fs.writeFileSync(
    path.join(factoryDir, 'settings.json'),
    JSON.stringify({
      customModels: [
        {
          displayName: 'Demo',
          model: 'gpt-4.1',
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1',
        },
        {
          displayName: 'CCS codex',
          model: 'gpt-5',
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1',
        },
      ],
    }),
    'utf8'
  );
  fs.writeFileSync(path.join(factoryDir, 'costs.db'), '', 'utf8');
}

describe('droid native usage collector', () => {
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-droid-native-'));
  });

  afterEach(() => {
    mock.restore();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('hydrates cost rows with session metadata and resolved custom model IDs', async () => {
    writeDroidGlobalSettings(tempRoot);
    const sessionId = writeDroidSessionFixture(tempRoot);

    const querySqliteJson: DroidSqliteQuery = async () => [
      {
        session_id: sessionId,
        timestamp: '2026-03-02T10:00:00.000Z',
        input_tokens: 120,
        output_tokens: 30,
      },
    ];

    const entries = await scanDroidNativeUsageEntries({
      env: { CCS_HOME: tempRoot },
      homeDir: tempRoot,
      querySqliteJson,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      sessionId,
      projectPath: '/tmp/droid-project',
      model: 'gpt-4.1',
      inputTokens: 120,
      outputTokens: 30,
      target: 'droid',
    });
  });

  it('skips CCS-managed selectors to avoid double counting CLIProxy-backed Droid runs', async () => {
    writeDroidGlobalSettings(tempRoot);
    const sessionId = writeDroidSessionFixture(tempRoot, { selector: 'custom:CCS-codex-1' });

    const querySqliteJson: DroidSqliteQuery = async () => [
      {
        session_id: sessionId,
        timestamp: '2026-03-02T10:00:00.000Z',
        input_tokens: 120,
        output_tokens: 30,
      },
    ];

    const entries = await scanDroidNativeUsageEntries({
      env: { CCS_HOME: tempRoot },
      homeDir: tempRoot,
      querySqliteJson,
    });

    expect(entries).toHaveLength(0);
  });

  it('surfaces sqlite failures instead of flattening them into an empty result', async () => {
    writeDroidGlobalSettings(tempRoot);
    writeDroidSessionFixture(tempRoot);

    const querySqliteJson: DroidSqliteQuery = async () => {
      throw new Error('sqlite blew up');
    };

    await expect(
      scanDroidNativeUsageEntries({
        env: { CCS_HOME: tempRoot },
        homeDir: tempRoot,
        querySqliteJson,
      })
    ).rejects.toThrow('sqlite blew up');
  });

  it('warns when cost rows are skipped because local session metadata is missing', async () => {
    writeDroidGlobalSettings(tempRoot);
    const sessionId = writeDroidSessionFixture(tempRoot);
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

    const querySqliteJson: DroidSqliteQuery = async () => [
      {
        session_id: 'missing-session',
        timestamp: '2026-03-02T09:00:00.000Z',
        input_tokens: 50,
        output_tokens: 10,
      },
      {
        session_id: sessionId,
        timestamp: '2026-03-02T10:00:00.000Z',
        input_tokens: 120,
        output_tokens: 30,
      },
    ];

    const entries = await scanDroidNativeUsageEntries({
      env: { CCS_HOME: tempRoot },
      homeDir: tempRoot,
      querySqliteJson,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.sessionId).toBe(sessionId);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipped 1 Droid native cost row(s) without local session metadata')
    );
  });
});
