import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanCodexNativeUsageEntries } from '../../../src/web-server/usage/codex-native-usage-collector';

function writeCodexRollout(
  baseDir: string,
  options: {
    sessionId?: string;
    modelProvider?: string;
    model?: string;
    cwd?: string;
  } = {}
): void {
  const sessionId = options.sessionId ?? 'codex-session-1';
  const rolloutDir = path.join(baseDir, 'sessions', '2026', '03', '02');
  const rolloutPath = path.join(rolloutDir, `rollout-${sessionId}.jsonl`);

  const lines = [
    JSON.stringify({
      timestamp: '2026-03-02T10:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: sessionId,
        timestamp: '2026-03-02T10:00:00.000Z',
        cwd: options.cwd ?? '/tmp/codex-project',
        cli_version: '0.126.0',
        source: 'cli',
        model_provider: options.modelProvider ?? 'openai',
      },
    }),
    JSON.stringify({
      timestamp: '2026-03-02T10:00:01.000Z',
      type: 'turn_context',
      payload: {
        turn_id: 'turn-1',
        cwd: options.cwd ?? '/tmp/codex-project',
        model: options.model ?? 'gpt-5',
        effort: 'high',
      },
    }),
    JSON.stringify({
      timestamp: '2026-03-02T10:00:02.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: null,
      },
    }),
    JSON.stringify({
      timestamp: '2026-03-02T10:05:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 20,
            output_tokens: 5,
            reasoning_output_tokens: 2,
            total_tokens: 127,
          },
          last_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 20,
            output_tokens: 5,
            reasoning_output_tokens: 2,
            total_tokens: 127,
          },
          model_context_window: 200000,
        },
      },
    }),
    JSON.stringify({
      timestamp: '2026-03-02T10:05:30.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 20,
            output_tokens: 5,
            reasoning_output_tokens: 2,
            total_tokens: 127,
          },
          last_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 20,
            output_tokens: 5,
            reasoning_output_tokens: 2,
            total_tokens: 127,
          },
          model_context_window: 200000,
        },
      },
    }),
    JSON.stringify({
      timestamp: '2026-03-02T10:10:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 150,
            cached_input_tokens: 30,
            output_tokens: 10,
            reasoning_output_tokens: 3,
            total_tokens: 193,
          },
          last_token_usage: {
            input_tokens: 50,
            cached_input_tokens: 10,
            output_tokens: 5,
            reasoning_output_tokens: 1,
            total_tokens: 66,
          },
          model_context_window: 200000,
        },
      },
    }),
  ];

  fs.mkdirSync(rolloutDir, { recursive: true });
  fs.writeFileSync(rolloutPath, `${lines.join('\n')}\n`, 'utf8');
}

describe('codex native usage collector', () => {
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-native-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('parses token_count events into raw usage entries and suppresses duplicates', async () => {
    writeCodexRollout(tempRoot);

    const entries = await scanCodexNativeUsageEntries({
      env: { CODEX_HOME: tempRoot },
      homeDir: tempRoot,
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      sessionId: 'codex-session-1',
      projectPath: '/tmp/codex-project',
      model: 'gpt-5',
      version: '0.126.0',
      target: 'codex',
      inputTokens: 100,
      cacheReadTokens: 20,
      outputTokens: 7,
    });
    expect(entries[1]).toMatchObject({
      inputTokens: 50,
      cacheReadTokens: 10,
      outputTokens: 6,
    });
  });

  it('skips cliproxy-backed codex sessions by default to avoid double counting', async () => {
    writeCodexRollout(tempRoot, { modelProvider: 'cliproxy' });

    const entries = await scanCodexNativeUsageEntries({
      env: { CODEX_HOME: tempRoot },
      homeDir: tempRoot,
    });

    expect(entries).toHaveLength(0);
  });
});
